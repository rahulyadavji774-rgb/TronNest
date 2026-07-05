import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { BalanceEngine } from './BalanceEngine';

export class TokenEngine {
  static async createToken(data: {
    symbol: string;
    name: string;
    decimals: number;
    logoUrl?: string;
    description?: string;
    isInternal?: boolean;
    contractAddress?: string;
  }) {
    const db = getDb();
    const token = await db.insert(schema.tokens).values({
      symbol: data.symbol,
      name: data.name,
      decimals: data.decimals,
      logoUrl: data.logoUrl,
      description: data.description,
      isInternal: data.isInternal ?? true,
      contractAddress: data.contractAddress
    });
    return token;
  }

  static async mint(tokenId: string, walletId: string, amount: string, adminId: string) {
    const db = getDb();
    return await db.transaction(async (tx) => {
      const tokens = await tx.select().from(schema.tokens).where(eq(schema.tokens.id, tokenId)).limit(1);
      if (!tokens.length) throw new Error('Token not found');
      if (tokens[0].supplyLocked) throw new Error('Token supply is locked');

      await BalanceEngine.updateBalanceTx(tx, walletId, tokenId, amount, 'mint');
      
      const newTotal = (parseFloat(tokens[0].totalSupply) + parseFloat(amount)).toString();
      await tx.update(schema.tokens).set({ totalSupply: newTotal, circulatingSupply: newTotal }).where(eq(schema.tokens.id, tokenId));

      await tx.insert(schema.transactions).values({
        toWalletId: walletId,
        tokenId,
        amount,
        type: 'mint',
        status: 'completed'
      });

      await tx.insert(schema.auditLogs).values({
        actorId: adminId,
        actorType: 'admin',
        action: 'MINT_TOKEN',
        details: JSON.stringify({ tokenId, walletId, amount })
      });
    });
  }

  static async burn(tokenId: string, walletId: string, amount: string, adminId: string) {
    const db = getDb();
    return await db.transaction(async (tx) => {
      const tokens = await tx.select().from(schema.tokens).where(eq(schema.tokens.id, tokenId)).limit(1);
      if (!tokens.length) throw new Error('Token not found');
      if (tokens[0].supplyLocked) throw new Error('Token supply is locked');

      await BalanceEngine.updateBalanceTx(tx, walletId, tokenId, '-' + amount, 'burn');
      
      const newTotal = (parseFloat(tokens[0].totalSupply) - parseFloat(amount)).toString();
      await tx.update(schema.tokens).set({ totalSupply: newTotal, circulatingSupply: newTotal }).where(eq(schema.tokens.id, tokenId));

      await tx.insert(schema.transactions).values({
        fromWalletId: walletId,
        tokenId,
        amount,
        type: 'burn',
        status: 'completed'
      });

      await tx.insert(schema.auditLogs).values({
        actorId: adminId,
        actorType: 'admin',
        action: 'BURN_TOKEN',
        details: JSON.stringify({ tokenId, walletId, amount })
      });
    });
  }

  static async freezeToken(tokenId: string) {
    const db = getDb();
    await db.update(schema.tokens).set({ status: 'frozen', isTransferEnabled: false }).where(eq(schema.tokens.id, tokenId));
  }
  
  static async lockSupply(tokenId: string) {
    const db = getDb();
    await db.update(schema.tokens).set({ supplyLocked: true }).where(eq(schema.tokens.id, tokenId));
  }

  static async pauseTransfers(tokenId: string) {
    const db = getDb();
    await db.update(schema.tokens).set({ isTransferEnabled: false }).where(eq(schema.tokens.id, tokenId));
  }

  static async resumeTransfers(tokenId: string) {
    const db = getDb();
    await db.update(schema.tokens).set({ isTransferEnabled: true, status: 'active' }).where(eq(schema.tokens.id, tokenId));
  }
}
