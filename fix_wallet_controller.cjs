const fs = require('fs');

let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

// The line: const liveBalances = await this.tronService.getBalances(activeAddress, bypassCache);
// needs to become:
// const dbTokens = await this.db.findMany<any>('tokens', t => t.is_visible && t.is_active);
// const liveBalances = await this.tronService.getBalances(activeAddress, dbTokens, bypassCache);

code = code.replace(
  /const liveBalances = await this\.tronService\.getBalances\(activeAddress, bypassCache\);/g,
  `const dbTokens = await this.db.findMany<any>('tokens', t => t.is_visible && t.is_active);
      const liveBalances = await this.tronService.getBalances(activeAddress, dbTokens, bypassCache);`
);

// We need to fix the logging of TRX/USDT, since those are now in `liveBalances.balances` by ID.
// Instead of liveBalances.TRX we just log the object or something, but let's just remove the explicit TRX/USDT logs or fix them.
code = code.replace(
  /logger\.info\(\`\[Portfolio API - Server\] Live balances returned: TRX=\$\{liveBalances\.TRX\}, USDT=\$\{liveBalances\.USDT\}, Failed=\$\{liveBalances\.failed\}\`\);/g,
  'logger.info(`[Portfolio API - Server] Live balances returned: ${Object.keys(liveBalances.balances).length} tokens, Failed=${liveBalances.failed}`);'
);
code = code.replace(
  /logger\.info\(\`\[DEBUG LOGS\] Raw TRX balance returned from blockchain: \$\{liveBalances\.TRX\} TRX\`\);/g,
  ''
);
code = code.replace(
  /logger\.info\(\`\[DEBUG LOGS\] Raw USDT balance returned from blockchain: \$\{liveBalances\.USDT\} USDT\`\);/g,
  ''
);

// Remove the second query for dbTokens
code = code.replace(
  /const dbTokens = await this\.db\.findMany<any>\('tokens', t => t\.is_visible && t\.is_active\);\n\s*const prices =/g,
  'const prices ='
);

// Fix the portfolio loop
const oldPortfolioLogic = `          if (liveBalances.failed) {
            // Keep previous successful blockchain data!
            balance = cachedBalance;
          } else {
            // Sync with live TRON chain
            balance = token.symbol === 'TRX' ? liveBalances.TRX : liveBalances.USDT;
            // Update cache in DB
            if (balRecord) {
              await this.db.update<any>('balances', balRecord.id, { balance: balance });
            } else {
              await this.db.insert<any>('balances', { wallet_id: user.walletId, token_id: token.id, balance: balance });
            }
          }`;

const newPortfolioLogic = `          if (liveBalances.failed && typeof liveBalances.balances[token.id] === 'undefined') {
            balance = cachedBalance;
          } else {
            balance = liveBalances.balances[token.id] || 0.0;
            if (balRecord) {
              await this.db.update<any>('balances', balRecord.id, { balance: balance });
            } else {
              await this.db.insert<any>('balances', { wallet_id: user.walletId, token_id: token.id, balance: balance });
            }
          }`;

code = code.replace(oldPortfolioLogic, newPortfolioLogic);

fs.writeFileSync('backend/src/controllers/wallet.controller.ts', code);
