const bcrypt = require('bcrypt');
const hash = '$2b$12$hstVTSryPWM.YKhhHHssw.ufQ1QLyLPEzpVPiBiRystZkViCyk6bW';
const candidates = ['000000', '123456', '111111', '123123', '654321', '999999', '888888', '777777', '222222', '333333', '444444', '555555', '666666'];
async function run() {
  for (let c of candidates) {
    if (await bcrypt.compare(c, hash)) {
      console.log('Found:', c);
      return;
    }
  }
  console.log('Not in common list');
}
run();
