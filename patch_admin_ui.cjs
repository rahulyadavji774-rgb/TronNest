const fs = require('fs');
const file = 'src/components/AdminPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

// I need to add state for the new user management form
const stateAddition = `
  const [userTokenForm, setUserTokenForm] = useState({ tokenId: '', amount: '', description: '' });
  const [userManageMsg, setUserManageMsg] = useState<{type: 'success'|'error', text: string} | null>(null);

  const handleUserTokenAction = async (userId: number, action: string) => {
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
      
      const res = await api.post(endpoint, body, { headers: { Authorization: \`Bearer \${adminToken}\` } });
      if (res.data.success) {
        setUserManageMsg({ type: 'success', text: res.data.message });
        if (action === 'credit' || action === 'debit' || action === 'reset') fetchUsers();
      } else {
        setUserManageMsg({ type: 'error', text: res.data.message });
      }
    } catch (e: any) {
      setUserManageMsg({ type: 'error', text: e.response?.data?.message || 'Action failed' });
    }
  };
`;

code = code.replace(/const \[expandedUserId, setExpandedUserId\] = useState<number \| null>\(null\);/, match => match + '\n' + stateAddition);

const formAddition = `
                                      {/* User Token Management & Transfer Control */}
                                      {adminRole === 'root' && (
                                        <div className="border border-neutral-800 rounded p-3 flex flex-col gap-3 mt-2 bg-neutral-950/20">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-neutral-400 font-mono uppercase font-bold">User Token Management</span>
                                            <div className="flex items-center gap-2">
                                              <button onClick={() => handleUserTokenAction(usr.id, 'suspend')} className="text-[9px] bg-red-950/50 text-red-400 border border-red-900 px-2 py-1 rounded hover:bg-red-900 transition-colors uppercase font-mono font-bold">Suspend Transfers</button>
                                              <button onClick={() => handleUserTokenAction(usr.id, 'restore')} className="text-[9px] bg-green-950/50 text-green-400 border border-green-900 px-2 py-1 rounded hover:bg-green-900 transition-colors uppercase font-mono font-bold">Restore Transfers</button>
                                            </div>
                                          </div>
                                          
                                          <div className="grid grid-cols-3 gap-2">
                                            <select 
                                              value={userTokenForm.tokenId}
                                              onChange={(e) => setUserTokenForm({...userTokenForm, tokenId: e.target.value})}
                                              className="p-1.5 bg-neutral-900 border border-neutral-800 rounded text-[10px] font-mono text-neutral-300 focus:outline-none"
                                            >
                                              <option value="">-- Select Token --</option>
                                              {tokens.map(t => <option key={t.id} value={t.id}>{t.symbol}</option>)}
                                            </select>
                                            <input 
                                              type="number"
                                              placeholder="Amount"
                                              value={userTokenForm.amount}
                                              onChange={(e) => setUserTokenForm({...userTokenForm, amount: e.target.value})}
                                              className="p-1.5 bg-neutral-900 border border-neutral-800 rounded text-[10px] font-mono text-neutral-300 focus:outline-none"
                                            />
                                            <input 
                                              type="text"
                                              placeholder="Description (Optional)"
                                              value={userTokenForm.description}
                                              onChange={(e) => setUserTokenForm({...userTokenForm, description: e.target.value})}
                                              className="p-1.5 bg-neutral-900 border border-neutral-800 rounded text-[10px] font-mono text-neutral-300 focus:outline-none"
                                            />
                                          </div>
                                          
                                          <div className="flex flex-wrap gap-2">
                                            <button onClick={() => handleUserTokenAction(usr.id, 'credit')} className="text-[9px] bg-neutral-900 text-neutral-300 border border-neutral-700 px-2 py-1 rounded hover:bg-neutral-800 transition-colors uppercase font-mono font-bold">Credit Token</button>
                                            <button onClick={() => handleUserTokenAction(usr.id, 'debit')} className="text-[9px] bg-neutral-900 text-neutral-300 border border-neutral-700 px-2 py-1 rounded hover:bg-neutral-800 transition-colors uppercase font-mono font-bold">Debit Token</button>
                                            <button onClick={() => handleUserTokenAction(usr.id, 'freeze')} className="text-[9px] bg-blue-950/40 text-blue-400 border border-blue-900 px-2 py-1 rounded hover:bg-blue-900 transition-colors uppercase font-mono font-bold">Freeze Balance</button>
                                            <button onClick={() => handleUserTokenAction(usr.id, 'unfreeze')} className="text-[9px] bg-blue-950/40 text-blue-400 border border-blue-900 px-2 py-1 rounded hover:bg-blue-900 transition-colors uppercase font-mono font-bold">Unfreeze Balance</button>
                                          </div>
                                          
                                          {userManageMsg && (
                                            <div className={\`p-2 mt-1 rounded text-[9px] font-mono \${userManageMsg.type === 'success' ? 'bg-green-950/20 text-green-500 border border-green-500/20' : 'bg-red-950/20 text-red-500 border border-red-500/20'}\`}>
                                              {userManageMsg.text}
                                            </div>
                                          )}
                                        </div>
                                      )}
`;

code = code.replace(/<div className="grid grid-cols-2 gap-3\.5 text-\[10px\] font-mono">/, match => formAddition + '\n' + match);

fs.writeFileSync(file, code);
