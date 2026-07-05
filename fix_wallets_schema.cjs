const fs = require('fs');

// 1. Update schema.ts
let schema = fs.readFileSync('backend/src/db/schema.ts', 'utf8');
schema = schema.replace(
  /encryptedSeed: text\('encrypted_seed'\),/g,
  "encryptedSeedPhrase: text('encrypted_seed_phrase'),"
);
fs.writeFileSync('backend/src/db/schema.ts', schema);

// 2. Update auth.controller.ts
let auth = fs.readFileSync('backend/src/controllers/auth.controller.ts', 'utf8');
auth = auth.replace(/encrypted_seed:/g, 'encrypted_seed_phrase:');
fs.writeFileSync('backend/src/controllers/auth.controller.ts', auth);

// 3. Update wallet.controller.ts
let wallet = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');
wallet = wallet.replace(/encrypted_seed/g, 'encrypted_seed_phrase');
fs.writeFileSync('backend/src/controllers/wallet.controller.ts', wallet);

// 4. Update WalletEngine.ts
let engine = fs.readFileSync('backend/src/services/WalletEngine.ts', 'utf8');
engine = engine.replace(/encryptedSeed:/g, 'encryptedSeedPhrase:');
fs.writeFileSync('backend/src/services/WalletEngine.ts', engine);

