const fs = require('fs');
let code = fs.readFileSync('backend/src/config/db.ts', 'utf8');
code = code.replace(
  /try \{\n      await db\.insert\(table\)\.values\(newItem\);\n    \} catch/,
  `try {
      console.log("INSERT DEBUG:", tableName, JSON.stringify(newItem));
      await db.insert(table).values(newItem);
    } catch`
);
fs.writeFileSync('backend/src/config/db.ts', code);
