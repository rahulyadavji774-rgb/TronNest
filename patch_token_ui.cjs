const fs = require('fs');
const file = 'src/components/AdminPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

const stateAddition = `
  const [editTradingEnabled, setEditTradingEnabled] = useState(true);
  const [editDepositEnabled, setEditDepositEnabled] = useState(true);
  const [editWithdrawEnabled, setEditWithdrawEnabled] = useState(true);
`;

code = code.replace(/const \[editAutoPrice, setEditAutoPrice\] = useState\(false\);/, match => match + '\n' + stateAddition);

code = code.replace(/setEditTransferEnabled\(token\.transferEnabled !== false\);/, match => match + `
    setEditTradingEnabled(token.trading_enabled !== false);
    setEditDepositEnabled(token.deposit_enabled !== false);
    setEditWithdrawEnabled(token.withdraw_enabled !== false);
`);

const formAddition = `
                            <button
                              type="button"
                              onClick={() => setEditTradingEnabled(!editTradingEnabled)}
                              className={\`p-2 rounded-lg border text-[10px] font-mono font-bold uppercase \${
                                editTradingEnabled 
                                  ? 'bg-green-950/20 text-green-500 border-green-500/20' 
                                  : 'bg-red-950/20 text-red-500 border-red-500/20'
                              }\`}
                            >
                              Trading: {editTradingEnabled ? 'Enabled' : 'Disabled'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditDepositEnabled(!editDepositEnabled)}
                              className={\`p-2 rounded-lg border text-[10px] font-mono font-bold uppercase \${
                                editDepositEnabled 
                                  ? 'bg-green-950/20 text-green-500 border-green-500/20' 
                                  : 'bg-red-950/20 text-red-500 border-red-500/20'
                              }\`}
                            >
                              Deposit: {editDepositEnabled ? 'Enabled' : 'Disabled'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditWithdrawEnabled(!editWithdrawEnabled)}
                              className={\`p-2 rounded-lg border text-[10px] font-mono font-bold uppercase \${
                                editWithdrawEnabled 
                                  ? 'bg-green-950/20 text-green-500 border-green-500/20' 
                                  : 'bg-red-950/20 text-red-500 border-red-500/20'
                              }\`}
                            >
                              Withdraw: {editWithdrawEnabled ? 'Enabled' : 'Disabled'}
                            </button>
`;

code = code.replace(/(<button\s*type="button"\s*onClick=\{\(\) => setEditActive\(!editActive\)\}[\s\S]*?<\/button>\s*<\/div>)/, match => match.replace('<\/div>', formAddition + '<\/div>').replace('grid-cols-3', 'grid-cols-3 md:grid-cols-6'));

fs.writeFileSync(file, code);
