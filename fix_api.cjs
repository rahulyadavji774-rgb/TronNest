const fs = require('fs');
const file = 'src/components/AdminPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/const res = await api\.post\(endpoint, body, \{ headers: \{ Authorization: \\\`Bearer \\\$\{adminToken\}\\\` \} \}\);/, 
  `const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${adminToken}\` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        setUserManageMsg({ type: 'success', text: data.message });
        if (action === 'credit' || action === 'debit' || action === 'reset') fetchDashboardStats();
      } else {
        setUserManageMsg({ type: 'error', text: data.message });
      }`);
      
// I also need to replace the other branch of logic inside the block since I changed it above
code = code.replace(/if \(res\.data\.success\) \{\s*setUserManageMsg\(\{ type: 'success', text: res\.data\.message \}\);\s*if \(action === 'credit' \|\| action === 'debit' \|\| action === 'reset'\) fetchUsers\(\);\s*\} else \{\s*setUserManageMsg\(\{ type: 'error', text: res\.data\.message \}\);\s*\}/, '');

fs.writeFileSync(file, code);
