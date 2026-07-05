const fs = require('fs');
let db = fs.readFileSync('backend/src/config/db.ts', 'utf8');

if (!db.includes("import { logger } from '../utils/logger';")) {
  db = "import { logger } from '../utils/logger';\n" + db;
}

db = db.replace(
  /await db\.insert\(table\)\.values\(newItem\);/g,
  `try {
      await db.insert(table).values(newItem);
    } catch (error: any) {
      logger.error(\`Failed query in insert: \${tableName}\`);
      logger.error(\`error message: \${error.message}\`);
      logger.error(\`error cause: \${error.cause}\`);
      logger.error(\`error stack: \${error.stack}\`);
      logger.error(\`parameters: \${JSON.stringify(newItem)}\`);
      throw error;
    }`
);

db = db.replace(
  /await db\.update\(table\)\.set\(convertKeysToCamel\(updates\)\)\.where\(eq\(table\.id, id\)\);/g,
  `try {
      await db.update(table).set(convertKeysToCamel(updates)).where(eq(table.id, id));
    } catch (error: any) {
      logger.error(\`Failed query in update: \${tableName}\`);
      logger.error(\`error message: \${error.message}\`);
      logger.error(\`error cause: \${error.cause}\`);
      logger.error(\`error stack: \${error.stack}\`);
      logger.error(\`parameters: \${JSON.stringify(updates)}\`);
      throw error;
    }`
);

fs.writeFileSync('backend/src/config/db.ts', db);
