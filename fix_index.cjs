const fs = require('fs');

let indexCode = fs.readFileSync('backend/src/db/index.ts', 'utf8');

const rawSql = `
    // Safe schema patches for existing MariaDB environments
    try {
      console.log('Applying safe schema patches...');
      await pool.query('ALTER TABLE \`users\` ADD COLUMN \`passcode_hash\` varchar(255)');
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.error('Safe patch error (passcode_hash):', e.message);
    }
    
    try {
      await pool.query('ALTER TABLE \`users\` ADD COLUMN \`failed_attempts\` int DEFAULT 0');
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.error('Safe patch error (failed_attempts):', e.message);
    }
    
    try {
      await pool.query('ALTER TABLE \`users\` ADD COLUMN \`locked_until\` timestamp NULL DEFAULT NULL');
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.error('Safe patch error (locked_until):', e.message);
    }

    try {
      await pool.query('ALTER TABLE \`wallets\` ADD COLUMN \`encrypted_seed_phrase\` text');
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.error('Safe patch error (encrypted_seed_phrase):', e.message);
    }
`;

indexCode = indexCode.replace(
  /console\.log\('Running database migrations\.\.\.'\);/,
  rawSql + "\n    console.log('Running database migrations...');"
);

fs.writeFileSync('backend/src/db/index.ts', indexCode);
