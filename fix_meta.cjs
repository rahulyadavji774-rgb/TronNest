const fs = require('fs');
let journal = JSON.parse(fs.readFileSync('backend/src/db/migrations/meta/_journal.json', 'utf8'));
journal.entries = journal.entries.slice(0, 7); // keep 0 to 6
fs.writeFileSync('backend/src/db/migrations/meta/_journal.json', JSON.stringify(journal, null, 2));

for (let i = 7; i <= 10; i++) {
  try {
    fs.unlinkSync(`backend/src/db/migrations/meta/000${i}_snapshot.json`);
  } catch (e) {}
}
