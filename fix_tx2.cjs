const fs = require('fs');

let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

// We will inject a manual transaction wrap around the internal transfer logic

const target = `
        // Deduct from sender
        await this.db.update('balances', senderBalanceRecord.id, { balance: senderBalance - numAmount });

        // Add to recipient
        const recipientBalanceRecord = await this.db.findOne('balances', { wallet_id: recipientWallet.id, token_id: token.id });
        if (recipientBalanceRecord) {
          const recipientBalance = parseFloat(recipientBalanceRecord.balance);
          await this.db.update('balances', recipientBalanceRecord.id, { balance: recipientBalance + numAmount });
        } else {
          await this.db.insert<any>('balances', { wallet_id: recipientWallet.id, token_id: token.id, balance: numAmount });
        }

        const txHash = '0x' + crypto.randomBytes(32).toString('hex');
`;

const replacement = `
        const txHash = '0x' + crypto.randomBytes(32).toString('hex');

        await this.db.transaction(async (tx) => {
          // Deduct from sender
          await this.db.update('balances', senderBalanceRecord.id, { balance: senderBalance - numAmount }, tx);

          // Add to recipient
          const recipientBalanceRecord = await this.db.findOne('balances', { wallet_id: recipientWallet.id, token_id: token.id }, tx);
          if (recipientBalanceRecord) {
            const recipientBalance = parseFloat(recipientBalanceRecord.balance);
            await this.db.update('balances', recipientBalanceRecord.id, { balance: recipientBalance + numAmount }, tx);
          } else {
            await this.db.insert<any>('balances', { wallet_id: recipientWallet.id, token_id: token.id, balance: numAmount }, tx);
          }
        });
`;

code = code.replace(target, replacement);

fs.writeFileSync('backend/src/controllers/wallet.controller.ts', code);
