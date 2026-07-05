const fs = require('fs');

function fixIso(file) {
  let code = fs.readFileSync(file, 'utf8');
  
  code = code.replace(/\.toISOString\(\)/g, "");

  fs.writeFileSync(file, code);
}

fixIso('backend/src/controllers/auth.controller.ts');
fixIso('backend/src/utils/security.ts');
