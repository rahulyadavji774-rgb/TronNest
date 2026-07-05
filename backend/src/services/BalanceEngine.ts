import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '../db';

export class BalanceEngine {
  static async getBalance(walletId: string, tokenId: string) {
    const db = getDb();
    const balances = await db.select().from(schema.balances).where(
      and(eq(schema.balances.walletId, walletId), eq(schema.balances.tokenId, tokenId))
    ).limit(1);
    
    return balances.length ? balances[0].balance : '0';
  }

  static async updateBalanceTx(tx: any, walletId: string, tokenId: string, amount: string, reason: string) {
    const balances = await tx.select().from(schema.balances).where(
      and(eq(schema.balances.walletId, walletId), eq(schema.balances.tokenId, tokenId))
    ).limit(1);

    let currentBalance = 0;
    if (balances.length) {
      if (balances[0].isFrozen) throw new Error('Balance is frozen');
      currentBalance = parseFloat(balances[0].balance);
    }
    
    const delta = parseFloat(amount);
    const newBalance = currentBalance + delta;
    
    if (newBalance < 0) throw new Error('Insufficient balance');

    if (balances.length) {
      await tx.update(schema.balances).set({ balance: newBalance.toString() }).where(eq(schema.balances.id, balances[0].id));
    } else {
      await tx.insert(schema.balances).values({
        walletId,
        tokenId,
        balance: newBalance.toString()
      });
    }
  }

  static async transfer(fromWalletId: string, toWalletId: string, tokenId: string, amount: string) {
    const db = getDb();
    return await db.transaction(async (tx) => {
      // Deduct from sender
      await this.updateBalanceTx(tx, fromWalletId, tokenId, '-' + amount, 'transfer_out');
      
      // Add to receiver
      await this.updateBalanceTx(tx, toWalletId, tokenId, amount, 'transfer_in');

      // Record transaction
      await tx.insert(schema.transactions).values({
        fromWalletId,
        toWalletId,
        tokenId,
        amount,
        type: 'transfer',
        status: 'completed'
      });
    });
  }
}
