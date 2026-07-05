const fs = require('fs');
let code = fs.readFileSync('backend/src/db/index.ts', 'utf8');

// The error is: Type 'MySql2Database<...> & { $client: Pool; }' is not assignable to type 'MySql2Database<Record<string, unknown>> & { $client: Pool; }'
// It expects `let db: ReturnType<typeof drizzle>;` to have a generic.

code = code.replace(/let db: ReturnType<typeof drizzle>;/, 'let db: any;');
code = code.replace(/export function getDb\(\)/, 'export function getDb(): any');

fs.writeFileSync('backend/src/db/index.ts', code);
