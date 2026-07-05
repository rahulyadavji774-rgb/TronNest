const fs = require('fs');

const authPath = 'backend/src/controllers/auth.controller.ts';
let auth = fs.readFileSync(authPath, 'utf8');
auth = auth.replace(/encrypted_seed_phrase/g, 'encrypted_seed');
auth = auth.replace(/seedPhraseHash/g, 'seed_phrase_hash');
auth = auth.replace(/passcodeHash/g, 'passcode_hash');
fs.writeFileSync(authPath, auth);

const walletPath = 'backend/src/controllers/wallet.controller.ts';
let wallet = fs.readFileSync(walletPath, 'utf8');
wallet = wallet.replace(/encrypted_seed_phrase/g, 'encrypted_seed');
fs.writeFileSync(walletPath, wallet);

