const fs = require('fs');
const path = 'backend/src/services/WalletEngine.ts';
let code = fs.readFileSync(path, 'utf8');
code = code.replace(/encryptedSeedPhrase:/g, 'encryptedSeed:');
fs.writeFileSync(path, code);
