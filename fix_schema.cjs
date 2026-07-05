const fs = require('fs');

let schema = fs.readFileSync('backend/src/db/schema.ts', 'utf8');

// Replace the users table entirely
schema = schema.replace(
  /export const users = mysqlTable\('users', \{[\s\S]*?\}\);/,
  `export const users = mysqlTable('users', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(() => uuidv4()),
  username: varchar('username', { length: 100 }).unique(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  passcodeHash: varchar('passcode_hash', { length: 255 }),
  seedPhraseHash: varchar('seed_phrase_hash', { length: 255 }).unique(),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  failedAttempts: int('failed_attempts').default(0),
  lockedUntil: timestamp('locked_until'),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});`
);

fs.writeFileSync('backend/src/db/schema.ts', schema);
