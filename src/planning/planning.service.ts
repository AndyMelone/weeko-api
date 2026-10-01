import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  dateOf,
  dayLong,
  dayShort,
  range,
  weekNum,
  weekRange,
} from './formats';
import { CancelDto } from './dto/cancel.dto';
import { PlaceDto } from './dto/place.dto';
import { SlotDto } from './dto/slot.dto';
import { PointerDto } from './dto/pointer.dto';
import { UpdatePrepDto } from './dto/update-prep.dto';
import { WeekSessionDto } from './dto/generate.dto';
import { SessionKind } from '../generated/prisma/enums';
import { Planner, RattItem, SessionData, Slot, WeekChange } from './planner';
import { PlanningRepository } from './planning.repository';
import { PrismaService } from '../prisma/prisma.service';

const WEEK_CHANGES: WeekChange[] = ['normal', 'une', 'absent'];

/** Début de la séance (UTC = heure d'Abidjan). */
function startsAt(s: { week: number; day: number; start: number }) {
  return new Date(dateOf(s.week, s.day).getTime() + s.start * 60_000);
}

@Injectable()
export class PlanningService {
  constructor(
    private readonly repo: PlanningRepository,
    private readonly prisma: PrismaService,
  ) {}
  /** Tout l'état, pour le premier chargement de l'app. */
  async state() {
    const [state, legacy, payments, settings] = await Promise.all([
      this.repo.read((p) => ({
        services: [...p.state.services.values()],
        classes: [...p.state.classes.values()],
        students: p.state.students,
        sessions: p.state.sessions,
        dues: p.state.dues,
        preps: Object.fromEntries(p.state.preps),
        generated: [...p.state.generated].sort((a, b) => a - b),
        todoCount: p.todoCount(),
        settings: {
          travel: p.state.travel,
          unavailable: p.state.tutorUnavailable,
        },
      })),
      this.prisma.historyEntry.findMany({
        where: { service: { deletedAt: null } },
        orderBy: [{ svc: 'asc' }, { position: 'asc' }],
      }),
      this.prisma.payment.findMany({
        where: { deletedAt: null, service: { deletedAt: null } },
        orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          serviceId: true,
          amount: true,
          paidOn: true,
          note: true,
        },
      }),
      this.prisma.settings.findUnique({ where: { id: 1 } }),
    ]);
    // Historique importé, par élève (les séances pointées sont dans sessions).
    const history: Record<
      string,
      { date: string; time: string; status: string; motif: string | null }[]
    > = {};
    for (const { svc, date, time, status, motif } of legacy) {
      (history[svc] ??= []).push({ date, time, status, motif });
    }
    return {
      ...state,
      settings: {
        ...state.settings,
        calendarToken: settings?.calendarToken ?? null,
      },
      history,
      payments,
    };
  }

  week(w: number) {
    return this.repo.read((p) => this.weekView(p, w));
  }

  private weekView(p: Planner, w: number) {
    return {
      week: w,
      number: weekNum(w),
      range: weekRange(w),
      generated: p.state.generated.has(w),
      prep: p.prepOf(w),
      sessions: this.sorted(p.week(w)).map((s) => this.sessionView(p, s)),
    };
  }

  sessions(week?: number) {
    return this.repo.read((p) =>
      this.sorted(week === undefined ? p.state.sessions : p.week(week)).map(
        (s) => this.sessionView(p, s),
      ),
    );
  }

  session(id: string) {
    return this.repo.read((p) => this.sessionView(p, this.findSession(p, id)));
  }

  private sorted(ss: SessionData[]) {
    return [...ss].sort(
      (a, b) => a.week - b.week || a.day - b.day || a.start - b.start,
    );
  }

  private sessionView(p: Planner, s: SessionData) {
    return {
      ...s,
      title: p.titleOf(s),
      date: dateOf(s.week, s.day).toISOString().slice(0, 10),
      dayLabel: dayLong(s.week, s.day),
      time: range(s.start, s.end),
    };
  }

  private findSession(p: Planner, id: string) {
    const s = p.sessionById(id);
    if (!s) throw new NotFoundException(`Séance ${id} introuvable`);
    return s;
  }
  updatePrep(w: number, dto: UpdatePrepDto) {
    return this.repo.mutate((p) => {
      for (const [c, n] of Object.entries(dto.counts ?? {})) {
        if (!p.state.classes.has(c))
          throw new BadRequestException(`Classe inconnue : ${c}`);
        if (!Number.isInteger(n) || n < 0 || n > 7)
          throw new BadRequestException(`counts.${c} : entier 0–7`);
      }
      for (const [c, ts] of Object.entries(dto.times ?? {})) {
        if (!p.state.classes.has(c))
          throw new BadRequestException(`Classe inconnue : ${c}`);
        if (!Array.isArray(ts) || ts.length > 7)
          throw new BadRequestException(`times.${c} : 0 à 7 créneaux`);
        for (const t of ts) {
          const ok =
            t != null &&
            Number.isInteger(t.day) &&
            t.day >= 0 &&
            t.day <= 6 &&
            Number.isInteger(t.start) &&
            Number.isInteger(t.end) &&
            t.start >= 0 &&
            t.start < t.end &&
            t.end <= 1440;
          if (!ok)
            throw new BadRequestException(
              `times.${c} : { day 0–6, start < end en minutes }`,
            );
        }
      }
      for (const [k, v] of Object.entries(dto.changes ?? {})) {
        if (!p.state.students.includes(k))
          throw new BadRequestException(`Élève inconnu : ${k}`);
        if (!WEEK_CHANGES.includes(v))
          throw new BadRequestException(
            `changes.${k} : ${WEEK_CHANGES.join(' | ')}`,
          );
      }
      for (const [d, v] of Object.entries(dto.include ?? {})) {
        if (typeof v !== 'boolean')
          throw new BadRequestException(`include.${d} : booléen`);
      }
      p.updatePrep(w, dto);
      return this.weekView(p, w);
    });
  }

  /** Aperçu de la génération : même calcul, rien n'est enregistré. */
  preview(w: number) {
    return this.repo.read((p) => {
      const message = p.generate(w);
      return { message, ...this.weekView(p, w) };
    });
  }

  /** Génère la semaine, ou enregistre l'aperçu modifié dans l'app ([edited]). */
  generate(w: number, edited?: WeekSessionDto[]) {
    return this.repo.mutate((p) => {
      if (edited) this.checkWeek(p, edited);
      const message = edited ? p.applyWeek(w, edited) : p.generate(w);
      return { message, ...this.weekView(p, w) };
    });
  }

  private checkWeek(p: Planner, list: WeekSessionDto[]) {
    const ids = new Set<string>();
    const days = new Set<string>();
    for (const s of list) {
      // Règle bloquante : jamais deux séances le même jour pour un élève.
      if (p.state.services.get(s.svc)?.kind === 'eleve') {
        const key = `${s.svc}:${s.day}`;
        if (days.has(key))
          throw new BadRequestException(
            `${p.svc(s.svc).first} aurait deux séances le même jour`,
          );
        days.add(key);
      }
      if (ids.has(s.id))
        throw new BadRequestException(`Séance en double : ${s.id}`);
      ids.add(s.id);
      if (s.end <= s.start)
        throw new BadRequestException(
          'L’heure de fin doit suivre l’heure de début',
        );
      if (!p.state.services.has(s.svc))
        throw new BadRequestException(`Élève ou site inconnu : ${s.svc}`);
      if (s.cls != null && p.state.classes.get(s.cls)?.siteId !== s.svc)
        throw new BadRequestException(`Classe inconnue : ${s.cls}`);
      if (
        s.kind === SessionKind.rattrapage &&
        !p.state.dues.some((u) => u.id === s.dueId && u.svc === s.svc)
      )
        throw new BadRequestException(
          `Séance à rattraper inconnue : ${s.dueId}`,
        );
    }
  }
  pointer(id: string, dto: PointerDto) {
    return this.repo.mutate((p) => {
      const s = this.findSession(p, id);
      if (!dto.missed && startsAt(s) > new Date()) {
        throw new BadRequestException(
          'Séance pas encore commencée : impossible de la marquer faite',
        );
      }
      const message = p.savePointer(id, dto);
      return { message, session: this.sessionView(p, p.sessionById(id)!) };
    });
  }
  move(id: string, to: SlotDto) {
    this.checkSlot(to);
    return this.repo.mutate((p) => {
      this.findSession(p, id);
      const message = p.moveSession(id, { ...to });
      if (!message)
        throw new BadRequestException(
          'Séance déjà pointée : impossible de la déplacer',
        );
      return { message, session: this.sessionView(p, p.sessionById(id)!) };
    });
  }

  cancelSession(id: string, dto: CancelDto) {
    return this.repo.mutate((p) => {
      this.findSession(p, id);
      const message = p.cancelSession(id, dto);
      if (!message)
        throw new BadRequestException(
          'Séance déjà pointée : impossible de l’annuler',
        );
      return { message };
    });
  }

  private checkSlot(s: SlotDto) {
    if (s.end <= s.start)
      throw new BadRequestException(
        'L’heure de fin doit suivre l’heure de début',
      );
  }

  rattrapages() {
    return this.repo.read((p) => ({
      todoCount: p.todoCount(),
      items: p.items(),
    }));
  }

  proposals(key: string) {
    return this.repo.read((p) =>
      p.proposals(this.findItem(p, key)).map((s, i) => this.slotView(s, i)),
    );
  }

  day(key: string, day: number) {
    return this.repo.read((p) => {
      const it = this.findItem(p, key);
      const slot = p.slots(it.svc, { onlyDay: day, w: it.week })[0];
      return slot
        ? { slot: this.slotView(slot), reason: null }
        : { slot: null, reason: p.reason(it, day) };
    });
  }

  place(key: string, dto: PlaceDto) {
    return this.repo.mutate((p) => {
      const it = this.findItem(p, key);
      if (it.placed != null) throw new BadRequestException('Déjà placé');
      if (dto.slot) this.checkSlot(dto.slot);
      const choice = dto.slot
        ? { slot: { ...dto.slot } }
        : dto.proposal !== undefined
          ? { proposal: dto.proposal }
          : { day: dto.day! };
      const res = p.place(it, choice);
      if (!res)
        throw new BadRequestException('Aucun créneau possible pour ce choix');
      return {
        message: res.message,
        session: this.sessionView(p, res.session),
      };
    });
  }

  /** Annule un rattrapage placé et remet la séance due dans les rattrapages. */
  cancel(key: string) {
    return this.repo.mutate((p) => {
      const it = this.findItem(p, key);
      if (!it.due)
        throw new BadRequestException(
          'Seul un rattrapage placé peut être annulé',
        );
      const message = p.cancelRattrapage(it.due.id);
      if (!message) {
        throw new BadRequestException(
          'Rien à annuler : pas placé, ou séance déjà pointée',
        );
      }
      return { message };
    });
  }

  private findItem(p: Planner, key: string): RattItem {
    const it = p.item(key);
    if (!it) throw new NotFoundException(`Rattrapage ${key} introuvable`);
    return it;
  }

  private slotView(s: Slot, index?: number) {
    return {
      ...(index !== undefined && { index }),
      ...s,
      label: `${dayShort(s.week, s.day)} · ${range(s.start, s.end)}`,
    };
  }
  /** Séance au format .ics (fuseau Africa/Abidjan, rappel 45 min avant). */
  ics(id: string) {
    return this.repo.read((p) => {
      const s = this.findSession(p, id);
      const dt = dateOf(s.week, s.day);
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = (m: number) =>
        `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`;
      const site = p.svc(s.svc).name;
      const title = `${s.kind === 'rattrapage' ? 'Rattrapage · ' : ''}${p.titleOf(s)}${s.cls != null ? ` · Succès Group ${site}` : ''}`;
      const body = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Repetiteur//FR',
        'BEGIN:VEVENT',
        `UID:${s.id}@repetiteur`,
        `DTSTART;TZID=Africa/Abidjan:${stamp(s.start)}`,
        `DTEND;TZID=Africa/Abidjan:${stamp(s.end)}`,
        `SUMMARY:${title}`,
        `LOCATION:${s.cls != null ? `Succès Group ${site}` : 'Domicile de l’élève'}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT45M',
        'ACTION:DISPLAY',
        `DESCRIPTION:${title}`,
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
      const fileName = `${title.replace(/[^\wÀ-ÿ -]/g, '').trim()}.ics`;
      return { body, fileName };
    });
  }
}
