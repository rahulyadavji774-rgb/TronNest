const fs = require('fs');

let schema = fs.readFileSync('backend/src/db/schema.ts', 'utf8');

// revert encryptedSeed back to encryptedSeedPhrase
schema = schema.replace(
  /encryptedSeed: text\('encrypted_seed'\),/g,
  "encryptedSeedPhrase: text('encrypted_seed_phrase'),"
);

// revert users table adding the dropped columns
schema = schema.replace(
  /export const users = mysqlTable\('users', \{([^}]+)id: char\('id', \{ length: 36 \}\)\.primaryKey\(\)\.\$defaultFn\(\(\) => uuidv4\(\)\),\n  seedPhraseHash:/,
  "export const users = mysqlTable('users', {$1id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),\n  username: varchar('username', { length: 100 }).unique(),\n  email: varchar('email', { length: 255 }).unique(),\n  passwordHash: varchar('password_hash', { length: 255 }),\n  seedPhraseHash:"
);

schema = schema.replace(
  /status: varchar\('status', \{ length: 50 \}\)\.default\('active'\)\.notNull\(\),\n  activeWalletId: char\('active_wallet_id', \{ length: 36 \}\),\n  createdAt:/,
  "status: varchar('status', { length: 50 }).default('active').notNull(),\n  lastLogin: timestamp('last_login'),\n  createdAt:"
);

fs.writeFileSync('backend/src/db/schema.ts', schema);
