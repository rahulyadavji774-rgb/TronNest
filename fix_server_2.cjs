const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /await StartupService\.runSystemRepair\(\);\s*catch \(e: any\) \{/,
  `await StartupService.runSystemRepair();\n    } catch (e: any) {`
);

fs.writeFileSync('server.ts', code);
