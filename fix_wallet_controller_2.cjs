const fs = require('fs');

let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

const oldLogic = `          if (liveBalances.failed) {
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

const newLogic = `          if (liveBalances.failed && typeof liveBalances.balances[token.id] === 'undefined') {
            balance = cachedBalance;
          } else {
            balance = liveBalances.balances[token.id] || 0;
            if (balRecord) {
              await this.db.update<any>('balances', balRecord.id, { balance: balance });
            } else {
              await this.db.insert<any>('balances', { wallet_id: user.walletId, token_id: token.id, balance: balance });
            }
          }`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('backend/src/controllers/wallet.controller.ts', code);
