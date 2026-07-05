const fs = require('fs');

function replaceInFile(file) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/encrypted_seed/g, 'encrypted_seed_phrase');
  fs.writeFileSync(file, code);
}

replaceInFile('backend/src/controllers/wallet.controller.ts');
replaceInFile('backend/src/controllers/auth.controller.ts');
// Note: wallet.controller.ts might have `encrypted_seed: encryptedSeed`, 
// replacing to `encrypted_seed_phrase: encryptedSeed` is correct.

