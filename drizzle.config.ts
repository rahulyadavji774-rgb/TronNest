import type { Config } from 'drizzle-kit';

export default {
  schema: './backend/src/db/schema.ts',
  out: './backend/src/db/migrations',
  dialect: 'mysql',
} satisfies Config;
