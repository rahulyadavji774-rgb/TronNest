const fs = require('fs');
let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

// There are more errors about unknown type, let's just make the db instance return `any` implicitly or add `<any>` everywhere.
// The easiest fix is to change JsonDatabase.ts to default T to any.

let dbCode = fs.readFileSync('backend/src/config/db.ts', 'utf8');
dbCode = dbCode.replace(/query<T>/g, 'query<T = any>');
dbCode = dbCode.replace(/findById<T extends \{ id: string \}>/g, 'findById<T extends { id: string } = any>');
dbCode = dbCode.replace(/findOne<T>/g, 'findOne<T = any>');
dbCode = dbCode.replace(/findMany<T>/g, 'findMany<T = any>');
dbCode = dbCode.replace(/insert<T extends \{ id\?: string \}>/g, 'insert<T extends { id?: string } = any>');
dbCode = dbCode.replace(/update<T extends \{ id: string \}>/g, 'update<T extends { id: string } = any>');
dbCode = dbCode.replace(/transaction<T>/g, 'transaction<T = any>');
fs.writeFileSync('backend/src/config/db.ts', dbCode);
