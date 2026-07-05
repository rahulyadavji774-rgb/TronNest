const fs = require('fs');

let wallet = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

wallet = wallet.replace(
  /\/\/ removed active_wallet_id update\n      \}/g,
  "// removed active_wallet_id update"
);

fs.writeFileSync('backend/src/controllers/wallet.controller.ts', wallet);
