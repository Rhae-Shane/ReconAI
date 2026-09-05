import pg from "pg";

/**
 * Prefer DIRECT_URL (session/5432) over the pgbouncer pooler — prepared
 * statements break in transaction mode. The live close tables use TEXT + JSONB
 * (not Prisma enums), so persistence goes through this pool with SQL that
 * matches the existing columns.
 */
function connectionString(): string | undefined {
  const direct = process.env.DIRECT_URL?.trim();
  const pooled = process.env.DATABASE_URL?.trim();
  return direct || pooled;
}

const globalForPg = globalThis as unknown as { closePgPool?: pg.Pool };

export function getPool(): pg.Pool | null {
  const url = connectionString();
  if (!url) return null;
  if (!globalForPg.closePgPool) {
    globalForPg.closePgPool = new pg.Pool({ connectionString: url, max: 5 });
  }
  return globalForPg.closePgPool;
}
