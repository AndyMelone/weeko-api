import 'dotenv/config';
import { execSync } from 'node:child_process';
import { Client } from 'pg';

/** Crée la base de test si besoin et applique les migrations. */
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST manquant (voir .env.example)');
  const u = new URL(url);
  const name = u.pathname.slice(1);
  u.pathname = '/postgres';
  u.search = '';
  const admin = new Client({ connectionString: u.toString() });
  await admin.connect();
  const { rowCount } = await admin.query(
    'select 1 from pg_database where datname = $1',
    [name],
  );
  if (!rowCount) await admin.query(`create database "${name}"`);
  await admin.end();
  const env = { ...process.env, DATABASE_URL: url };
  execSync('npx prisma migrate deploy', { env, stdio: 'ignore' });
  // Données de démo fraîches à chaque lancement.
  execSync('npx tsx src/prisma/seed.ts', { env, stdio: 'ignore' });
}
