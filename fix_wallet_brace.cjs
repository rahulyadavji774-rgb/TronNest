const fs = require('fs');
let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');
code = code.replace(
  /if \(userObj\) \{\n        \/\/ removed active_wallet_id update\n\n      \/\/ Generate new session JWTs/g,
  `if (userObj) {\n        // removed active_wallet_id update\n      }\n\n      // Generate new session JWTs`
);
fs.writeFileSync('backend/src/controllers/wallet.controller.ts', code);
