// Applies pending migrations from ./drizzle using a plain TCP postgres
// connection. Used instead of `drizzle-kit migrate` because drizzle-kit's
// auto-selected Neon websocket driver exits silently (no error output) in
// CI environments.
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const url = process.env.STORAGE_DATABASE_URL_UNPOOLED ?? process.env.STORAGE_DATABASE_URL;
if (!url) {
  console.error('STORAGE_DATABASE_URL is not set');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
}

main().then(
  async () => {
    await client.end();
    process.exit(0);
  },
  async (err) => {
    console.error(err);
    await client.end().catch(() => {});
    process.exit(1);
  },
);
