import { JsonDatabase } from './backend/src/config/db.ts';
import { getDb, initDb } from './backend/src/db/index.ts';

async function main() {
  await initDb("mysql://user:pass@127.0.0.1:3306/db");
  const db = JsonDatabase.getInstance();
  
  try {
    await db.insert('users', {
      seed_phrase_hash: "123",
      status: 'active',
      passcode_hash: "passcode123",
      failed_attempts: 0,
      locked_until: null
    });
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
main();
