const fs = require('fs');
let code = fs.readFileSync('test_drizzle_insert.ts', 'utf8');
code = code.replace(/index\.js/, 'index.ts');
fs.writeFileSync('test_drizzle_insert.ts', code);
