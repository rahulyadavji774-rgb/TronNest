const fs = require('fs');
const file = 'src/components/AdminPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

const stateAddition = `
  const [editBuyPrice, setEditBuyPrice] = useState('1.0');
  const [editSellPrice, setEditSellPrice] = useState('1.0');
  const [editAutoPrice, setEditAutoPrice] = useState(false);
`;

code = code.replace(/const \[editPrice, setEditPrice\] = useState\('1\.0'\);/, match => match + '\n' + stateAddition);

const formAddition = `
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-neutral-500 font-mono uppercase">Buy Price (USD)</label>
                              <input
                                type="number"
                                step="any"
                                value={editBuyPrice}
                                onChange={(e) => setEditBuyPrice(e.target.value)}
                                className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-green-400 focus:outline-none"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-neutral-500 font-mono uppercase">Sell Price (USD)</label>
                              <input
                                type="number"
                                step="any"
                                value={editSellPrice}
                                onChange={(e) => setEditSellPrice(e.target.value)}
                                className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-red-400 focus:outline-none"
                              />
                            </div>
                            <div className="col-span-2 flex items-center justify-between p-2 bg-neutral-950 border border-neutral-800 rounded-lg">
                              <span className="text-[10px] text-neutral-500 font-mono uppercase">Auto Price Feed (Oracle)</span>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={editAutoPrice} onChange={(e) => setEditAutoPrice(e.target.checked)} className="sr-only peer" />
                                <div className="w-9 h-5 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                              </label>
                            </div>
`;

code = code.replace(/(<label className="text-\[9px\] text-neutral-500 font-mono uppercase">Manual Price \(USD\)<\/label>\s*<input\s*type="number"\s*step="any"\s*value=\{editPrice\}\s*onChange=\{\(e\) => setEditPrice\(e\.target\.value\)\}\s*required\s*className="p-2\.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-red-400"\s*\/>\s*<\/div>)/, match => match + '\n' + formAddition);

fs.writeFileSync(file, code);
