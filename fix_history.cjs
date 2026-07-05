const fs = require('fs');
let code = fs.readFileSync('backend/src/db/schema.ts', 'utf8');

code = code.replace(
  /export const transactionHistory = mysqlTable\('transaction_history', \{([\s\S]+?)createdAt: timestamp\('created_at'\)\.defaultNow\(\)/,
  "export const transactionHistory = mysqlTable('transaction_history', {$1direction: varchar('direction', { length: 50 }),\n  assetSymbol: varchar('asset_symbol', { length: 50 }),\n  counterparty: varchar('counterparty', { length: 255 }),\n  fee: decimal('fee', { precision: 36, scale: 18 }),\n  blockHeight: bigint('block_height', { mode: 'number' }),\n  nonce: bigint('nonce', { mode: 'number' }),\n  gasUsed: varchar('gas_used', { length: 255 }),\n  network: varchar('network', { length: 100 }),\n  blockchainTxId: char('blockchain_tx_id', { length: 36 }),\n  createdAt: timestamp('created_at').defaultNow()"
);

fs.writeFileSync('backend/src/db/schema.ts', code);
