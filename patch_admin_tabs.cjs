const fs = require('fs');
const file = 'src/components/AdminPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

// Add new imports
const extraImports = `, Radio, BarChart2, Database, Wrench, ShieldAlert, CheckCircle, XCircle, Clock, Save, Download, FileJson, Mail, Bell, Smartphone, Monitor`;
code = code.replace(/Unlock/, match => match + extraImports);

// Add tabs
const tabsRegex = /\[\s*\{\s*id:\s*'dashboard'[\s\S]*?\}\s*\]\.map\(\(tab\)\s*=>\s*\{/;
const newTabsArray = `[
                { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
                { id: 'users', label: 'Users', icon: Users },
                { id: 'tokens', label: 'Custom Tokens', icon: Coins },
                { id: 'balances', label: 'Mint/Deduct', icon: Sparkles },
                { id: 'ledger', label: 'Transaction History', icon: ListOrdered },
                { id: 'logs', label: 'Audit Logs', icon: FileText },
                ...(adminRole === 'root' ? [
                  { id: 'settings', label: 'Settings', icon: Settings },
                  { id: 'broadcast', label: 'Broadcast', icon: Radio },
                  { id: 'reports', label: 'Reports', icon: BarChart2 },
                  { id: 'monitor', label: 'Monitor', icon: Activity },
                  { id: 'backup', label: 'Backup', icon: Database },
                  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
                  { id: 'api', label: 'API', icon: KeyRound },
                  { id: 'security_logs', label: 'Security Logs', icon: ShieldAlert }
                ] : [])
              ].map((tab) => {`;

code = code.replace(tabsRegex, newTabsArray);

fs.writeFileSync(file, code);
