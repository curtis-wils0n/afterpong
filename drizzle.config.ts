import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.STORAGE_DATABASE_URL_UNPOOLED ?? process.env.STORAGE_DATABASE_URL!,
  },
});
