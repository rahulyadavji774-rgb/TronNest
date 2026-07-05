const fs = require('fs');
let code = fs.readFileSync('package.json', 'utf8');

// The startup requirement: On startup the application must load everything from the database. 
// No information should ever be stored only in browser storage.
// We have satisfied these by porting everything to SQL.

