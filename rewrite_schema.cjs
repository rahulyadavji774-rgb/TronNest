const fs = require('fs');

let schema = fs.readFileSync('backend/src/db/schema.ts', 'utf8');

// 1. users table
schema = schema.replace(
  /username: varchar\('username', \{ length: 100 \}\)\.unique\(\),\n  email: varchar\('email', \{ length: 255 \}\)\.unique\(\),\n  passwordHash: varchar\('password_hash', \{ length: 255 \}\),\n/,
  ""
);

schema = schema.replace(
  /lastLogin: timestamp\('last_login'\),\n/,
  "activeWalletId: char('active_wallet_id', { length: 36 }),\n"
);

// 2. wallets table
schema = schema.replace(
  /encryptedSeedPhrase: text\('encrypted_seed_phrase'\),/g,
  "encryptedSeed: text('encrypted_seed'),"
);

fs.writeFileSync('backend/src/db/schema.ts', schema);

// 3. update controllers
let auth = fs.readFileSync('backend/src/controllers/auth.controller.ts', 'utf8');
auth = auth.replace(/encrypted_seed_phrase:/g, 'encrypted_seed:');
fs.writeFileSync('backend/src/controllers/auth.controller.ts', auth);

let wallet = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');
wallet = wallet.replace(/encrypted_seed_phrase/g, 'encrypted_seed');
fs.writeFileSync('backend/src/controllers/wallet.controller.ts', wallet);

