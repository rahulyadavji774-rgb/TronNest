const fs = require('fs');
let lines = fs.readFileSync('backend/src/config/db.ts', 'utf8').split('\n');
let out = [];
for (let line of lines) {
  if (line.includes('typeof newItem !==') || line.includes('schemaKeys = Object.keys') || line.includes('[Drizzle ORM Warning]') || line.includes('!schemaKeys.includes') || line.includes('providedKeys')) {
    continue; // skip
  }
  out.push(line);
}
fs.writeFileSync('backend/src/config/db.ts', out.join('\n'));
