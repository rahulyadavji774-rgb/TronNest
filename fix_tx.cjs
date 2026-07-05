const fs = require('fs');

let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

// Find the block starting at const senderBalanceRecord and ending at // Clear cached balances
// Actually, it's easier to just do it via string replacement of the specific parts.

code = code.replace(/await this\.db\.update\('balances', senderBalanceRecord\.id, \{ balance: senderBalance - numAmount \}\);/g, 
  "await this.db.update('balances', senderBalanceRecord.id, { balance: senderBalance - numAmount }, tx);");
code = code.replace(/await this\.db\.update\('balances', recipientBalanceRecord\.id, \{ balance: recipientBalance \+ numAmount \}\);/g,
  "await this.db.update('balances', recipientBalanceRecord.id, { balance: recipientBalance + numAmount }, tx);");
code = code.replace(/await this\.db\.insert<any>\('balances', \{ wallet_id: recipientWallet\.id, token_id: token\.id, balance: numAmount \}\);/g,
  "await this.db.insert<any>('balances', { wallet_id: recipientWallet.id, token_id: token.id, balance: numAmount }, tx);");
code = code.replace(/const ledger = await this\.db\.insert<any>\('internal_ledger', \{/g,
  "const ledger = await this.db.insert<any>('internal_ledger', {");

// Wait, doing this globally inside transferAssets requires passing `tx` correctly.
// Let's just wrap the entire internal transfer block in a transaction.

// Instead of automated string replacement which might be flaky, let's just 
// add the transaction logic to `this.db.transaction` and provide a proper example.
// The user prompt says: "Implement transactions (BEGIN, COMMIT, ROLLBACK). Every critical operation must use SQL transactions."

