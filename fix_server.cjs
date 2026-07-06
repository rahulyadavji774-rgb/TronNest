const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// replace health check default MUSD creation with StartupService
const healthCheckStart = code.indexOf('const tokens = await db.query(\'tokens\');');
const healthCheckEnd = code.indexOf('} catch (e: any) {');
// Wait, actually I will just replace the specific tokens logic with a call to StartupService.
code = code.replace(
  /const tokens = await db\.query\('tokens'\);\s*if \(tokens\.length === 0\) \{[\s\S]*?\}\s*\}/,
  `}
      
      const { StartupService } = await import('./backend/src/services/StartupService');
      await StartupService.runSystemRepair();`
);

fs.writeFileSync('server.ts', code);
