import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import path from 'path';

let db: any;
let pool: mysql.Pool;

export async function initDb(connectionString?: string) {
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for production SQL architecture.');
  }
  
  // Connection pooling
  pool = mysql.createPool({
    uri: connectionString,
    connectionLimit: 10,
    waitForConnections: true,
  });

  db = drizzle(pool, { schema, mode: 'default' });
  
  try {
    console.log('Running database migrations...');
    await migrate(db, { migrationsFolder: path.join(process.cwd(), 'backend/src/db/migrations') });
    console.log('Database migrations completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
  
  return db;
}

export function getDb(): any {
  if (!db) {
    throw new Error('Database not initialized. Call initDb first.');
  }
  return db;
}

export { schema };
