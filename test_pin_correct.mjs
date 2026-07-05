async function run() {
  const address = 'TFWrrQbrubRozG7g5FT7ZMy5ASJrt1XtGg'; 
  const url = 'http://localhost:3000/api/auth/verify-passcode';
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, passcode: '000000' })
    });
    const data = await res.json();
    console.log(`Status`, res.status, data.message);
  } catch (err) {
    console.log(`Failed`, err.message);
  }
}

run();
