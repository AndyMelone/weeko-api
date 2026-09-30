// Données de démo de l'app mobile (../weeko/lib/data/demo_data.dart) :
// semaine du 5 au 11 octobre 2026. Ids identiques à ceux de l'app.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { SessionStatus } from '../generated/prisma/enums';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const services = [
  {
    id: 'ange',
    name: 'Ange Kra',
    first: 'Ange',
    code: 'AK',
    color: '#9B4630',
    kind: 'eleve',
    perWeek: 2,
    phone: '2250700000001',
    phoneLabel: '+225 07 00 00 00 01',
  },
  {
    id: 'adje',
    name: 'Adjé',
    first: 'Adjé',
    code: 'AD',
    color: '#337344',
    kind: 'eleve',
    perWeek: 2,
    phone: '2250700000002',
    phoneLabel: '+225 07 00 00 00 02',
  },
  {
    id: 'sondo',
    name: 'Sondo',
    first: 'Sondo',
    code: 'SO',
    color: '#814A8D',
    kind: 'eleve',
    perWeek: 2,
    phone: '2250700000003',
    phoneLabel: '+225 07 00 00 00 03',
  },
  {
    id: 'ma',
    name: 'Mamie Adjoua',
    first: 'Mamie Adjoua',
    code: 'MA',
    color: '#326893',
    kind: 'site',
  },
  {
    id: 'ng',
    name: 'Niangon',
    first: 'Niangon',
    code: 'NG',
    color: '#8A5F18',
    kind: 'site',
  },
] as const;

const classes = [
  { id: 'c1', name: 'Terminale D', siteId: 'ma', defaultCount: 2 },
  { id: 'c2', name: 'Terminale C', siteId: 'ma', defaultCount: 1 },
  { id: 'c5', name: 'Terminale A', siteId: 'ma', defaultCount: 0 },
  { id: 'c3', name: 'Terminale D', siteId: 'ng', defaultCount: 2 },
  { id: 'c4', name: 'Terminale C', siteId: 'ng', defaultCount: 0 },
  { id: 'c6', name: 'Terminale A', siteId: 'ng', defaultCount: 0 },
];

/** Planning de base (w = 0). */
const base = [
  { id: 's1', day: 0, start: 930, end: 1050, svc: 'adje' },
  { id: 's2', day: 0, start: 1080, end: 1230, svc: 'ma', cls: 'c1' },
  { id: 's3', day: 1, start: 930, end: 1050, svc: 'ange' },
  { id: 's4', day: 1, start: 1060, end: 1180, svc: 'sondo' },
  {
    id: 's5',
    day: 3,
    start: 930,
    end: 1050,
    svc: 'sondo',
    kind: 'rattrapage',
    dueId: 'd1',
  },
  { id: 's6', day: 3, start: 1060, end: 1180, svc: 'adje' },
  { id: 's7', day: 4, start: 1080, end: 1230, svc: 'ng', cls: 'c3' },
  { id: 's8', day: 5, start: 480, end: 720, svc: 'ma', cls: 'c1', fixed: true },
  { id: 's9', day: 5, start: 870, end: 990, svc: 'sondo' },
  { id: 's10', day: 6, start: 540, end: 660, svc: 'ange', fixed: true },
  { id: 's11', day: 6, start: 840, end: 1080, svc: 'ng', cls: 'c3' },
] as const;

const history: Record<
  string,
  { date: string; time: string; status: SessionStatus; motif?: string }[]
> = {
  ange: [
    { date: 'Dim. 4 oct.', time: '9h–11h', status: 'faite' },
    { date: 'Mer. 30 sept.', time: '18h30–20h30', status: 'faite' },
    {
      date: 'Lun. 28 sept.',
      time: '15h30–17h30',
      status: 'manquee',
      motif: 'Élève absent · malade',
    },
    { date: 'Jeu. 24 sept.', time: '15h30–17h30', status: 'faite' },
  ],
  adje: [
    { date: 'Ven. 2 oct.', time: '16h30–18h30', status: 'faite' },
    { date: 'Mar. 29 sept.', time: '15h30–17h30', status: 'faite' },
    { date: 'Ven. 25 sept.', time: '16h30–18h30', status: 'faite' },
  ],
  sondo: [
    { date: 'Sam. 3 oct.', time: '14h30–16h30', status: 'faite' },
    {
      date: 'Jeu. 1 oct.',
      time: '15h30–17h30',
      status: 'manquee',
      motif: 'Moi absent · réunion tardive au bureau',
    },
    { date: 'Mar. 29 sept.', time: '17h40–19h40', status: 'faite' },
    { date: 'Sam. 26 sept.', time: '14h30–16h30', status: 'faite' },
  ],
};

async function main() {
  await prisma.$transaction(async (tx) => {
    // Remise à zéro complète (les suppressions en cascade suivent les services).
    await tx.weekPrep.deleteMany();
    await tx.settings.deleteMany();
    await tx.service.deleteMany();

    await tx.service.createMany({
      data: services.map((s, position) => ({ ...s, position })),
    });
    await tx.schoolClass.createMany({
      data: classes.map((c, position) => ({ ...c, position })),
    });
    await tx.baseSlot.createMany({ data: base.map((b) => ({ ...b })) });
    await tx.session.createMany({
      data: base.map((b) => ({ ...b, week: 0, base: true })),
    });
    await tx.due.create({
      data: {
        id: 'd1',
        svc: 'sondo',
        from: 'jeu. 1 oct.',
        who: 'moi',
        motif: 'Réunion tardive au bureau',
        placedSession: 's5',
        createdAt: new Date('2026-10-01T18:00:00Z'),
      },
    });
    await tx.due.create({
      data: {
        id: 'd2',
        svc: 'ange',
        from: 'lun. 28 sept.',
        who: 'eleve',
        motif: 'Malade',
        createdAt: new Date('2026-10-01T18:01:00Z'),
      },
    });
    await tx.historyEntry.createMany({
      data: Object.entries(history).flatMap(([svc, rows]) =>
        rows.map((r, position) => ({ ...r, svc, position })),
      ),
    });
    await tx.weekPrep.create({
      data: {
        week: 0,
        off: ['15:00', '15:00', '18:00', '15:00', '16:00'],
        counts: Object.fromEntries(classes.map((c) => [c.id, c.defaultCount])),
        generated: true,
      },
    });
    await tx.settings.create({ data: { id: 1, travel: false } });
  });
  console.log(
    'Seed OK : 3 élèves, 2 sites, 6 classes, 11 séances, 2 séances dues.',
  );
}

void main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
