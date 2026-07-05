const fs = require('fs');

let schema = fs.readFileSync('backend/src/db/schema.ts', 'utf8');

schema = schema.replace(
  /username: varchar\('username', \{ length: 100 \}\)\.unique\(\),\n  email: varchar\('email', \{ length: 255 \}\)\.unique\(\),\n  passwordHash: varchar\('password_hash', \{ length: 255 \}\),\n/,
  ""
);

schema = schema.replace(
  /lastLogin: timestamp\('last_login'\),\n/,
  ""
);

fs.writeFileSync('backend/src/db/schema.ts', schema);
