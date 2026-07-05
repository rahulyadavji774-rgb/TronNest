const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// Replace the initDb block
code = code.replace(/await initDb\(process\.env\.DATABASE_URL\);\s*logger\.info\([^;]+\);/g, `
    if (!process.env.DATABASE_URL) {
      logger.error('CRITICAL ERROR: DATABASE_URL environment variable is missing.');
      logger.error('TronNest now uses a production-ready MariaDB/MySQL database architecture.');
      logger.error('Please configure DATABASE_URL to start the server.');
      // We do not exit to prevent crash loop, but we will throw an error to stop boot.
      throw new Error('DATABASE_URL missing');
    }
    await initDb(process.env.DATABASE_URL);
    logger.info('MariaDB/MySQL connected and migrations applied successfully.');
`);

fs.writeFileSync('server.ts', code);
