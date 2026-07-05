const fs = require('fs');
let schemaSql = fs.readFileSync('backend/database/schema.sql', 'utf8');
schemaSql = schemaSql.replace(/\`encrypted_seed\`/g, '`encrypted_seed_phrase`');
fs.writeFileSync('backend/database/schema.sql', schemaSql);
