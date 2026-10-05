import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { currentWeek } from './formats';
import { DueData, PlanState, Planner, PrepData, SessionData } from './planner';

type Tx = Prisma.TransactionClient;

/** Sans classe, ou classe non archivée. */
const LIVE_CLASS = { OR: [{ cls: null }, { klass: { deletedAt: null } }] };

const SESSION_FIELDS = [
  'week',
  'day',
  'start',
  'end',
  'svc',
  'cls',
  'status',
  'kind',
  'dueId',
  'who',
  'motif',
  'noRedo',
  'fixed',
  'base',
] as const satisfies readonly (keyof SessionData)[];

const DUE_FIELDS = [
  'svc',
  'cls',
  'from',
  'who',
  'motif',
  'placedSession',
  'done',
  'sourceId',
] as const satisfies readonly (keyof DueData)[];

interface Snapshot {
  sessions: Map<string, SessionData>;
  dues: Map<string, DueData>;
  preps: Map<number, string>;
  generated: Set<number>;
}

function pick<T, K extends keyof T>(o: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = o[k];
  return out;
}

function same<T>(a: T, b: T, keys: readonly (keyof T)[]) {
  return keys.every((k) => a[k] === b[k]);
}

/**
 * Charge l'état complet du planning (un seul répétiteur, peu de données),
 * le passe au Planner, puis persiste uniquement ce qui a changé.
 */
@Injectable()
export class PlanningRepository {
  constructor(private readonly prisma: PrismaService) {}

  async read<T>(fn: (planner: Planner) => T): Promise<T> {
    return fn(new Planner(await this.load(this.prisma)));
  }

  async mutate<T>(fn: (planner: Planner) => T): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const state = await this.load(tx);
        const before = this.snapshot(state);
        const result = fn(new Planner(state));
        await this.commit(tx, before, state);
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async load(db: Tx): Promise<PlanState> {
    // Requêtes l'une après l'autre : une transaction n'a qu'une connexion.
    const blockFields = {
      select: { day: true, start: true, end: true, kind: true },
      orderBy: [{ day: 'asc' as const }, { start: 'asc' as const }],
    };
    // Élèves archivés (suppression douce) : invisibles pour le planning.
    const services = await db.service.findMany({
      where: { deletedAt: null },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { fixed: { orderBy: { day: 'asc' } }, unavailable: blockFields },
      omit: { createdAt: true, updatedAt: true },
    });
    // Classes archivées (ou de sites archivés) : invisibles, avec leurs séances.
    const classes = await db.schoolClass.findMany({
      where: { deletedAt: null, site: { deletedAt: null } },
      omit: { deletedAt: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    // Séances annulées : invisibles pour le planning.
    const sessions = await db.session.findMany({
      where: { service: { deletedAt: null }, cancelledAt: null, ...LIVE_CLASS },
      omit: { cancelledAt: true },
      orderBy: [{ week: 'asc' }, { day: 'asc' }, { start: 'asc' }],
    });
    const dues = await db.due.findMany({
      where: { service: { deletedAt: null }, ...LIVE_CLASS },
      orderBy: { createdAt: 'asc' },
      omit: { createdAt: true },
    });
    const preps = await db.weekPrep.findMany();
    const baseSlots = await db.baseSlot.findMany({
      where: { service: { deletedAt: null }, ...LIVE_CLASS },
      orderBy: [{ day: 'asc' }, { start: 'asc' }],
    });
    const settings = await db.settings.findUnique({ where: { id: 1 } });
    const tutorBlocks = await db.unavailability.findMany({
      where: { serviceId: null },
      ...blockFields,
    });
    return {
      services: new Map(
        services.map((s) => [
          s.id,
          { ...s, fixed: s.fixed.map((f) => ({ day: f.day, start: f.start })) },
        ]),
      ),
      classes: new Map(classes.map((c) => [c.id, c])),
      students: services.filter((s) => s.kind === 'eleve').map((s) => s.id),
      sessions,
      dues,
      preps: new Map(
        preps.map((p) => [
          p.week,
          {
            off: p.off,
            counts: (p.counts ?? {}) as PrepData['counts'],
            times: (p.times ?? {}) as unknown as PrepData['times'],
            changes: (p.changes ?? {}) as PrepData['changes'],
            include: (p.include ?? {}) as PrepData['include'],
          },
        ]),
      ),
      generated: new Set(preps.filter((p) => p.generated).map((p) => p.week)),
      baseSlots,
      travel: settings?.travel ?? false,
      tutorUnavailable: tutorBlocks,
      currentWeek: currentWeek(),
      cancelled: new Set(),
    };
  }

  private snapshot(s: PlanState): Snapshot {
    return {
      sessions: new Map(s.sessions.map((x) => [x.id, { ...x }])),
      dues: new Map(s.dues.map((x) => [x.id, { ...x }])),
      preps: new Map([...s.preps].map(([w, p]) => [w, JSON.stringify(p)])),
      generated: new Set(s.generated),
    };
  }

  private async commit(tx: Tx, before: Snapshot, after: PlanState) {
    const sessionIds = new Set(after.sessions.map((s) => s.id));
    const goneSessions = [...before.sessions.keys()].filter(
      (id) => !sessionIds.has(id),
    );
    // Annulées : archivées (cancelledAt). Autres (semaine régénérée) : remplacées.
    const cancelled = goneSessions.filter((id) => after.cancelled.has(id));
    const replaced = goneSessions.filter((id) => !after.cancelled.has(id));
    if (cancelled.length)
      await tx.session.updateMany({
        where: { id: { in: cancelled } },
        data: { cancelledAt: new Date() },
      });
    if (replaced.length)
      await tx.session.deleteMany({ where: { id: { in: replaced } } });
    const newSessions = after.sessions.filter(
      (s) => !before.sessions.has(s.id),
    );
    if (newSessions.length) await tx.session.createMany({ data: newSessions });
    for (const s of after.sessions) {
      const b = before.sessions.get(s.id);
      if (b && !same(b, s, SESSION_FIELDS)) {
        await tx.session.update({
          where: { id: s.id },
          data: pick(s, SESSION_FIELDS),
        });
      }
    }

    // Séances dues (créées une par une pour garder l'ordre de createdAt)
    const dueIds = new Set(after.dues.map((u) => u.id));
    const goneDues = [...before.dues.keys()].filter((id) => !dueIds.has(id));
    if (goneDues.length)
      await tx.due.deleteMany({ where: { id: { in: goneDues } } });
    for (const u of after.dues) {
      const b = before.dues.get(u.id);
      if (!b) await tx.due.create({ data: u });
      else if (!same(b, u, DUE_FIELDS))
        await tx.due.update({ where: { id: u.id }, data: pick(u, DUE_FIELDS) });
    }

    for (const [week, p] of after.preps) {
      const generated = after.generated.has(week);
      if (
        before.preps.get(week) === JSON.stringify(p) &&
        before.generated.has(week) === generated
      )
        continue;
      const data = {
        off: p.off,
        counts: p.counts,
        times: p.times as unknown as Prisma.InputJsonValue,
        changes: p.changes,
        include: p.include,
        generated,
      };
      await tx.weekPrep.upsert({
        where: { week },
        create: { week, ...data },
        update: data,
      });
    }
  }
}
