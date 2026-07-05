const fs = require('fs');
let code = fs.readFileSync('backend/src/db/schema.ts', 'utf8');

code = code.replace(
  "  status: varchar('status', { length: 50 }),\n  createdAt: timestamp('created_at').defaultNow()",
  "  status: varchar('status', { length: 50 }),\n  txHash: varchar('tx_hash', { length: 255 }),\n  createdAt: timestamp('created_at').defaultNow()"
);

fs.writeFileSync('backend/src/db/schema.ts', code);
