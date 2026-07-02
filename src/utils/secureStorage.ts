/**
 * Secure Storage Utility using Web Crypto API (AES-GCM)
 */

// Derive a secure CryptoKey from a user passcode using PBKDF2
async function deriveKey(passcode: string, saltStr: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passcode),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(saltStr),
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext using a passcode/PIN
 */
export async function encryptData(text: string, passcode: string, salt: string = 'TronNest_Client_Salt_2026'): Promise<string> {
  try {
    const enc = new TextEncoder();
    const key = await deriveKey(passcode, salt);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(text)
    );
    
    // Convert to hex representation
    const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
    const encryptedHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    return `${ivHex}:${encryptedHex}`;
  } catch (error) {
    console.error('Client encryption failed:', error);
    throw new Error('Encryption failed. Secure cryptography engine unavailable.');
  }
}

/**
 * Decrypt encrypted hex text using a passcode/PIN
 */
export async function decryptData(encryptedStr: string, passcode: string, salt: string = 'TronNest_Client_Salt_2026'): Promise<string> {
  try {
    const parts = encryptedStr.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid secure storage format');
    }
    
    const iv = new Uint8Array(parts[0].match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const encryptedBytes = new Uint8Array(parts[1].match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    
    const key = await deriveKey(passcode, salt);
    const dec = new TextDecoder();
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedBytes
    );
    return dec.decode(decrypted);
  } catch (err) {
    throw new Error('Authentication failed. Incorrect security PIN or corrupted storage.');
  }
}

/**
 * Securely store keypair encrypted with PIN
 */
export async function secureStorePrivateData(address: string, privateKey: string, seedPhrase: string, passcode: string): Promise<void> {
  const encryptedKey = await encryptData(privateKey, passcode);
  const encryptedSeed = await encryptData(seedPhrase, passcode);
  localStorage.setItem(`wallet_private_key_enc_${address}`, encryptedKey);
  localStorage.setItem(`wallet_seed_phrase_enc_${address}`, encryptedSeed);
  // Remove legacy unencrypted storage keys to ensure security
  localStorage.removeItem(`wallet_private_key_${address}`);
  localStorage.removeItem(`wallet_seed_phrase_${address}`);
}

/**
 * Securely retrieve and decrypt keypair using PIN
 */
export async function secureRetrievePrivateData(address: string, passcode: string): Promise<{ privateKey: string; seedPhrase: string }> {
  const encryptedKey = localStorage.getItem(`wallet_private_key_enc_${address}`);
  const encryptedSeed = localStorage.getItem(`wallet_seed_phrase_enc_${address}`);
  
  if (!encryptedKey || !encryptedSeed) {
    // Graceful fallback if user created wallet in older version with unencrypted localStorage
    const legacyKey = localStorage.getItem(`wallet_private_key_${address}`);
    const legacySeed = localStorage.getItem(`wallet_seed_phrase_${address}`);
    if (legacyKey && legacySeed) {
      // Auto-upgrade to encrypted storage
      await secureStorePrivateData(address, legacyKey, legacySeed, passcode);
      return { privateKey: legacyKey, seedPhrase: legacySeed };
    }
    throw new Error('Secure credentials not found on this device.');
  }
  
  const privateKey = await decryptData(encryptedKey, passcode);
  const seedPhrase = await decryptData(encryptedSeed, passcode);
  return { privateKey, seedPhrase };
}

/**
 * Encrypt the user's PIN for biometric bypass
 */
export async function encryptPinForBiometrics(pin: string, address: string): Promise<void> {
  const encryptedPin = await encryptData(pin, 'TronNest_Biometric_Device_Key');
  localStorage.setItem(`wallet_pin_bio_${address}`, encryptedPin);
}

/**
 * Decrypt the user's PIN for biometric bypass
 */
export async function decryptPinForBiometrics(address: string): Promise<string> {
  const encryptedPin = localStorage.getItem(`wallet_pin_bio_${address}`);
  if (!encryptedPin) throw new Error('Biometric credentials not found');
  return await decryptData(encryptedPin, 'TronNest_Biometric_Device_Key');
}
