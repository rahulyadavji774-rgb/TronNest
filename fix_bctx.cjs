const fs = require('fs');
let code = fs.readFileSync('backend/src/db/schema.ts', 'utf8');

code = code.replace(
  /export const blockchainTransactions = mysqlTable\('blockchain_transactions', \{([\s\S]+?)createdAt: timestamp\('created_at'\)\.defaultNow\(\)/,
  "export const blockchainTransactions = mysqlTable('blockchain_transactions', {$1txHash: varchar('tx_hash', { length: 255 }),\n  fromAddress: varchar('from_address', { length: 255 }),\n  toAddress: varchar('to_address', { length: 255 }),\n  fee: decimal('fee', { precision: 36, scale: 18 }),\n  createdAt: timestamp('created_at').defaultNow()"
);

// We should also replace txId: varchar('tx_id') -> we can just keep it and add txHash

fs.writeFileSync('backend/src/db/schema.ts', code);
