const fs = require('fs');
let code = fs.readFileSync('backend/src/db/schema.ts', 'utf8');

code = code.replace(
  /export const walletLogs = mysqlTable\('wallet_logs', \{([\s\S]+?)createdAt: timestamp\('created_at'\)\.defaultNow\(\)/,
  "export const walletLogs = mysqlTable('wallet_logs', {$1actorId: char('actor_id', { length: 36 }),\n  status: varchar('status', { length: 50 }),\n  device: varchar('device', { length: 255 }),\n  ip: varchar('ip', { length: 45 }),\n  createdAt: timestamp('created_at').defaultNow()"
);

fs.writeFileSync('backend/src/db/schema.ts', code);
