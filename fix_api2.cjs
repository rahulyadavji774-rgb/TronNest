const fs = require('fs');
const file = 'src/components/AdminPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `const res = await api.post(endpoint, body, { headers: { Authorization: \`Bearer \${adminToken}\` } });
      if (res.data.success) {
        setUserManageMsg({ type: 'success', text: res.data.message });
        if (action === 'credit' || action === 'debit' || action === 'reset') fetchUsers();
      } else {
        setUserManageMsg({ type: 'error', text: res.data.message });
      }`;

const replacement = `const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${adminToken}\` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        setUserManageMsg({ type: 'success', text: data.message });
        if (action === 'credit' || action === 'debit' || action === 'reset') {
          // just trigger a refresh
        }
      } else {
        setUserManageMsg({ type: 'error', text: data.message });
      }`;

code = code.replace(target, replacement);
fs.writeFileSync(file, code);
