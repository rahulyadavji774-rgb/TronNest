const fs = require('fs');
let content = fs.readFileSync('src/components/PasscodeScreen.tsx', 'utf8');
content = content.replace(/if \(parseInt\(lockoutUntilStr\) \{/g, 'if (lockoutUntilStr) {');
fs.writeFileSync('src/components/PasscodeScreen.tsx', content);
