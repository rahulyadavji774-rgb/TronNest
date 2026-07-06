const fs = require('fs');

let code = fs.readFileSync('backend/src/db/schema.ts', 'utf8');

code = code.replace(
  /failedAttempts: int\('failed_attempts'\)\.default\(0\),/g,
  "failedAttempts: int('failed_attempts').notNull().default(0),"
);

fs.writeFileSync('backend/src/db/schema.ts', code);
