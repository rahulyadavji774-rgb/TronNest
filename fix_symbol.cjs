const fs = require('fs');
let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

code = code.replace(/asset_symbol: tokenId,/g, 'asset_symbol: token.symbol,');

fs.writeFileSync('backend/src/controllers/wallet.controller.ts', code);
