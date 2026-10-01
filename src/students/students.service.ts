import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { SessionStatus } from '../generated/prisma/enums';
import { dayShort, parseTime, range } from '../planning/formats';
import { Planner } from '../planning/planner';
import { PlanningRepository } from '../planning/planning.repository';
import { PrismaService } from '../prisma/prisma.service';
import { toBlocks } from '../planning/dto/block.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { PaymentDto } from './dto/payment.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

/** Palette des nouveaux élèves (voir ServiceColors.palette dans ../weeko/lib/core/theme/app_colors.dart). */
export const STUDENT_PALETTE = [
  '#007475',
  '#9C3E60',
  '#676815',
  '#5759A6',
  '#925019',
  '#00755A',
];

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PlanningRepository,
  ) {}

  list() {
    return this.repo.read((p) =>
      p.state.students.map((id) => this.view(p, id)),
    );
  }

  async get(id: string) {
    const [student, legacy] = await Promise.all([
      this.repo.read((p) => ({
        ...this.view(p, id),
        history: this.history(p, id),
      })),
      this.prisma.historyEntry.findMany({
        where: { svc: id },
        orderBy: { position: 'asc' },
      }),
    ]);
    const imported = legacy.map(({ date, time, status, motif }) => ({
      sessionId: null,
      date,
      time,
      status,
      motif,
    }));
    return { ...student, history: [...student.history, ...imported] };
  }

  private view(p: Planner, id: string) {
    const s = p.state.services.get(id);
    if (!s || s.kind !== 'eleve')
      throw new NotFoundException(`Élève ${id} introuvable`);
    return { ...s, rule: p.ruleOf(s) };
  }

  /** Séances pointées, plus récentes d'abord. */
  private history(p: Planner, id: string) {
    return p.state.sessions
      .filter((s) => s.svc === id && s.status !== SessionStatus.prevue)
      .sort((a, b) => b.week - a.week || b.day - a.day || b.start - a.start)
      .map((s) => {
        const d = dayShort(s.week, s.day);
        return {
          sessionId: s.id,
          date: d[0].toUpperCase() + d.slice(1),
          time: range(s.start, s.end),
          status: s.status,
          motif: s.status === SessionStatus.manquee ? s.motif || null : null,
        };
      });
  }

  async create(dto: CreateStudentDto) {
    const name = dto.name.trim();
    const [eleves, last] = await Promise.all([
      this.prisma.service.findMany({
        where: { kind: 'eleve', deletedAt: null },
        select: { color: true },
      }),
      this.prisma.service.aggregate({ _max: { position: true } }),
    ]);
    const used = eleves.filter((e) =>
      STUDENT_PALETTE.includes(e.color.toUpperCase()),
    ).length;
    const created = await this.prisma.service.create({
      data: {
        ...this.fields({ count: 2, ...dto, name }),
        kind: 'eleve',
        color: STUDENT_PALETTE[used % STUDENT_PALETTE.length],
        position: (last._max.position ?? 0) + 1,
        fixed: { create: this.fixed(dto) },
        unavailable: { create: toBlocks(dto.unavailable ?? []) },
      },
    });
    return this.get(created.id);
  }

  async update(id: string, dto: UpdateStudentDto) {
    await this.ensure(id);
    await this.prisma.service.update({
      where: { id },
      data: {
        ...this.fields(dto),
        ...(dto.fixed && {
          fixed: { deleteMany: {}, create: this.fixed(dto) },
        }),
        ...(dto.unavailable && {
          unavailable: { deleteMany: {}, create: toBlocks(dto.unavailable) },
        }),
      },
    });
    return this.get(id);
  }

  async addPayment(id: string, dto: PaymentDto) {
    await this.ensure(id);
    return this.prisma.payment.create({
      data: {
        serviceId: id,
        amount: dto.amount,
        paidOn: dto.date,
        note: dto.note?.trim() ?? '',
      },
    });
  }

  /** Annulation douce d'un paiement (la ligne reste en base). */
  async removePayment(id: string, paymentId: string) {
    const { count } = await this.prisma.payment.updateMany({
      where: { id: paymentId, serviceId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!count)
      throw new NotFoundException(`Paiement ${paymentId} introuvable`);
  }

  /** Suppression douce : l'élève est archivé, ses séances et son historique restent en base. */
  async remove(id: string) {
    await this.ensure(id);
    await this.prisma.service.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async ensure(id: string) {
    const s = await this.prisma.service.findUnique({
      where: { id },
      select: { kind: true, deletedAt: true },
    });
    if (!s || s.kind !== 'eleve' || s.deletedAt)
      throw new NotFoundException(`Élève ${id} introuvable`);
  }

  /** Champs dérivés du formulaire (code, prénom, week-end, téléphone…). */
  private fields(
    dto: UpdateStudentDto,
  ): Prisma.ServiceUpdateInput & Prisma.ServiceCreateInput {
    const out: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const words = name.split(/\s+/);
      out.name = name;
      out.first = words[0];
      out.code = (
        words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)
      ).toUpperCase();
    }
    if (dto.count !== undefined) out.perWeek = dto.count;
    if (dto.exDays !== undefined) {
      out.exDays = [...dto.exDays].sort((a, b) => a - b);
      out.noWeekend = dto.exDays.includes(5) && dto.exDays.includes(6);
    }
    if (dto.notBefore !== undefined) out.notBefore = parseTime(dto.notBefore);
    if (dto.notAfter !== undefined) out.notAfter = parseTime(dto.notAfter);
    if (dto.phone !== undefined) {
      out.phone = dto.phone.replace(/\D/g, '');
      out.phoneLabel = dto.phone.trim() || 'numéro à compléter';
    }
    if (dto.rate !== undefined) out.rate = dto.rate;
    if (dto.billing !== undefined) out.billing = dto.billing;
    return out as Prisma.ServiceUpdateInput & Prisma.ServiceCreateInput;
  }

  private fixed(dto: UpdateStudentDto) {
    return (dto.fixed ?? []).map((f) => ({
      day: f.day,
      start: parseTime(f.time) ?? 1110,
    }));
  }
}
