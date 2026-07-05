const axios = require('axios');

async function run() {
  const address = 'TFWrrQbrubRozG7g5FT7ZMy5ASJrt1XtGg'; // from users.json
  const url = 'http://localhost:3000/api/auth/verify-passcode';
  
  for (let i = 1; i <= 11; i++) {
    try {
      const res = await axios.post(url, {
        address,
        passcode: '000000'
      });
      console.log(`Attempt ${i}: Success`, res.data);
    } catch (err) {
      console.log(`Attempt ${i}: Failed with status`, err.response?.status, err.response?.data?.message);
    }
  }
}

run();
