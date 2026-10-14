import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' }); // drizzle-kit runs outside Next.js, so load env vars ourselves

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
