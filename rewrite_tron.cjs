const fs = require('fs');

let code = fs.readFileSync('backend/src/services/tron.service.ts', 'utf8');

// Replace everything from `public async getBalances(` down to the end of `_fetchBalancesOnChain`.
const startIdx = code.indexOf('public async getBalances(');
// find end of _fetchBalancesOnChain
const endIdx = code.indexOf('public async transferTRX('); // let's see where the next method starts

