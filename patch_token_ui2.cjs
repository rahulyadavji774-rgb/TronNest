const fs = require('fs');
const file = 'src/components/AdminPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

const stateAddition = `
  const [editSupplyLocked, setEditSupplyLocked] = useState(false);
`;

code = code.replace(/const \[editWithdrawEnabled, setEditWithdrawEnabled\] = useState\(true\);/, match => match + '\n' + stateAddition);

code = code.replace(/setEditWithdrawEnabled\(token\.withdraw_enabled !== false\);/, match => match + `
    setEditSupplyLocked(!!token.supply_locked);
`);

const formAddition = `
                            <button
                              type="button"
                              onClick={() => setEditSupplyLocked(!editSupplyLocked)}
                              className={\`p-2 rounded-lg border text-[10px] font-mono font-bold uppercase \${
                                editSupplyLocked 
                                  ? 'bg-red-950/20 text-red-500 border-red-500/20'
                                  : 'bg-green-950/20 text-green-500 border-green-500/20' 
                              }\`}
                            >
                              Supply: {editSupplyLocked ? 'Locked' : 'Unlocked'}
                            </button>
`;

code = code.replace(/(<button\s*type="button"\s*onClick=\{\(\) => setEditActive\(!editActive\)\}[\s\S]*?<\/button>\s*)/, match => match + formAddition);

fs.writeFileSync(file, code);
