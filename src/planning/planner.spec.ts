import { currentWeek } from './formats';
import { SessionKind, SessionStatus } from '../generated/prisma/enums';
import {
  BaseSlotData,
  PlanState,
  Planner,
  ServiceData,
  SessionData,
} from './planner';

const eleve = (id: string, extra: Partial<ServiceData> = {}): ServiceData => ({
  id,
  name: id,
  first: id,
  code: id.slice(0, 2).toUpperCase(),
  color: '#000000',
  kind: 'eleve',
  perWeek: 2,
  noWeekend: false,
  exDays: [],
  notBefore: null,
  notAfter: null,
  phone: '',
  phoneLabel: '',
  position: 0,
  deletedAt: null,
  rate: null,
  billing: 'seance',
  fixed: [],
  unavailable: [],
  ...extra,
});

const site = (id: string): ServiceData => ({
  ...eleve(id),
  kind: 'site',
  perWeek: 0,
});

const slot = (
  id: string,
  day: number,
  start: number,
  end: number,
  svc: string,
  extra: Partial<BaseSlotData> = {},
) => ({
  id,
  day,
  start,
  end,
  svc,
  cls: null,
  kind: SessionKind.normal,
  dueId: null,
  fixed: false,
  ...extra,
});

function demoState(): PlanState {
  const services = [
    eleve('ange'),
    eleve('adje', { noWeekend: true }),
    eleve('sondo'),
    site('ma'),
    site('ng'),
  ];
  const baseSlots: BaseSlotData[] = [
    slot('s1', 0, 930, 1050, 'adje'),
    slot('s2', 0, 1080, 1230, 'ma', { cls: 'c1' }),
    slot('s3', 1, 930, 1050, 'ange'),
    slot('s4', 1, 1060, 1180, 'sondo'),
    slot('s6', 3, 1060, 1180, 'adje'),
    slot('s7', 4, 1080, 1230, 'ng', { cls: 'c3' }),
    slot('s9', 5, 870, 990, 'sondo'),
    slot('s10', 6, 540, 660, 'ange', { fixed: true }),
  ];
  const sessions: SessionData[] = baseSlots.map((b) => ({
    ...b,
    week: 0,
    status: SessionStatus.prevue,
    who: null,
    motif: '',
    noRedo: false,
    base: true,
  }));
  return {
    services: new Map(services.map((s) => [s.id, s])),
    classes: new Map([
      [
        'c1',
        {
          id: 'c1',
          name: 'Terminale D',
          siteId: 'ma',
          defaultCount: 1,
          position: 0,
        },
      ],
      [
        'c3',
        {
          id: 'c3',
          name: 'Terminale D',
          siteId: 'ng',
          defaultCount: 1,
          position: 1,
        },
      ],
    ]),
    students: ['ange', 'adje', 'sondo'],
    sessions,
    dues: [],
    preps: new Map(),
    generated: new Set([0]),
    baseSlots,
    travel: true,
    cancelled: new Set(),
    tutorUnavailable: [],
    currentWeek: 0,
  };
}

let seq = 0;
const planner = (state = demoState()) =>
  new Planner(state, (p) => `${p}${++seq}`);

