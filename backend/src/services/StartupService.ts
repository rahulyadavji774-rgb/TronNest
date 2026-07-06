import { JsonDatabase } from '../config/db';
import { logger } from '../utils/logger';

export class StartupService {
  public static async runSystemRepair() {
    logger.info('[StartupService] Running system repair and default token initialization...');
    try {
      const db = JsonDatabase.getInstance();

      // 1. Ensure Default Tokens
      const defaultTokens = [
        {
          name: 'TRON',
          symbol: 'TRX',
          decimals: 6,
          logoUrl: 'https://cryptologos.cc/logos/tron-trx-logo.png',
          description: 'TRON Native Token',
          is_visible: true,
          is_transfer_enabled: true,
          is_active: true,
          is_internal: false,
          contract_address: null
        },
        {
          name: 'Tether USD',
          symbol: 'USDT',
          decimals: 6,
          logoUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.png',
          description: 'Tether TRC20 Stablecoin',
          is_visible: true,
          is_transfer_enabled: true,
          is_active: true,
          is_internal: false,
          contract_address: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj'
        },
        {
          name: 'TronNest USD',
          symbol: 'MUSD',
          decimals: 6,
          logoUrl: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=200&auto=format&fit=crop',
          description: 'TronNest USD Stablecoin',
          is_visible: true,
          is_transfer_enabled: true,
          is_active: true,
          is_internal: true,
          contract_address: null
        }
      ];

      for (const t of defaultTokens) {
        const existing = await db.findMany<any>('tokens', x => x.symbol === t.symbol);
        if (existing.length === 0) {
          logger.info(`[StartupService] Creating default token: ${t.symbol}`);
          const newToken = await db.insert<any>('tokens', t);
          await db.insert<any>('token_prices', {
            token_id: (newToken as any).id,
            price_usd: t.symbol === 'USDT' || t.symbol === 'MUSD' ? 1.0 : 0.125
          });
        }
      }

      // 2. Scan wallets and ensure all visible tokens have a balance row
      const wallets = await db.query<any>('wallets');
      const visibleTokens = await db.findMany<any>('tokens', t => t.is_visible && t.is_active);

      let createdBalances = 0;
      for (const wallet of wallets) {
        for (const token of visibleTokens) {
          const balance = await db.findOne<any>('balances', { wallet_id: wallet.id, token_id: token.id });
          if (!balance) {
            await db.insert<any>('balances', {
              wallet_id: wallet.id,
              token_id: token.id,
              balance: 0.0
            });
            createdBalances++;
          }
        }
      }
      
      if (createdBalances > 0) {
        logger.info(`[StartupService] System Repair: Created ${createdBalances} missing balance rows across all wallets.`);
      } else {
        logger.info(`[StartupService] System Repair: All wallets have complete balance rows.`);
      }

    } catch (e: any) {
      logger.error(`[StartupService] System repair failed: ${e.message}`);
    }
  }
}
