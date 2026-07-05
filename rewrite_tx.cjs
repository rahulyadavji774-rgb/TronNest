const fs = require('fs');
let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

// The block starts with "const recipientWallet = await this.db.findOne('wallets'"
// and ends after "this.clearBlockchainCache(recipientWallet.id);"
// We can find this block and wrap it.

const startRegex = /const recipientWallet = await this\.db\.findOne<any>\('wallets', \{ address: recipientAddress \}\);/g;
const startMatch = startRegex.exec(code);

if (startMatch) {
  console.log('Found start of internal transfer block.');
  // This is too brittle. 
} else {
  console.log('Not found');
}
