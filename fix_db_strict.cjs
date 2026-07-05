const fs = require('fs');
let code = fs.readFileSync('backend/src/config/db.ts', 'utf8');

const strictLogic = `
    const table = getTable(tableName);
    
    // Strict schema validation: Ensure all provided keys exist in the Drizzle table schema
    const schemaKeys = Object.keys(table);
    const providedKeys = Object.keys(newItem);
    for (const key of providedKeys) {
      if (!schemaKeys.includes(key)) {
        logger.warn(\`[Drizzle ORM Warning] Field '\${key}' is present in the payload but MISSING from the \${tableName} schema definition! Drizzle will silently discard it.\`);
      }
    }
    
    try {
`;

code = code.replace(
  /const table = getTable\(tableName\);\s*try \{/g,
  strictLogic
);

fs.writeFileSync('backend/src/config/db.ts', code);
