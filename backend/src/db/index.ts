import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';
import fs from 'fs';
import path from 'path';

let db: any;
let isInitialized = false;

export async function initDb(connectionString?: string) {
  if (connectionString) {
    try {
      const connection = await mysql.createConnection(connectionString);
      db = drizzle(connection, { schema, mode: 'default' });
      isInitialized = true;
      return db;
    } catch (e: any) {
      console.warn('Failed to connect to MySQL:', e.message, 'Falling back to local JSON DB.');
    }
  }

  // Ensure data directory exists
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Mock DB object for JSON fallback
  db = { _mock: true };
  isInitialized = true;
  return db;
}

export function getDb() {
  if (!isInitialized) {
    db = { _mock: true };
    isInitialized = true;
  }
  return db;
}

export { schema };
