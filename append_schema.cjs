const fs = require('fs');

const extraSchema = `
export const walletSecurity = mysqlTable('wallet_security', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  walletId: char('wallet_id', { length: 36 }).notNull(),
  passcodeHash: varchar('passcode_hash', { length: 255 }),
  failedAttempts: int('failed_attempts').default(0),
  lockedUntil: timestamp('locked_until'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow()
});

export const tokenPrices = mysqlTable('token_prices', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  tokenId: char('token_id', { length: 36 }).notNull(),
  priceUsd: decimal('price_usd', { precision: 18, scale: 8 }),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow()
});

export const internalLedger = mysqlTable('internal_ledger', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  fromWalletId: char('from_wallet_id', { length: 36 }),
  toWalletId: char('to_wallet_id', { length: 36 }),
  tokenId: char('token_id', { length: 36 }),
  amount: decimal('amount', { precision: 36, scale: 18 }),
  type: varchar('type', { length: 50 }),
  status: varchar('status', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow()
});

export const blockchainTransactions = mysqlTable('blockchain_transactions', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  txId: varchar('tx_id', { length: 255 }),
  walletId: char('wallet_id', { length: 36 }),
  tokenId: char('token_id', { length: 36 }),
  amount: decimal('amount', { precision: 36, scale: 18 }),
  status: varchar('status', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow()
});

export const transactionHistory = mysqlTable('transaction_history', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  walletId: char('wallet_id', { length: 36 }),
  type: varchar('type', { length: 50 }),
  amount: decimal('amount', { precision: 36, scale: 18 }),
  tokenId: char('token_id', { length: 36 }),
  status: varchar('status', { length: 50 }),
  txHash: varchar('tx_hash', { length: 255 }),
  internalLedgerId: char('internal_ledger_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow()
});

export const notifications = mysqlTable('notifications', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  userId: char('user_id', { length: 36 }),
  title: varchar('title', { length: 255 }),
  message: text('message'),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow()
});

export const adminLogs = mysqlTable('admin_logs', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  adminId: char('admin_id', { length: 36 }),
  action: varchar('action', { length: 255 }),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow()
});

export const walletLogs = mysqlTable('wallet_logs', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  walletId: char('wallet_id', { length: 36 }),
  action: varchar('action', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow()
});

export const devices = mysqlTable('devices', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  userId: char('user_id', { length: 36 }),
  deviceInfo: varchar('device_info', { length: 255 }),
  lastActive: timestamp('last_active'),
  createdAt: timestamp('created_at').defaultNow()
});

export const appSettings = mysqlTable('app_settings', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  settingKey: varchar('setting_key', { length: 100 }),
  settingValue: text('setting_value'),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow()
});

export const networkSettings = mysqlTable('network_settings', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  networkName: varchar('network_name', { length: 100 }),
  fullNodeUrl: varchar('full_node_url', { length: 255 }),
  solidityNodeUrl: varchar('solidity_node_url', { length: 255 }),
  eventServerUrl: varchar('event_server_url', { length: 255 }),
  usdtContractAddress: varchar('usdt_contract_address', { length: 255 }),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow()
});
`;

fs.appendFileSync('backend/src/db/schema.ts', extraSchema);
console.log('Appended schema');
