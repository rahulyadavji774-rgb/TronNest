const fs = require('fs');
let code = fs.readFileSync('backend/src/config/db.ts', 'utf8');

// I accidentally did `query<T = any>` in the invocation instead of the declaration.
code = code.replace(/await this\.query<T = any>\(tableName, db\)/g, "await this.query<T>(tableName, db)");

fs.writeFileSync('backend/src/config/db.ts', code);
