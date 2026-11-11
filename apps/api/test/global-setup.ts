import { execSync } from 'node:child_process';
import path from 'node:path';

const OWNER = process.env.TEST_DATABASE_MIGRATION_URL ?? 'postgresql://nexbill_owner:nexbill@localhost:5432/nexbill_test?schema=public';
const APP = process.env.TEST_DATABASE_URL ?? 'postgresql://nexbill_app:nexbill_app@localhost:5432/nexbill_test?schema=public';

/** Migrates the dedicated test database and empties it, so every run starts from a known state. */
export default function setup(): void {
  const cwd = path.resolve(__dirname, '../../../packages/database');
  const env = { ...process.env, DATABASE_URL: APP, DATABASE_MIGRATION_URL: OWNER };
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  const sql = `DO $$ DECLARE t text; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP EXECUTE format('TRUNCATE TABLE %I CASCADE', t); END LOOP; END $$;`;
  execSync(`npx prisma db execute --stdin --url "${OWNER}"`, { cwd, env, input: sql, stdio: 'pipe' });
}
