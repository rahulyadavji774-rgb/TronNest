const fs = require('fs');

let authCode = fs.readFileSync('backend/src/controllers/auth.controller.ts', 'utf8');
authCode = authCode.replace(
  /const wallet = await this\.db\.insert<any>\('wallets', \{([^}]+)\}\);/,
  `const wallet = await this.db.insert<any>('wallets', {$1});\n\n      await this.db.update('users', user.id, { wallet_id: wallet.id, active_wallet_id: wallet.id });`
);
fs.writeFileSync('backend/src/controllers/auth.controller.ts', authCode);

let walletCode = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');
walletCode = walletCode.replace(
  /active_wallet_id: wallet\.id, address: wallet\.address/,
  `active_wallet_id: wallet.id`
);
fs.writeFileSync('backend/src/controllers/wallet.controller.ts', walletCode);
