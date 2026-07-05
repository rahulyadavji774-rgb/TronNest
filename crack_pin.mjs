import fs from 'fs';
import crypto from 'crypto';

const wallets = JSON.parse(fs.readFileSync('data/wallets.json', 'utf8'));
const w = wallets[0];
const encKey = w.encrypted_private_key;

const [saltHex, ivHex, dataHex] = encKey.split(':');
const salt = Buffer.from(saltHex, 'hex');
const iv = Buffer.from(ivHex, 'hex');
const data = Buffer.from(dataHex, 'hex');

function tryPin(pin) {
  try {
    const key = crypto.pbkdf2Sync(pin, salt, 100000, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    const tag = data.slice(data.length - 16);
    const ciphertext = data.slice(0, data.length - 16);
    decipher.setAuthTag(tag);
    let dec = decipher.update(ciphertext, undefined, 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (e) {
    return null;
  }
}

const common = ['123456', '000000', '111111', '123123', '654321', '999999', '888888', '777777', '222222', '333333', '444444', '555555', '666666'];
for (const p of common) {
  if (tryPin(p)) {
    console.log('FOUND PIN:', p);
    process.exit(0);
  }
}
console.log('Not in common list');
