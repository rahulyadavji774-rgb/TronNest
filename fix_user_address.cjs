const fs = require('fs');

let walletCode = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

walletCode = walletCode.replace(
  /await this\.db\.update<any>\('users', dbUser\.id, \{ address: wallet\.address \}\);/g,
  `// address removed from users update`
);

walletCode = walletCode.replace(
  /active_wallet_id: remainingWallet\.id, \n          address: remainingWallet\.address/g,
  `active_wallet_id: remainingWallet.id`
);

fs.writeFileSync('backend/src/controllers/wallet.controller.ts', walletCode);
