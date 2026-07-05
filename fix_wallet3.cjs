const fs = require('fs');
let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

// There are a lot of missing type assertions. Let's do a quick regex to map commonly accessed properties off untyped vars to any casts.
// Instead of rewriting hundreds of lines, we can declare types for the DB methods explicitly.

code = code.replace(/await this\.db\.findOne\(/g, "await this.db.findOne<any>(");
code = code.replace(/await this\.db\.findMany\(/g, "await this.db.findMany<any>(");
code = code.replace(/await this\.db\.query\(/g, "await this.db.query<any>(");
code = code.replace(/await this\.db\.insert\(/g, "await this.db.insert<any>(");
code = code.replace(/await this\.db\.update\(/g, "await this.db.update<any>(");
code = code.replace(/await this\.db\.findById\(/g, "await this.db.findById<any>(");

fs.writeFileSync('backend/src/controllers/wallet.controller.ts', code);
