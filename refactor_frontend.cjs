const fs = require('fs');
const cp = require('child_process');

cp.execSync('find src/ -type f -name "*.ts" -o -name "*.tsx"', { encoding: 'utf8' }).split('\n').forEach(file => {
  if (!file) return;
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace id: number; with id: string;
  content = content.replace(/id: number/g, 'id: string');
  
  // Replace other number ids
  content = content.replace(/(_id|Id): number/g, '$1: string');
  content = content.replace(/internal_ledger_id: number \| null/g, 'internal_ledger_id: string | null');
  content = content.replace(/blockchain_tx_id: number \| null/g, 'blockchain_tx_id: string | null');

  // Replace parseInt(id) with id in frontend if any
  content = content.replace(/parseInt\(([^)]*id[^)]*)\)/gi, '$1');
  
  fs.writeFileSync(file, content);
});
console.log('Refactored frontend types for UUIDs');
