import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Adaptateur Postgres. Le paramètre `?schema=` de l'URL (compris par la CLI
 * Prisma) est retiré de la connexion et passé à l'adaptateur.
 */
export function pgAdapter(url: string) {
  const u = new URL(url);
  const schema = u.searchParams.get('schema') ?? undefined;
  u.searchParams.delete('schema');
  return new PrismaPg(
    { connectionString: u.toString() },
    schema ? { schema } : undefined,
  );
}
