const fs = require('fs');

let wallet = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

wallet = wallet.replace(
  /if \(userObj && \(userObj\.active_wallet_id[\s\S]*?\}\);/g,
  "// removed active_wallet_id update"
);

fs.writeFileSync('backend/src/controllers/wallet.controller.ts', wallet);
