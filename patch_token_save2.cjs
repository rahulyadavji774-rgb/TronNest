const fs = require('fs');
const file = 'src/components/AdminPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

const additionalSaves = `
      await fetch('/api/admin/tokens/' + (editSupplyLocked ? 'lock' : 'unlock') + '-supply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${adminToken}\` },
        body: JSON.stringify({ tokenId: editingToken.id })
      });
`;

code = code.replace(/await fetch\('\/api\/admin\/tokens\/' \+ \(editWithdrawEnabled \? 'enable' : 'disable'\) \+ '-withdraw',\s*\{[\s\S]*?\}\);/, match => match + '\n' + additionalSaves);
fs.writeFileSync(file, code);
