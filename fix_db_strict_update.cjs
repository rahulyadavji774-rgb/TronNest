const fs = require('fs');
let code = fs.readFileSync('backend/src/config/db.ts', 'utf8');

code = code.replace(
  /const schemaKeys = Object.keys\(table\);\s*const providedKeys = Object.keys\(newItem\);\s*for \(const key of providedKeys\) \{\s*if \(!schemaKeys.includes\(key\)\) \{\s*logger.warn\(\`\[Drizzle ORM Warning\] Field '\$\{key\}' is present in the payload but MISSING from the \$\{tableName\} schema definition! Drizzle will silently discard it.\`\);\s*\}\s*\}/g,
  `const schemaKeys = Object.keys(table);
    const providedKeys = typeof newItem !== 'undefined' ? Object.keys(newItem) : Object.keys(convertKeysToCamel(updates));
    for (const key of providedKeys) {
      if (!schemaKeys.includes(key)) {
        logger.warn(\`[Drizzle ORM Warning] Field '\${key}' is present in the payload but MISSING from the \${tableName} schema definition! Drizzle will silently discard it.\`);
      }
    }`
);

fs.writeFileSync('backend/src/config/db.ts', code);
