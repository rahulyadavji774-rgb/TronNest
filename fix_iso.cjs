const fs = require('fs');

function fixIso(file) {
  let code = fs.readFileSync(file, 'utf8');
  
  // Replace `new Date(...).toISOString()` with `new Date(...)`
  // Replace `new Date().toISOString()` with `new Date()`
  
  code = code.replace(/new Date\(\)\.toISOString\(\)/g, "new Date()");
  code = code.replace(/new Date\(([^)]+)\)\.toISOString\(\)/g, "new Date($1)");

  // Also verifyPasscodeWithRateLimit might have some? Let's check security.ts
  fs.writeFileSync(file, code);
}

fixIso('backend/src/controllers/wallet.controller.ts');
fixIso('backend/src/controllers/auth.controller.ts');
fixIso('backend/src/utils/security.ts');
