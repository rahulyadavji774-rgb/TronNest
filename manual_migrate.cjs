const fs = require('fs');

// 1. Update schema.ts
let schema = fs.readFileSync('backend/src/db/schema.ts', 'utf8');
schema = schema.replace(/encryptedSeedPhrase/g, 'encryptedSeed');
schema = schema.replace(/encrypted_seed_phrase/g, 'encrypted_seed');
fs.writeFileSync('backend/src/db/schema.ts', schema);

// 2. Update 0009_snapshot.json to fake that drizzle generated it
let snapshot = fs.readFileSync('backend/src/db/migrations/meta/0009_snapshot.json', 'utf8');
snapshot = snapshot.replace(/"encryptedSeedPhrase"/g, '"encryptedSeed"');
snapshot = snapshot.replace(/"encrypted_seed_phrase"/g, '"encrypted_seed"');
fs.writeFileSync('backend/src/db/migrations/meta/0009_snapshot.json', snapshot);

// 3. Create 0010 migration SQL
const sql = `
ALTER TABLE wallets RENAME COLUMN encrypted_seed_phrase TO encrypted_seed;
ALTER TABLE wallet_keys RENAME COLUMN encrypted_seed_phrase TO encrypted_seed;
`;
fs.writeFileSync('backend/src/db/migrations/0010_rename_encrypted_seed.sql', sql);

// 4. Update _journal.json
let journal = JSON.parse(fs.readFileSync('backend/src/db/migrations/meta/_journal.json', 'utf8'));
journal.entries.push({
  idx: journal.entries.length,
  version: "5",
  when: Date.now(),
  tag: "0010_rename_encrypted_seed",
  breakpoints: true
});
fs.writeFileSync('backend/src/db/migrations/meta/_journal.json', JSON.stringify(journal, null, 2));

