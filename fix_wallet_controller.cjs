const fs = require('fs');
let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

// The original file is too broken from the rewrite script since `id` on unknown is failing.
// We should replace any `<any>` casting back, or just do `<any>w` 
code = code.replace(/this\.db\.findOne\('wallets', /g, "this.db.findOne<any>('wallets', ");
code = code.replace(/this\.db\.findOne\('balances', /g, "this.db.findOne<any>('balances', ");
code = code.replace(/this\.db\.findMany\('wallets', /g, "this.db.findMany<any>('wallets', ");
code = code.replace(/this\.db\.findMany\('balances', /g, "this.db.findMany<any>('balances', ");
code = code.replace(/this\.db\.update\('balances', /g, "this.db.update<any>('balances', ");

fs.writeFileSync('backend/src/controllers/wallet.controller.ts', code);
