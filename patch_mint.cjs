const fs = require('fs');
const file = 'backend/src/controllers/admin.controller.ts';
let code = fs.readFileSync(file, 'utf8');

const lockCheck = `
      if (token.supply_locked) {
        return res.status(400).json({ success: false, message: 'Token supply is locked' });
      }
`;

code = code.replace(/if \(!token\.is_internal\) \{[\s\S]*?return res\.status\(400\)\.json\(\{ success: false, message: 'Minting is only supported for off-chain internal custom tokens' \}\);\s*\}/g, match => match + lockCheck);
code = code.replace(/if \(!token\.is_internal\) \{[\s\S]*?return res\.status\(400\)\.json\(\{ success: false, message: 'Deducting is only supported for off-chain internal custom tokens' \}\);\s*\}/g, match => match + lockCheck);

fs.writeFileSync(file, code);
