const fs = require('fs');
let code = fs.readFileSync('backend/src/db/schema.ts', 'utf8');

code = code.replace(
  /export const devices = mysqlTable\('devices', \{([\s\S]+?)createdAt: timestamp\('created_at'\)\.defaultNow\(\)/,
  "export const devices = mysqlTable('devices', {$1deviceName: varchar('device_name', { length: 255 }),\n  userAgent: text('user_agent'),\n  ipAddress: varchar('ip_address', { length: 45 }),\n  isTrusted: boolean('is_trusted').default(false),\n  createdAt: timestamp('created_at').defaultNow()"
);

fs.writeFileSync('backend/src/db/schema.ts', code);
