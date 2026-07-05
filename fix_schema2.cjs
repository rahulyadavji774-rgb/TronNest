const fs = require('fs');
let code = fs.readFileSync('backend/src/db/schema.ts', 'utf8');

// revert encryptedSeed back to encryptedSeedPhrase in wallets table
code = code.replace(
  /encryptedSeed: text\('encrypted_seed'\),/,
  `encryptedSeedPhrase: text('encrypted_seed_phrase'),`
);

fs.writeFileSync('backend/src/db/schema.ts', code);