describe('Planner', () => {
  it('ne place jamais un élève deux jours de suite', () => {
    const p = planner();
    // Ange a cours mardi et dimanche : lundi, mercredi et samedi sont exclus.
    for (const d of [0, 2, 5])
      expect(p.slotOn('ange', d, p.week(0), 0)).toBeNull();
  });

  it('respecte « jamais le week-end »', () => {
    const p = planner();
    expect(p.slotOn('adje', 5, [], 0)).toBeNull();
    expect(p.slotOn('adje', 6, [], 0)).toBeNull();
  });

  it('commence 30 min après la sortie du travail', () => {
    const p = planner();
    expect(p.slotOn('ange', 0, [], 0)).toEqual({
      week: 0,
      day: 0,
      start: 930,
      end: 1050,
    });
  });

  it('trajets non comptés : dès la sortie du travail et bout à bout', () => {
    const p = planner({ ...demoState(), travel: false });
    expect(p.slotOn('ange', 0, [], 0)).toEqual({
      week: 0,
      day: 0,
      start: 900,
      end: 1020,
    });
    // Sondo mardi : juste après Ange (15h30–17h30), sans 10 min de trajet.
    const tue = p.week(0).filter((s) => s.svc !== 'sondo');
    expect(p.slotOn('sondo', 1, tue, 0)?.start).toBe(1050);
    expect(p.travel({ svc: 'ange' }, { svc: 'ma' })).toBe(0);
  });

  it('pointer une séance manquée crée une séance due', () => {
    const p = planner();
    expect(
      p.savePointer('s3', { missed: true, who: 'eleve', motif: 'Malade' }),
    ).toBe('Séance manquée · 1 séance à rattraper créée');
    expect(p.state.dues).toHaveLength(1);
    expect(p.state.dues[0]).toMatchObject({
      svc: 'ange',
      from: 'mar. 6 oct.',
      sourceId: 's3',
    });
    expect(p.sessionById('s3')?.status).toBe(SessionStatus.manquee);

    // Re-pointer la séance comme faite supprime la dette.
    p.savePointer('s3', { missed: false });
    expect(p.state.dues).toHaveLength(0);
  });

  it('générer une semaine recopie le planning de base et case les séances dues', () => {
    const p = planner();
    p.savePointer('s3', { missed: true, who: 'moi', motif: 'Réunion' });
    const msg = p.generate(1);
    const w1 = p.week(1);
    expect(msg).toMatch(/^Planning du 12 – 18 octobre : \d+ séances/);
    expect(w1.filter((s) => s.base).map((s) => s.id)).toContain('s3-w1');
    const ratt = w1.find((s) => s.kind === SessionKind.rattrapage);
    expect(ratt?.svc).toBe('ange');
    expect(p.state.dues[0].placedSession).toBe(ratt?.id);
    expect(p.state.generated.has(1)).toBe(true);
  });

  it('élève absent la semaine : aucune séance normale', () => {
    const p = planner();
    p.updatePrep(1, { changes: { sondo: 'absent' } });
    p.generate(1);
    expect(p.week(1).filter((s) => s.svc === 'sondo')).toHaveLength(0);
  });

  it('Succès Group aux créneaux choisis : jour et heures respectés', () => {
    const p = planner();
    p.updatePrep(1, { times: { c1: [{ day: 2, start: 1020, end: 1170 }] } });
    p.generate(1);
    const c1 = p.week(1).filter((s) => s.cls === 'c1');
    // Séance déjà décidée (lundi) + créneau choisi (mercredi 17h–19h30).
    expect(c1.map((s) => [s.day, s.start, s.end])).toEqual([
      [0, 1080, 1230],
      [2, 1020, 1170],
    ]);
    // Aucun élève ne chevauche le créneau.
    const wed = p.week(1).filter((s) => s.day === 2 && s.cls == null);
    expect(wed.every((s) => s.end <= 1020 || s.start >= 1170)).toBe(true);
  });

  it('Succès Group : aucune séance placée automatiquement sans créneau saisi', () => {
    const p = planner();
    p.state.preps.set(1, {
      ...p.defaultPrep(),
      counts: { c1: 3, c3: 2 },
      times: {},
    });
    p.generate(1);
    // Seules restent les séances du planning de base (lundi c1, vendredi c3).
    expect(p.week(1).filter((s) => s.cls != null && !s.base)).toHaveLength(0);
    expect(p.items().filter((i) => !i.due)).toHaveLength(0);
  });

  it('Succès Group manquée : pas casée automatiquement, placée au créneau donné', () => {
    const p = planner();
    p.savePointer('s2', { missed: true, who: 'eleve', motif: 'Grève' });
    p.generate(1);
    const due = p.state.dues[0];
    expect(due.cls).toBe('c1');
    expect(due.placedSession).toBeNull();
    const it = p.item(due.id)!;
    const res = p.place(it, {
      slot: { week: 1, day: 3, start: 1020, end: 1170 },
    });
    expect(res?.session).toMatchObject({
      week: 1,
      day: 3,
      start: 1020,
      end: 1170,
      kind: 'rattrapage',
      cls: 'c1',
    });
  });

  it('déplacer une séance prévue (jour et heures)', () => {
    const p = planner();
    expect(
      p.moveSession('s3', { week: 0, day: 3, start: 1000, end: 1120 }),
    ).toMatch(/^Séance déplacée/);
    expect(p.sessionById('s3')).toMatchObject({
      day: 3,
      start: 1000,
      end: 1120,
    });
    p.savePointer('s1', { missed: false });
    expect(
      p.moveSession('s1', { week: 0, day: 2, start: 900, end: 1020 }),
    ).toBeNull();
  });

  it('annuler une séance prévue : archivée, avec ou sans rattrapage', () => {
    const p = planner();
    expect(
      p.cancelSession('s3', { redo: true, who: 'eleve', motif: 'Voyage' }),
    ).toBe('Séance annulée · 1 séance à rattraper créée');
    expect(p.sessionById('s3')).toBeUndefined();
    expect(p.state.cancelled.has('s3')).toBe(true);
    expect(p.state.dues[0]).toMatchObject({
      svc: 'ange',
      sourceId: 's3',
      motif: 'Voyage',
      placedSession: null,
    });
    expect(p.cancelSession('s4', { redo: false })).toBe(
      'Séance annulée · pas de rattrapage',
    );
    expect(p.state.dues).toHaveLength(1);
  });

  it('annuler un rattrapage casé le remet à caser', () => {
    const p = planner();
    p.savePointer('s3', { missed: true, who: 'eleve', motif: '' });
    p.generate(1);
    const due = p.state.dues[0];
    const placed = due.placedSession!;
    expect(p.cancelRattrapage(due.id)).toBe(
      'Rattrapage annulé · séance à replacer',
    );
    expect(p.sessionById(placed)).toBeUndefined();
    expect(p.state.cancelled.has(placed)).toBe(true);
    expect(p.state.dues[0].placedSession).toBeNull();
    expect(p.items().find((i) => i.key === due.id)?.placed).toBeNull();
    // Déjà annulé : rien à faire.
    expect(p.cancelRattrapage(due.id)).toBeNull();
  });

  it('respecte les indisponibilités de l’élève et du répétiteur', () => {
    const state = demoState();
    // Ange indisponible le samedi après 12h ; répétiteur indisponible le dimanche avant 12h.
    state.services.get('ange')!.unavailable = [
      { day: 5, start: 720, end: 1440 },
    ];
    state.tutorUnavailable = [{ day: 6, start: 0, end: 720 }];
    const p = planner(state);
    // Samedi : seulement le matin.
    expect(p.slotOn('ange', 5, [], 0)).toMatchObject({ start: 480, end: 600 });
    expect(
      p.slotOn(
        'ange',
        5,
        [p.week(0)[0]].map((s) => ({
          ...s,
          day: 5,
          start: 480,
          end: 660,
          svc: 'ma',
        })),
        0,
      ),
    ).toBeNull();
    // Dimanche : pas avant 12h, ni pour un élève ni pour Succès Group.
    expect(p.slotOn('ange', 6, [], 0)).toMatchObject({ start: 720, end: 840 });
    expect(p.slotOn('ma', 6, [], 0)).toMatchObject({ start: 840, end: 1080 });
    expect(p.ruleOf(p.svc('ange'))).toContain(
      'indisponible le samedi après 12h',
    );
  });

  it('semaine en cours d’après la date', () => {
    expect(currentWeek(new Date('2026-09-30T21:45:00Z'))).toBe(-1);
    expect(currentWeek(new Date('2026-10-05T00:00:00Z'))).toBe(0);
    expect(currentWeek(new Date('2026-10-11T23:59:00Z'))).toBe(0);
    expect(currentWeek(new Date('2026-10-12T00:00:00Z'))).toBe(1);
  });
});
