const fs = require('fs');
let code = fs.readFileSync('backend/src/db/schema.ts', 'utf8');

code = code.replace(
  /import \{([^}]+)\} from 'drizzle-orm\/mysql-core';/,
  "import {$1, bigint } from 'drizzle-orm/mysql-core';"
);

fs.writeFileSync('backend/src/db/schema.ts', code);
