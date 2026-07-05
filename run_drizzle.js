const { spawn } = require('child_process');

const proc = spawn('npx', ['drizzle-kit', 'generate'], {
  stdio: ['pipe', process.stdout, process.stderr]
});

// Mock TTY environment variable maybe? Or use node-pty
