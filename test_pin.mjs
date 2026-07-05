async function run() {
  const address = 'TFWrrQbrubRozG7g5FT7ZMy5ASJrt1XtGg'; // from users.json
  const url = 'http://localhost:3000/api/auth/verify-passcode';
  
  for (let i = 1; i <= 12; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, passcode: '000000' })
      });
      const data = await res.json();
      console.log(`Attempt ${i}: Status`, res.status, data.message);
    } catch (err) {
      console.log(`Attempt ${i}: Failed`, err.message);
    }
  }
}

run();
