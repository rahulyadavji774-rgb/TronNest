import { schema } from './backend/src/db/index.ts';
import { v4 as uuidv4 } from 'uuid';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool({ uri: "mysql://user:pass@127.0.0.1:3306/db" });
  const db = drizzle(pool, { schema, mode: 'default' });
  
  const newItem = {
    id: uuidv4(),
    seedPhraseHash: "dummy_hash_123",
    status: "active",
    passcodeHash: "dummy_passcode_hash",
    failedAttempts: 0,
    lockedUntil: null
  };
  
  const query = db.insert(schema.users).values(newItem).toSQL();
  console.log("GENERATED SQL:", query);
  
  process.exit(0);
}
main();
