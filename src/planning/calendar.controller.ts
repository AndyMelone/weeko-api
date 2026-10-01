import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/public.decorator';
import { SessionStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { currentWeek, dateOf } from './formats';
import { PlanningRepository } from './planning.repository';

/** « 20261005T153000Z » (Abidjan = UTC). */
function stamp(week: number, day: number, minutes: number) {
  return new Date(dateOf(week, day).getTime() + minutes * 60_000)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Échappement des textes iCalendar. */
const esc = (s: string) =>
  s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/**
 * Flux d'abonnement agenda (Apple Calendrier, Google Agenda, Outlook).
 * Public, protégé par le jeton secret de l'URL (les agendas n'envoient pas d'en-tête).
 */
@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PlanningRepository,
  ) {}

  @Public()
  @Get(':file')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async feed(@Param('file') file: string) {
    const token = file.replace(/\.ics$/, '');
    const s = await this.prisma.settings.findUnique({ where: { id: 1 } });
    const expected = s?.calendarToken;
    if (
      !expected ||
      token.length !== expected.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    ) {
      throw new NotFoundException();
    }
    return this.repo.read((p) => {
      const from = currentWeek() - 8;
      const now = stamp(currentWeek(), 0, 0);
      const events = p.state.sessions
        .filter((x) => x.week >= from)
        .map((x) => {
          const site = p.svc(x.svc).name;
          const title = `${x.kind === 'rattrapage' ? 'Rattrapage · ' : ''}${p.titleOf(x)}${x.cls != null ? ` · Succès Group ${site}` : ''}`;
          return [
            'BEGIN:VEVENT',
            `UID:${x.id}@weeko`,
            `DTSTAMP:${now}`,
            `DTSTART:${stamp(x.week, x.day, x.start)}`,
            `DTEND:${stamp(x.week, x.day, x.end)}`,
            `SUMMARY:${esc(title)}`,
            `LOCATION:${esc(x.cls != null ? `Succès Group ${site}` : 'Domicile de l’élève')}`,
            ...(x.status === SessionStatus.manquee ? ['STATUS:CANCELLED'] : []),
            'BEGIN:VALARM',
            'TRIGGER:-PT45M',
            'ACTION:DISPLAY',
            `DESCRIPTION:${esc(title)}`,
            'END:VALARM',
            'END:VEVENT',
          ].join('\r\n');
        });
      return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Weeko//FR',
        'CALSCALE:GREGORIAN',
        'X-WR-CALNAME:Weeko',
        'X-WR-TIMEZONE:Africa/Abidjan',
        'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
        'X-PUBLISHED-TTL:PT1H',
        ...events,
        'END:VCALENDAR',
      ].join('\r\n');
    });
  }
}
