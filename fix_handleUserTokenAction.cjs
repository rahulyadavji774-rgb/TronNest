const fs = require('fs');
const file = 'src/components/AdminPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

const regex = /const handleUserTokenAction = async \(\s*userId:\s*number,\s*action:\s*string\s*\) => \{[\s\S]*?const \[tokenQuery, setTokenQuery\] = useState\(''\);/;

const replacement = `const handleUserTokenAction = async (userId: number, action: string) => {
    try {
      setUserManageMsg(null);
      let endpoint = '';
      let body: any = { userId };
      
      if (action === 'suspend') endpoint = '/api/admin/users/suspend-transfers';
      if (action === 'restore') endpoint = '/api/admin/users/restore-transfers';
      
      if (action === 'freeze' || action === 'unfreeze' || action === 'reset' || action === 'credit' || action === 'debit') {
        if (!userTokenForm.tokenId) {
          setUserManageMsg({ type: 'error', text: 'Select a token first.' });
          return;
        }
        body.tokenId = userTokenForm.tokenId;
        endpoint = \`/api/admin/users/balances/\${action}\`;
        
        if (action === 'credit' || action === 'debit') {
          if (!userTokenForm.amount || parseFloat(userTokenForm.amount) <= 0) {
            setUserManageMsg({ type: 'error', text: 'Valid amount required.' });
            return;
          }
          body.amount = userTokenForm.amount;
          body.description = userTokenForm.description;
        }
      }
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${adminToken}\` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        setUserManageMsg({ type: 'success', text: data.message });
      } else {
        setUserManageMsg({ type: 'error', text: data.message });
      }
    } catch (e: any) {
      setUserManageMsg({ type: 'error', text: e.message || 'Action failed' });
    }
  };

  const [tokenQuery, setTokenQuery] = useState('');`;

code = code.replace(regex, replacement);
fs.writeFileSync(file, code);
