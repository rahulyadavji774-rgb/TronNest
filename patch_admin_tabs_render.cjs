const fs = require('fs');
const file = 'src/components/AdminPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

const additionalTabsRender = `
                  {activeTab === 'settings' && <SystemSettings />}
                  {activeTab === 'broadcast' && <BroadcastCenter />}
                  {activeTab === 'reports' && <Reports />}
                  {activeTab === 'monitor' && <SystemMonitor />}
                  {activeTab === 'backup' && <BackupCenter />}
                  {activeTab === 'maintenance' && <MaintenanceMode />}
                  {activeTab === 'api' && <ApiManagement />}
                  {activeTab === 'security_logs' && <SecurityLogs />}
`;

code = code.replace(/<\/AnimatePresence>/, match => additionalTabsRender + '                ' + match);
fs.writeFileSync(file, code);
