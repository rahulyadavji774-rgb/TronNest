const fs = require('fs');
const file = 'src/components/AdminPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

const additionalSaves = `
      // Additional flag saves
      await fetch('/api/admin/tokens/' + (editTradingEnabled ? 'enable' : 'disable') + '-trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${adminToken}\` },
        body: JSON.stringify({ tokenId: editingToken.id })
      });
      await fetch('/api/admin/tokens/' + (editDepositEnabled ? 'enable' : 'disable') + '-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${adminToken}\` },
        body: JSON.stringify({ tokenId: editingToken.id })
      });
      await fetch('/api/admin/tokens/' + (editWithdrawEnabled ? 'enable' : 'disable') + '-withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${adminToken}\` },
        body: JSON.stringify({ tokenId: editingToken.id })
      });
`;

code = code.replace(/await fetch\('\/api\/admin\/tokens\/' \+ \(editActive \? 'show' : 'hide'\) \+ '',\s*\{[\s\S]*?\}\);/, match => match + '\n' + additionalSaves);
fs.writeFileSync(file, code);
