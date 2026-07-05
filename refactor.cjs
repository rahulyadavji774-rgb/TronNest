const fs = require('fs');
const files = [
  'backend/src/controllers/admin.controller.ts',
  'backend/src/controllers/auth.controller.ts',
  'backend/src/controllers/wallet.controller.ts'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace this.db.method with await this.db.method
  content = content.replace(/this\.db\.(findOne|findById|findMany|insert|update|delete|query)/g, 'await this.db.$1');
  
  // Remove parseInt for IDs
  content = content.replace(/parseInt\((userId|tokenId|walletId|adminId|id)\)/g, '$1');
  
  fs.writeFileSync(file, content);
}
console.log('Refactored controllers');
