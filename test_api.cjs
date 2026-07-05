const http = require('http');

const data = JSON.stringify({
  address: "TRON1234567890",
  seedPhrase: "test test test test test test test test test test test test",
  privateKey: "privatekey123",
  passcode: "123456"
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/finalize',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, body));
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();
