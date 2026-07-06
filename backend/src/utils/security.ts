import bcrypt from 'bcrypt';
import { JsonDatabase } from '../config/db';
import { UserRepository } from '../repositories/user.repository';

export async function verifyPasscodeWithRateLimit(walletIdOrUserId: any, passcode: string): Promise<{ success: boolean; message?: string; status?: number }> {
  const db = JsonDatabase.getInstance();
  const userRepo = UserRepository.getInstance();
  
  // 1. Try to find the user by ID
  let user = await userRepo.findById(walletIdOrUserId);
  
  // 2. If not found, check if it's a wallet ID, then find the user for that wallet
  if (!user) {
    const wallet = await db.findById<any>('wallets', walletIdOrUserId);
    if (wallet) {
      user = await userRepo.findById(wallet.user_id);
    }
  }

  // 3. If still not found, search users by wallet_id or active_wallet_id
  if (!user) {
    user = await userRepo.findOne(u => u.wallet_id === walletIdOrUserId || u.active_wallet_id === walletIdOrUserId);
  }

  if (!user) {
    return { success: false, message: 'User profile missing', status: 404 };
  }

  // 4. On-the-fly PIN migration if users table does not have passcode_hash yet
  if (!user.passcode_hash) {
    // Find all wallets belonging to this user
    const wallets = await db.findMany<any>('wallets', w => w.user_id === user.id);
    const walletIds = wallets.map(w => w.id);
    
    // Look up any existing wallet_security record
    const security = await db.findOne<any>('wallet_security', s => walletIds.includes(s.wallet_id));
    if (security && security.passcode_hash) {
      // Copy to user record
      await userRepo.update( user.id, {
        passcode_hash: security.passcode_hash,
        failed_attempts: security.failed_attempts || 0,
        locked_until: security.locked_until || null
      });
      user.passcode_hash = security.passcode_hash;
      user.failed_attempts = security.failed_attempts || 0;
      user.locked_until = security.locked_until || null;

      // Clean up wallet-specific security records to fulfill: "Remove any wallet-specific PIN storage."
      for (const wId of walletIds) {
        const secRecord = await db.findOne<any>('wallet_security', s => s.wallet_id === wId);
        if (secRecord) {
          await db.delete('wallet_security', secRecord.id);
        }
      }
    } else {
      // Return error if no security record is found and user has no passcode_hash
      return { success: false, message: 'Account PIN has not been set', status: 404 };
    }
  }

  // 5. Handle rate-limiting / lock-out on user level (Account PIN lockout)
  if (user.locked_until) {
    if (new Date(user.locked_until) > new Date()) {
      return { success: false, message: 'Too many incorrect PIN attempts. Please wait 60 seconds before trying again.', status: 403 };
    } else {
      await userRepo.update(user.id, { failed_attempts: 0, locked_until: null });
      user.failed_attempts = 0;
      user.locked_until = null;
    }
  }

  const isMatch = await bcrypt.compare(passcode, user.passcode_hash);
  if (!isMatch) {
    const nextFailedAttempts = (user.failed_attempts || 0) + 1;
    let lockedUntil = null;
    if (nextFailedAttempts >= 5) {
      lockedUntil = new Date(Date.now() + 60 * 1000).toISOString(); // 60 seconds lockout
    }
    await userRepo.update( user.id, {
      failed_attempts: nextFailedAttempts,
      locked_until: lockedUntil
    });

    return { 
      success: false, 
      message: lockedUntil ? 'Too many incorrect PIN attempts. Locked for 60 seconds.' : 'Incorrect PIN', 
      status: 401 
    };
  }

  // Reset failed attempts on success
  if (user.failed_attempts > 0) {
    await userRepo.update(user.id, { failed_attempts: 0, locked_until: null });
  }

  return { success: true };
}

