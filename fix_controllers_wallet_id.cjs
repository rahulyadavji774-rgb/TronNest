const fs = require('fs');

// Auth controller
let auth = fs.readFileSync('backend/src/controllers/auth.controller.ts', 'utf8');
auth = auth.replace(
  /await this\.db\.update\('users', user\.id, \{ wallet_id: wallet\.id, active_wallet_id: wallet\.id \}\);/g,
  "// removed active_wallet_id update"
);
auth = auth.replace(
  /await this\.db\.update\('users', user\.id, \{\s*active_wallet_id: wallet\.id\s*\}\);/g,
  "// removed active_wallet_id update"
);
fs.writeFileSync('backend/src/controllers/auth.controller.ts', auth);

// Wallet controller
let wallet = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');
wallet = wallet.replace(
  /const activeWalletId = userObj \? \(userObj\.active_wallet_id \|\| userObj\.wallet_id\) : user\.walletId;/g,
  "const activeWalletId = user.walletId;"
);
wallet = wallet.replace(
  /await this\.db\.update<any>\('users', user\.id, \{ active_wallet_id: wallet\.id \}\);/g,
  "// removed active_wallet_id update"
);
wallet = wallet.replace(
  /if \(userObj && \(userObj\.active_wallet_id === walletToDelete\.id \|\| userObj\.wallet_id === walletToDelete\.id\)\) \{[\s\S]*?await this\.db\.update<any>\('users', userObj\.id, \{[\s\S]*?\}\);[\s\S]*?\}/g,
  "// removed active_wallet_id update"
);
fs.writeFileSync('backend/src/controllers/wallet.controller.ts', wallet);
