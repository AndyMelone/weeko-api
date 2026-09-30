import 'dotenv/config';
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
});
