const fs = require('fs');
let schema = fs.readFileSync('backend/src/db/schema.ts', 'utf8');
schema = schema.replace(
  /status: varchar\('status', \{ length: 50 \}\)\.default\('active'\)\.notNull\(\),\n/,
  "status: varchar('status', { length: 50 }).default('active').notNull(),\n  activeWalletId: char('active_wallet_id', { length: 36 }),\n"
);
fs.writeFileSync('backend/src/db/schema.ts', schema);
