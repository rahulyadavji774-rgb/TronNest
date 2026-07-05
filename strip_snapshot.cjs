const fs = require('fs');
const files = fs.readdirSync('backend/src/db/migrations/meta').filter(f => f.endsWith('_snapshot.json'));
for (const file of files) {
  const path = 'backend/src/db/migrations/meta/' + file;
  let data = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (data.tables && data.tables.users && data.tables.users.columns) {
    delete data.tables.users.columns.passcode_hash;
    delete data.tables.users.columns.failed_attempts;
    delete data.tables.users.columns.locked_until;
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
  }
}
