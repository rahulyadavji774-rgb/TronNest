import { JsonDatabase } from './backend/src/config/db.js';
const db = JsonDatabase.getInstance();
const s = await db.findOne('wallet_security', x => x.wallet_id == 1);
console.log('Before update:', s);
await db.update('wallet_security', s.id, { failed_attempts: 0, locked_until: null });
const s2 = await db.findOne('wallet_security', x => x.wallet_id == 1);
console.log('After update:', s2);
