import { 
  mysqlTable, 
  varchar, 
  char, 
  text, 
  timestamp, 
  boolean, 
  int, 
  decimal,
  json,
  index
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const permissions = mysqlTable('permissions', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});

export const admins = mysqlTable('admins', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  username: varchar('username', { length: 100 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('viewer'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});

export const users = mysqlTable('users', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  username: varchar('username', { length: 100 }).unique(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  seedPhraseHash: varchar('seed_phrase_hash', { length: 255 }).unique(),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});

export const wallets = mysqlTable('wallets', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  userId: char('user_id', { length: 36 }).references(() => users.id).notNull(),
  address: varchar('address', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull().default('Main Wallet'),
  encryptedPrivateKey: text('encrypted_private_key'),
  encryptedSeedPhrase: text('encrypted_seed_phrase'),
  isLocked: boolean('is_locked').default(false).notNull(),
  isFrozen: boolean('is_frozen').default(false).notNull(),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
}, (table) => {
  return {
    userIdIdx: index('user_id_idx').on(table.userId),
  };
});

export const walletKeys = mysqlTable('wallet_keys', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  walletId: char('wallet_id', { length: 36 }).references(() => wallets.id).notNull(),
  publicKey: text('public_key').notNull(),
  encryptedPrivateKey: text('encrypted_private_key').notNull(),
  encryptedSeedPhrase: text('encrypted_seed_phrase'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
}, (table) => {
  return {
    walletIdIdx: index('wallet_id_idx').on(table.walletId),
  };
});

export const tokens = mysqlTable('tokens', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  symbol: varchar('symbol', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  decimals: int('decimals').notNull().default(6),
  logoUrl: text('logo_url'),
  totalSupply: decimal('total_supply', { precision: 36, scale: 18 }).default('0').notNull(),
  circulatingSupply: decimal('circulating_supply', { precision: 36, scale: 18 }).default('0').notNull(),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  isVisible: boolean('is_visible').default(true).notNull(),
  description: text('description'),
  isTransferEnabled: boolean('is_transfer_enabled').default(true).notNull(),
  isInternal: boolean('is_internal').default(true).notNull(),
  supplyLocked: boolean('supply_locked').default(false).notNull(),
  contractAddress: varchar('contract_address', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});

export const balances = mysqlTable('balances', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  walletId: char('wallet_id', { length: 36 }).references(() => wallets.id).notNull(),
  tokenId: char('token_id', { length: 36 }).references(() => tokens.id).notNull(),
  balance: decimal('balance', { precision: 36, scale: 18 }).default('0').notNull(),
  isFrozen: boolean('is_frozen').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
}, (table) => {
  return {
    walletTokenIdx: index('wallet_token_idx').on(table.walletId, table.tokenId),
  };
});

export const transactions = mysqlTable('transactions', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  txHash: varchar('tx_hash', { length: 255 }).unique(),
  fromWalletId: char('from_wallet_id', { length: 36 }).references(() => wallets.id),
  toWalletId: char('to_wallet_id', { length: 36 }).references(() => wallets.id),
  tokenId: char('token_id', { length: 36 }).references(() => tokens.id).notNull(),
  amount: decimal('amount', { precision: 36, scale: 18 }).notNull(),
  fee: decimal('fee', { precision: 36, scale: 18 }).default('0').notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'transfer', 'mint', 'burn'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
}, (table) => {
  return {
    fromWalletIdx: index('from_wallet_idx').on(table.fromWalletId),
    toWalletIdx: index('to_wallet_idx').on(table.toWalletId),
    tokenIdx: index('token_idx').on(table.tokenId),
  };
});

export const transactionLogs = mysqlTable('transaction_logs', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  transactionId: char('transaction_id', { length: 36 }).references(() => transactions.id).notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => {
  return {
    txIdIdx: index('tx_id_idx').on(table.transactionId),
  };
});

export const auditLogs = mysqlTable('audit_logs', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  actorId: char('actor_id', { length: 36 }).notNull(),
  actorType: varchar('actor_type', { length: 50 }).notNull(), // 'admin', 'user', 'system'
  action: varchar('action', { length: 100 }).notNull(),
  details: json('details'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const sessions = mysqlTable('sessions', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  userId: char('user_id', { length: 36 }),
  adminId: char('admin_id', { length: 36 }),
  token: varchar('token', { length: 512 }).notNull().unique(),
  refreshToken: varchar('refresh_token', { length: 512 }).unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const settings = mysqlTable('settings', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: text('value').notNull(),
  category: varchar('category', { length: 100 }),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});

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
