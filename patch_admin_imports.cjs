const fs = require('fs');
const file = 'src/components/AdminPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

const additionalImports = `
import { SystemSettings } from './admin/SystemSettings';
import { BroadcastCenter } from './admin/BroadcastCenter';
import { Reports } from './admin/Reports';
import { SystemMonitor } from './admin/SystemMonitor';
import { BackupCenter } from './admin/BackupCenter';
import { MaintenanceMode } from './admin/MaintenanceMode';
import { ApiManagement } from './admin/ApiManagement';
import { SecurityLogs } from './admin/SecurityLogs';
`;

code = code.replace(/import \{ ResponsiveContainer/, match => additionalImports + '\n' + match);
fs.writeFileSync(file, code);
