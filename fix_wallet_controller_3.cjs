const fs = require('fs');

let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

code = code.replace(
  /balance = token\.symbol === 'TRX' \? liveBalances\.TRX : liveBalances\.USDT;/g,
  "balance = liveBalances.balances[token.id] || 0;"
);
code = code.replace(
  /if \(liveBalances\.failed\) \{/g,
  "if (liveBalances.failed && typeof liveBalances.balances[token.id] === 'undefined') {"
);

fs.writeFileSync('backend/src/controllers/wallet.controller.ts', code);
