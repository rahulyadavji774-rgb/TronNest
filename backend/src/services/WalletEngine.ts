import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '../db';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // Must be 32 bytes
const IV_LENGTH = 16;

function encrypt(text: string) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

export class WalletEngine {
  static async createWallet(userId: string, name: string = 'Main Wallet') {
    const db = getDb();
    
    // Generate dummy keys for TronNest
    const privateKey = crypto.randomBytes(32).toString('hex');
    const publicKey = crypto.randomBytes(64).toString('hex');
    const address = 'T' + crypto.randomBytes(20).toString('hex'); // Mock Tron address
    const seedPhrase = 'mock seed phrase ...'; 

    return await db.transaction(async (tx) => {
      const walletId = crypto.randomUUID();
      
      await tx.insert(schema.wallets).values({
        id: walletId,
        userId,
        address,
        name,
        status: 'active'
      });

      await tx.insert(schema.walletKeys).values({
        walletId,
        publicKey,
        encryptedPrivateKey: encrypt(privateKey),
        encryptedSeedPhrase: encrypt(seedPhrase)
      });

      return { walletId, address };
    });
  }

  static async activateWallet(walletId: string) {
    const db = getDb();
    await db.update(schema.wallets).set({ status: 'active', isFrozen: false, isLocked: false }).where(eq(schema.wallets.id, walletId));
  }

  static async lockWallet(walletId: string) {
    const db = getDb();
    await db.update(schema.wallets).set({ isLocked: true }).where(eq(schema.wallets.id, walletId));
  }
  
  static async unlockWallet(walletId: string) {
    const db = getDb();
    await db.update(schema.wallets).set({ isLocked: false }).where(eq(schema.wallets.id, walletId));
  }

  static async freezeWallet(walletId: string) {
    const db = getDb();
    await db.update(schema.wallets).set({ isFrozen: true, status: 'frozen' }).where(eq(schema.wallets.id, walletId));
  }

  static async restoreWallet(walletId: string) {
    const db = getDb();
    await db.update(schema.wallets).set({ status: 'active', isFrozen: false, isLocked: false }).where(eq(schema.wallets.id, walletId));
  }

  static async deleteWallet(walletId: string) {
    const db = getDb();
    // Soft delete
    await db.update(schema.wallets).set({ status: 'deleted' }).where(eq(schema.wallets.id, walletId));
  }

  static async getPrivateKey(walletId: string) {
    const db = getDb();
    const keys = await db.select().from(schema.walletKeys).where(eq(schema.walletKeys.walletId, walletId)).limit(1);
    if (!keys.length) throw new Error('Keys not found');
    return decrypt(keys[0].encryptedPrivateKey);
  }
}
