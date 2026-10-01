import 'dotenv/config';
// Base dédiée : les tests ne touchent pas à la base de développement.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

// Nécessite la base : `npm run db:up && npm run prisma:deploy`.
describe('API (e2e)', () => {
  let app: INestApplication<App>;
  const key = process.env.API_KEY!;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  it('/ (GET) est public', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) =>
        expect((res.body as { name: string }).name).toBe('weeko-api'),
      );
  });

  it('/health (GET) est public', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('refuse les requêtes sans clé API', () => {
    return request(app.getHttpServer()).get('/rattrapages').expect(401);
  });

  it('refuse une mauvaise clé API', () => {
    return request(app.getHttpServer())
      .get('/rattrapages')
      .set('x-api-key', 'nope')
      .expect(401);
  });

  it('/rattrapages (GET) avec la clé', () => {
    return request(app.getHttpServer())
      .get('/rattrapages')
      .set('x-api-key', key)
      .expect(200)
      .expect((res) =>
        expect(Array.isArray((res.body as { items: unknown }).items)).toBe(
          true,
        ),
      );
  });

  it('/state (GET) inclut l’historique importé', () => {
    return request(app.getHttpServer())
      .get('/state')
      .set('x-api-key', key)
      .expect(200)
      .expect((res) =>
        expect((res.body as { history: unknown }).history).toBeDefined(),
      );
  });

  it('supprimer un élève l’archive sans effacer la ligne', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/students')
      .set('x-api-key', key)
      .send({ name: 'Élève Test E2E', count: 1 })
      .expect(201);
    const id = (created.body as { id: string }).id;

    await request(server)
      .delete(`/students/${id}`)
      .set('x-api-key', key)
      .expect(204);
    await request(server)
      .get(`/students/${id}`)
      .set('x-api-key', key)
      .expect(404);
    const list = await request(server)
      .get('/students')
      .set('x-api-key', key)
      .expect(200);
    expect((list.body as { id: string }[]).map((s) => s.id)).not.toContain(id);

    const row = await app
      .get(PrismaService)
      .service.findUnique({ where: { id } });
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });

  it('/weeks/:w/preview ne modifie rien', async () => {
    const server = app.getHttpServer();
    const before = await request(server)
      .get('/weeks/5')
      .set('x-api-key', key)
      .expect(200);
    const prev = await request(server)
      .post('/weeks/5/preview')
      .set('x-api-key', key)
      .expect(200);
    expect((prev.body as { generated: boolean }).generated).toBe(true);
    expect(
      (prev.body as { sessions: unknown[] }).sessions.length,
    ).toBeGreaterThan(0);
    const after = await request(server)
      .get('/weeks/5')
      .set('x-api-key', key)
      .expect(200);
    expect(after.body).toEqual(before.body);
  });

  describe('séances, rattrapages, indisponibilités, argent, agenda', () => {
    const api = () => ({
      get: (u: string) =>
        request(app.getHttpServer()).get(u).set('x-api-key', key),
      post: (u: string, b?: object) =>
        request(app.getHttpServer()).post(u).set('x-api-key', key).send(b),
      patch: (u: string, b: object) =>
        request(app.getHttpServer()).patch(u).set('x-api-key', key).send(b),
      del: (u: string) =>
        request(app.getHttpServer()).delete(u).set('x-api-key', key),
    });
    const sessionsOf = async (w: number) =>
      (await api().get(`/weeks/${w}`).expect(200)).body.sessions as {
        id: string;
        svc: string;
        day: number;
        start: number;
      }[];

    it('déplacer puis annuler une séance (avec rattrapage)', async () => {
      await api().post('/weeks/50/generate').expect(200);
      const week = await sessionsOf(50);
      const s = week.find((x) => x.svc === 'ange')!;
      // Un jour sans séance d'Ange (jamais deux séances le même jour).
      const day = [0, 1, 2, 3, 4].find(
        (d) => !week.some((x) => x.svc === 'ange' && x.day === d),
      )!;
      const moved = await api()
        .patch(`/sessions/${s.id}`, { week: 50, day, start: 1000, end: 1120 })
        .expect(200);
      expect(moved.body.session).toMatchObject({ day, start: 1000, end: 1120 });
      await api()
        .patch(`/sessions/${s.id}`, { week: 50, day, start: 1000, end: 900 })
        .expect(400);
      const c = await api()
        .post(`/sessions/${s.id}/cancel`, {
          redo: true,
          who: 'eleve',
          motif: 'Voyage',
        })
        .expect(200);
      expect(c.body.message).toContain('à rattraper');
      expect((await sessionsOf(50)).some((x) => x.id === s.id)).toBe(false);
      const r = await api().get('/rattrapages').expect(200);
      expect(
        (r.body.items as { detail: string }[]).some((i) =>
          i.detail.includes('Voyage'),
        ),
      ).toBe(true);
    });

    it('« Faite » refusé pour une séance pas encore commencée', async () => {
      const s = (await sessionsOf(50))[0];
      await api()
        .post(`/sessions/${s.id}/pointer`, { missed: false })
        .expect(400);
    });

    it('rattrapage placé à un créneau précis', async () => {
      const items = (await api().get('/rattrapages').expect(200)).body
        .items as {
        key: string;
        placed: string | null;
      }[];
      const it = items.find((i) => i.placed == null)!;
      const res = await api()
        .post(`/rattrapages/${it.key}/place`, {
          slot: { week: 51, day: 2, start: 1020, end: 1140 },
        })
        .expect(201);
      expect(res.body.session).toMatchObject({
        week: 51,
        day: 2,
        start: 1020,
        end: 1140,
      });
    });

    it('indisponibilités modifiables (élève et répétiteur)', async () => {
      const st = await api()
        .patch('/students/sondo', {
          unavailable: [{ day: 4, start: '18:00', end: '23:59' }],
        })
        .expect(200);
      expect(st.body.unavailable).toEqual([{ day: 4, start: 1080, end: 1440 }]);
      expect(st.body.rule).toContain('indisponible le vendredi après 18h');
      const set = await api()
        .patch('/settings', {
          unavailable: [{ day: 6, start: '00:00', end: '13:00' }],
        })
        .expect(200);
      expect(set.body.unavailable).toEqual([{ day: 6, start: 0, end: 780 }]);
    });

    it('tarif et paiements (annulation douce)', async () => {
      await api()
        .patch('/students/ange', { rate: 5000, billing: 'seance' })
        .expect(200);
      const pay = await api()
        .post('/students/ange/payments', {
          amount: 20000,
          date: '2026-10-03',
          note: 'Espèces',
        })
        .expect(201);
      let state = (await api().get('/state').expect(200)).body;
      expect(
        state.services.find((s: { id: string }) => s.id === 'ange'),
      ).toMatchObject({ rate: 5000, billing: 'seance' });
      expect(state.payments).toEqual([
        {
          id: pay.body.id,
          serviceId: 'ange',
          amount: 20000,
          paidOn: '2026-10-03',
          note: 'Espèces',
        },
      ]);
      await api().del(`/students/ange/payments/${pay.body.id}`).expect(204);
      state = (await api().get('/state').expect(200)).body;
      expect(state.payments).toEqual([]);
    });

    it('flux agenda : jeton secret, contenu .ics', async () => {
      const t = (await api().post('/settings/calendar').expect(200)).body
        .calendarToken as string;
      expect(t).toHaveLength(48);
      await request(app.getHttpServer())
        .get('/calendar/mauvais.ics')
        .expect(404);
      const ics = await request(app.getHttpServer())
        .get(`/calendar/${t}.ics`)
        .expect(200);
      expect(ics.text).toContain('BEGIN:VCALENDAR');
      expect(ics.text).toContain('X-WR-CALNAME:Weeko');
      expect(ics.text).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    });
  });
});
