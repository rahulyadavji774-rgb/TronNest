import { Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { JsonDatabase } from '../config/db';
import { UserRepository } from '../repositories/user.repository';
import { logger } from '../utils/logger';
import { clearMarketCache } from './wallet.controller';

const JWT_SECRET = process.env.JWT_SECRET || 'TronNest_SuperSecureJWTSalt_2026';

export class AdminController {
  private db = JsonDatabase.getInstance();
  private userRepo = UserRepository.getInstance();

  /**
   * Admin Login using credentials
   */
  public adminLogin = async (req: AuthenticatedRequest, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    try {
      const admin = await this.db.findOne<any>('admins', a => a.username == username);
      if (!admin) {
        return res.status(401).json({ success: false, message: 'Invalid administrative credentials' });
      }

      const isMatch = await bcrypt.compare(password, admin.password_hash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid administrative credentials' });
      }

      // Generate JWT
      const token = jwt.sign(
        { id: admin.id, username: admin.username, role: admin.role, isAdmin: true },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Record Admin Log
      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: 'admin_login_success',
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({
        success: true,
        message: 'Admin login successful',
        data: {
          token,
          admin: {
            username: admin.username,
            role: admin.role
          }
        }
      });
    } catch (e: any) {
      logger.error('Admin login error:', { error: e.message });
      return res.status(500).json({ success: false, message: 'Internal admin auth error' });
    }
  };

  /**
   * Get Admin System Overview Dashboard Stats
   */
  public getDashboardStats = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const users = await this.userRepo.query();
      const wallets = await this.db.query<any>('wallets');
      const tokens = await this.db.query<any>('tokens');
      const history = await this.db.query<any>('transaction_history');
      const adminLogs = await this.db.query<any>('admin_logs');

      const blockchainCount = history.filter((h: any) => h.type == 'blockchain').length;
      const internalCount = history.filter((h: any) => h.type == 'internal').length;

      // Calculate simple activity
      const latestTransactions = history
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10);

      return res.status(200).json({
        success: true,
        data: {
          totalUsers: users.length,
          totalWallets: wallets.length,
          totalTokens: tokens.length,
          totalTransactions: history.length,
          blockchainTxCount: blockchainCount,
          internalTxCount: internalCount,
          latestTransactions,
          logsCount: adminLogs.length
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to fetch admin stats' });
    }
  };

  /**
   * Returns list of all system users and wallets
   */
  public listUsers = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const users = await this.userRepo.query();
      const wallets = await this.db.query<any>('wallets');
      const balances = await this.db.query<any>('balances');
      const tokens = await this.db.query<any>('tokens');

      const formattedUsers = users.map((user: any) => {
        const wallet = wallets.find((w: any) => w.user_id == user.id);
        const walletBalances = wallet
          ? balances
              .filter((b: any) => b.wallet_id == wallet.id)
              .map((b: any) => {
                const token = tokens.find((t: any) => t.id == b.token_id);
                return {
                  symbol: token ? token.symbol : 'UNKNOWN',
                  balance: b.balance
                };
              })
          : [];

        return {
          id: user.id,
          status: user.status,
          createdAt: user.created_at,
          address: wallet ? wallet.address : 'NOT_SETUP',
          balances: walletBalances
        };
      });

      return res.status(200).json({ success: true, data: formattedUsers });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to list users' });
    }
  };

  /**
   * Freezes a user's wallet
   */
  public freezeWallet = async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.body;
    const admin = req.admin!;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    try {
      const user = await this.userRepo.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      await this.userRepo.update(user.id, { status: 'frozen' });

      // Audit log
      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `freeze_user_wallet: id=${user.id}`,
        ip_address: req.ip || '127.0.0.1'
      });

      await this.db.insert<any>('audit_logs', {
        actor_type: 'admin',
        actor_id: admin.id,
        action: 'user_frozen',
        details: { userId: user.id },
        ip_address: req.ip || '127.0.0.1'
      });

      // Send critical user notification
      await this.db.insert<any>('notifications', {
        user_id: user.id,
        title: 'Account Frozen',
        message: 'Your cryptocurrency wallet has been administratively frozen. Please contact customer support immediately.'
      });

      return res.status(200).json({ success: true, message: `Wallet ${userId} frozen successfully` });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to freeze wallet' });
    }
  };

  /**
   * Unfreezes a user's wallet
   */
  public unfreezeWallet = async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.body;
    const admin = req.admin!;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    try {
      const user = await this.userRepo.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      await this.userRepo.update(user.id, { status: 'active' });

      // Audit log
      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `unfreeze_user_wallet: id=${user.id}`,
        ip_address: req.ip || '127.0.0.1'
      });

      await this.db.insert<any>('audit_logs', {
        actor_type: 'admin',
        actor_id: admin.id,
        action: 'user_unfrozen',
        details: { userId: user.id },
        ip_address: req.ip || '127.0.0.1'
      });

      await this.db.insert<any>('notifications', {
        user_id: user.id,
        title: 'Account Restored',
        message: 'Your cryptocurrency wallet has been restored to active status.'
      });

      return res.status(200).json({ success: true, message: `Wallet ${userId} unfrozen successfully` });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to unfreeze wallet' });
    }
  };

  public suspendUserTransfers = async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.body;
    const admin = req.admin!;
    try {
      const user = await this.userRepo.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      await this.userRepo.update(user.id, { transfers_suspended: true });

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `suspend_transfers: user_id=${userId}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'User transfers suspended' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to suspend transfers' });
    }
  };

  public restoreUserTransfers = async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.body;
    const admin = req.admin!;
    try {
      const user = await this.userRepo.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      await this.userRepo.update(user.id, { transfers_suspended: false });

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `restore_transfers: user_id=${userId}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'User transfers restored' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to restore transfers' });
    }
  };

  /**
   * Returns complete catalog of tokens (Internal + On-chain)
   */
  public listTokens = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokens = await this.db.query<any>('tokens');
      const prices = await this.db.query<any>('token_prices');
      const balances = await this.db.query<any>('balances');

      const data = tokens.map((t: any) => {
        const pr = prices.find((p: any) => p.token_id == t.id);
        let totalSupply = t.total_supply !== undefined ? parseFloat(t.total_supply) : 0;
        
        if (t.is_internal) {
          const sumBalances = balances
            .filter((b: any) => b.token_id == t.id)
            .reduce((acc: number, b: any) => acc + parseFloat(b.balance || '0'), 0);
          totalSupply = sumBalances;
        }

        return {
          ...t,
          priceUsd: pr ? parseFloat(pr.price_usd) : 0.0,
          total_supply: totalSupply
        };
      });

      return res.status(200).json({ success: true, data });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve tokens catalog' });
    }
  };

  /**
   * Creates an administrative custom token
   */
  public createToken = async (req: AuthenticatedRequest, res: Response) => {
    const { name, symbol, decimals, logoUrl, priceUsd, description, isInternal } = req.body;
    const admin = req.admin!;

    if (!name || !symbol || !decimals) {
      return res.status(400).json({ success: false, message: 'Token name, symbol, and decimals are required' });
    }

    try {
      // Add to tokens list
      const newToken = await this.db.insert<any>('tokens', {
        name,
        symbol: symbol.toUpperCase(),
        decimals: parseInt(decimals),
        logo_url: logoUrl || 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=200&auto=format&fit=crop',
        description: description || '',
        is_visible: true,
        is_transfer_enabled: true,
        is_active: true,
        is_internal: isInternal == undefined ? true : !!isInternal,
        contract_address: null
      });

      // Initialize price record
      await this.db.insert<any>('token_prices', {
        token_id: newToken.id,
        price_usd: parseFloat(priceUsd || '1.0')
      });

      // Log action
      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `create_custom_token: symbol=${newToken.symbol}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(201).json({ success: true, message: 'Token created successfully', data: newToken });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to create token' });
    }
  };

  /**
   * Update an administrative custom token
   */
  public updateToken = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId, name, logoUrl, decimals, priceUsd, description, isTransferEnabled, isVisible, isActive } = req.body;
    const admin = req.admin!;

    try {
      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (logoUrl !== undefined) updates.logo_url = logoUrl;
      if (decimals !== undefined) updates.decimals = parseInt(decimals);
      if (description !== undefined) updates.description = description;
      if (isTransferEnabled !== undefined) updates.is_transfer_enabled = !!isTransferEnabled;
      if (isVisible !== undefined) updates.is_visible = !!isVisible;
      if (isActive !== undefined) updates.is_active = !!isActive;

      await this.db.update('tokens', token.id, updates);

      if (priceUsd !== undefined) {
        const tokenPriceRecord = await this.db.findOne<any>('token_prices', p => p.token_id == token.id);
        if (tokenPriceRecord) {
          await this.db.update('token_prices', tokenPriceRecord.id, {
            price_usd: parseFloat(priceUsd)
          });
        } else {
          await this.db.insert<any>('token_prices', {
            token_id: token.id,
            price_usd: parseFloat(priceUsd)
          });
        }
      }

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `update_token: id=${token.id}, symbol=${token.symbol}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'Token updated successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to update token' });
    }
  };

  /**
   * Hide a token from users
   */
  public hideToken = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    const admin = req.admin!;

    try {
      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      await this.db.update('tokens', token.id, { is_visible: false });

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `hide_token: symbol=${token.symbol}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'Token hidden successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to hide token' });
    }
  };

  /**
   * Show a token in wallet
   */
  public showToken = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    const admin = req.admin!;

    try {
      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      await this.db.update('tokens', token.id, { is_visible: true });

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `show_token: symbol=${token.symbol}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'Token shown successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to show token' });
    }
  };

  /**
   * Enable Transfer for a token
   */
  public enableTransfer = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    const admin = req.admin!;

    try {
      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      await this.db.update('tokens', token.id, { is_transfer_enabled: true });

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `enable_transfer: symbol=${token.symbol}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'Transfers enabled successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to enable token transfers' });
    }
  };

  /**
   * Disable Transfer for a token
   */
  public disableTransfer = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    const admin = req.admin!;

    try {
      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      await this.db.update('tokens', token.id, { is_transfer_enabled: false });

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `disable_transfer: symbol=${token.symbol}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'Transfers disabled successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to disable token transfers' });
    }
  };

  /**
   * Retrieve the complete internal ledger
   */
  public getLedger = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ledger = await this.db.query<any>('internal_ledger');
      const tokens = await this.db.query<any>('tokens');
      const wallets = await this.db.query<any>('wallets');

      const formattedLedger = ledger.map((entry: any) => {
        const token = tokens.find((t: any) => t.id == entry.token_id);
        const fromWallet = entry.from_wallet_id ? wallets.find((w: any) => w.id == entry.from_wallet_id) : null;
        const toWallet = entry.to_wallet_id ? wallets.find((w: any) => w.id == entry.to_wallet_id) : null;

        return {
          id: entry.id,
          fromAddress: fromWallet ? fromWallet.address : 'SYSTEM (MINT)',
          toAddress: toWallet ? toWallet.address : 'SYSTEM (DEDUCT)',
          symbol: token ? token.symbol : 'UNKNOWN',
          amount: entry.amount,
          description: entry.description,
          createdAt: entry.created_at
        };
      });

      return res.status(200).json({
        success: true,
        data: formattedLedger.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve internal ledger logs' });
    }
  };

  /**
   * Get balances for a specific user
   */
  public getUserBalances = async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.params;
    try {
      const user = await this.userRepo.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const wallet = await this.db.findOne<any>('wallets', w => w.user_id == user.id);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'User has no registered wallet' });
      }

      const balances = await this.db.findMany<any>('balances', b => b.wallet_id == wallet.id);
      const tokens = await this.db.query<any>('tokens');

      const formattedBalances = balances.map((b: any) => {
        const token = tokens.find((t: any) => t.id == b.token_id);
        return {
          id: b.id,
          symbol: token ? token.symbol : 'UNKNOWN',
          name: token ? token.name : 'Unknown Token',
          decimals: token ? token.decimals : 6,
          logoUrl: token ? token.logo_url : '',
          balance: b.balance,
          isFrozen: !!b.is_frozen,
          isInternal: token ? token.is_internal : true
        };
      });

      return res.status(200).json({
        success: true,
        data: {
          address: wallet.address,
          balances: formattedBalances
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve user balances' });
    }
  };

  /**
   * Toggle visibility of a specific token (Hide/Show)
   */
  
  public enableTrading = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      await this.db.update('tokens', tokenId, { trading_enabled: true });
      await this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: `enable_trading: token_id=${tokenId}`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Trading enabled successfully' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public disableTrading = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      await this.db.update('tokens', tokenId, { trading_enabled: false });
      await this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: `disable_trading: token_id=${tokenId}`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Trading disabled successfully' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public enableDeposit = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      await this.db.update('tokens', tokenId, { deposit_enabled: true });
      await this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: `enable_deposit: token_id=${tokenId}`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Deposit enabled successfully' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public disableDeposit = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      await this.db.update('tokens', tokenId, { deposit_enabled: false });
      await this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: `disable_deposit: token_id=${tokenId}`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Deposit disabled successfully' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public enableWithdraw = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      await this.db.update('tokens', tokenId, { withdraw_enabled: true });
      await this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: `enable_withdraw: token_id=${tokenId}`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Withdraw enabled successfully' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public disableWithdraw = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      await this.db.update('tokens', tokenId, { withdraw_enabled: false });
      await this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: `disable_withdraw: token_id=${tokenId}`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Withdraw disabled successfully' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public toggleTokenVisibility = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId, isVisible } = req.body;
    const admin = req.admin!;

    try {
      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      await this.db.update('tokens', token.id, { is_visible: !!isVisible });

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `toggle_token_visibility: id=${token.id}, visible=${isVisible}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'Token visibility updated successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to update token visibility' });
    }
  };

  /**
   * Adjust price of an existing custom token
   */
  public changeTokenPrice = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId, priceUsd } = req.body;
    const admin = req.admin!;

    if (!tokenId || priceUsd == undefined) {
      return res.status(400).json({ success: false, message: 'Token ID and price are required' });
    }

    try {
      const tokenPriceRecord = await this.db.findOne<any>('token_prices', p => p.token_id == tokenId);
      if (!tokenPriceRecord) {
        return res.status(404).json({ success: false, message: 'Token price configuration record not found' });
      }

      await this.db.update('token_prices', tokenPriceRecord.id, {
        price_usd: parseFloat(priceUsd)
      });

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `change_token_price: token_id=${tokenId}, price=${priceUsd}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'Token price updated successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to adjust token price' });
    }
  };

  /**
   * Deletes a custom token
   */
  public deleteToken = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.params;
    const admin = req.admin!;

    try {
      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      if (token.symbol == 'TRX' || token.symbol == 'USDT') {
        return res.status(400).json({ success: false, message: 'Cannot delete core system tokens' });
      }

      // 1. Update transaction histories to preserve records with 'Deleted Token' label
      const histories = await this.db.findMany<any>('transaction_history', h => 
        h.token_id === token.id || (h.asset_symbol === token.symbol && !h.token_id)
      );
      for (const h of histories) {
        await this.db.update('transaction_history', h.id, { 
          asset_symbol: `Deleted Token (${token.symbol})` 
        });
      }

      // 2. Remove token from all wallet balances
      const balances = await this.db.findMany<any>('balances', b => b.token_id == token.id);
      for (const b of balances) {
        await this.db.delete('balances', b.id);
      }

      // 3. Delete the token itself
      await this.db.delete('tokens', token.id);

      // 4. Clear market cache
      clearMarketCache();

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `delete_token: symbol=${token.symbol}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: `Token ${token.symbol} deleted successfully` });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to delete token' });
    }
  };

  /**
   * Mint internal custom token balance for a specific wallet
   */
  public mintTokens = async (req: AuthenticatedRequest, res: Response) => {
    const { walletAddress, tokenId, amount, description } = req.body;
    const admin = req.admin!;

    if (!walletAddress || !tokenId || !amount) {
      return res.status(400).json({ success: false, message: 'Wallet address, Token ID, and amount are required' });
    }

    try {
      const wallet = await this.db.findOne<any>('wallets', w => w.address == walletAddress);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Recipient wallet address not found' });
      }

      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      if (!token.is_internal) {
        return res.status(400).json({ success: false, message: 'Minting is only supported for off-chain internal custom tokens' });
      }
      if (token.supply_locked) {
        return res.status(400).json({ success: false, message: 'Token supply is locked' });
      }


      const balanceRecord = await this.db.findOne<any>('balances', b => b.wallet_id == wallet.id && b.token_id == token.id);
      const currentBalance = balanceRecord ? parseFloat(balanceRecord.balance) : 0;
      const numAmount = parseFloat(amount);

      if (balanceRecord) {
        await this.db.update('balances', balanceRecord.id, { balance: currentBalance + numAmount });
      } else {
        await this.db.insert<any>('balances', { wallet_id: wallet.id, token_id: token.id, balance: numAmount });
      }

      // Record in double-entry internal ledger
      const ledger = await this.db.insert<any>('internal_ledger', {
        from_wallet_id: null, // Null sender indicates minting
        to_wallet_id: wallet.id,
        token_id: token.id,
        amount: numAmount,
        description: description || `Administratively minted ${numAmount} ${token.symbol}`
      });

      // Record in transaction histories
      await this.db.insert<any>('transaction_history', {
        wallet_id: wallet.id,
        type: 'internal',
        direction: 'in',
        asset_symbol: token.symbol,
        token_id: token.id,
        amount: numAmount,
        counterparty: 'SYSTEM (MINT)',
        fee: 0,
        status: 'completed',
        internal_ledger_id: ledger.id
      });

      // Notify user
      await this.db.insert<any>('notifications', {
        user_id: wallet.user_id,
        title: 'System Credit',
        message: `Admin has minted and deposited ${numAmount} ${token.symbol} to your wallet.`
      });

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `mint_internal_tokens: to_wallet=${wallet.address}, symbol=${token.symbol}, amount=${numAmount}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: `Successfully minted ${numAmount} ${token.symbol} to ${walletAddress}` });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to mint tokens' });
    }
  };

  /**
   * Deduct custom token balance from a specific wallet
   */
  
  public lockSupply = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      await this.db.update('tokens', tokenId, { supply_locked: true });
      await this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: `lock_supply: token_id=${tokenId}`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Token supply locked' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public unlockSupply = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      await this.db.update('tokens', tokenId, { supply_locked: false });
      await this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: `unlock_supply: token_id=${tokenId}`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Token supply unlocked' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public deductTokens = async (req: AuthenticatedRequest, res: Response) => {
    const { walletAddress, tokenId, amount, description } = req.body;
    const admin = req.admin!;

    if (!walletAddress || !tokenId || !amount) {
      return res.status(400).json({ success: false, message: 'Wallet address, Token ID, and amount are required' });
    }

    try {
      const wallet = await this.db.findOne<any>('wallets', w => w.address == walletAddress);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Target wallet address not found' });
      }

      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      if (!token.is_internal) {
        return res.status(400).json({ success: false, message: 'Deducting is only supported for off-chain internal custom tokens' });
      }
      if (token.supply_locked) {
        return res.status(400).json({ success: false, message: 'Token supply is locked' });
      }


      const balanceRecord = await this.db.findOne<any>('balances', b => b.wallet_id == wallet.id && b.token_id == token.id);
      const currentBalance = balanceRecord ? parseFloat(balanceRecord.balance) : 0;
      const numAmount = parseFloat(amount);

      if (currentBalance < numAmount) {
        return res.status(400).json({ success: false, message: `Insufficient balance to deduct. Wallet only has ${currentBalance} ${token.symbol}` });
      }

      await this.db.update('balances', balanceRecord.id, { balance: currentBalance - numAmount });

      // Record in double-entry internal ledger
      const ledger = await this.db.insert<any>('internal_ledger', {
        from_wallet_id: wallet.id,
        to_wallet_id: null, // Null recipient indicates deduction
        token_id: token.id,
        amount: numAmount,
        description: description || `Administratively deducted ${numAmount} ${token.symbol}`
      });

      // Record in transaction histories
      await this.db.insert<any>('transaction_history', {
        wallet_id: wallet.id,
        type: 'internal',
        direction: 'out',
        asset_symbol: token.symbol,
        token_id: token.id,
        amount: numAmount,
        counterparty: 'SYSTEM (DEDUCT)',
        fee: 0,
        status: 'completed',
        internal_ledger_id: ledger.id
      });

      // Notify user
      await this.db.insert<any>('notifications', {
        user_id: wallet.user_id,
        title: 'System Debit',
        message: `Admin has deducted ${numAmount} ${token.symbol} from your wallet balance.`
      });

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `deduct_internal_tokens: from_wallet=${wallet.address}, symbol=${token.symbol}, amount=${numAmount}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: `Successfully deducted ${numAmount} ${token.symbol} from ${walletAddress}` });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to deduct tokens' });
    }
  };

  /**
   * Retrieves administrative audit logs and wallet transaction histories
   */
  public getAuditLogs = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const logs = await this.db.query<any>('admin_logs');
      const audit = await this.db.query<any>('audit_logs');
      const admins = await this.db.query<any>('admins');

      const logsWithAdmins = logs.map((log: any) => {
        const ad = admins.find((a: any) => a.id == log.admin_id);
        return {
          id: log.id,
          username: ad ? ad.username : 'SYSTEM',
          action: log.action,
          ipAddress: log.ip_address,
          createdAt: log.created_at
        };
      });

      return res.status(200).json({
        success: true,
        data: {
          adminLogs: logsWithAdmins.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
          systemAuditLogs: audit.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve administrative logs' });
    }
  };

  /**
   * Freeze user's specific custom token balance
   */
  public freezeUserBalance = async (req: AuthenticatedRequest, res: Response) => {
    const { userId, tokenId } = req.body;
    const admin = req.admin!;

    try {
      const user = await this.userRepo.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const wallet = await this.db.findOne<any>('wallets', w => w.user_id == user.id);
      if (!wallet) return res.status(404).json({ success: false, message: 'User has no registered wallet' });

      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token) return res.status(404).json({ success: false, message: 'Token not found' });

      const balanceRecord = await this.db.findOne<any>('balances', b => b.wallet_id == wallet.id && b.token_id == token.id);
      if (!balanceRecord) {
        await this.db.insert<any>('balances', { wallet_id: wallet.id, token_id: token.id, balance: 0, is_frozen: true });
      } else {
        await this.db.update('balances', balanceRecord.id, { is_frozen: true });
      }

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `freeze_balance: user_id=${userId}, token_id=${tokenId}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'User token balance frozen successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to freeze balance' });
    }
  };

  /**
   * Unfreeze user's specific custom token balance
   */
  public unfreezeUserBalance = async (req: AuthenticatedRequest, res: Response) => {
    const { userId, tokenId } = req.body;
    const admin = req.admin!;

    try {
      const user = await this.userRepo.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const wallet = await this.db.findOne<any>('wallets', w => w.user_id == user.id);
      if (!wallet) return res.status(404).json({ success: false, message: 'User has no registered wallet' });

      const balanceRecord = await this.db.findOne<any>('balances', b => b.wallet_id == wallet.id && b.token_id == tokenId);
      if (balanceRecord) {
        await this.db.update('balances', balanceRecord.id, { is_frozen: false });
      }

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `unfreeze_balance: user_id=${userId}, token_id=${tokenId}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'User token balance unfrozen successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to unfreeze balance' });
    }
  };

  /**
   * Reset user's specific custom token balance to 0
   */
  public resetUserBalance = async (req: AuthenticatedRequest, res: Response) => {
    const { userId, tokenId } = req.body;
    const admin = req.admin!;

    try {
      const user = await this.userRepo.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const wallet = await this.db.findOne<any>('wallets', w => w.user_id == user.id);
      if (!wallet) return res.status(404).json({ success: false, message: 'User has no registered wallet' });

      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token) return res.status(404).json({ success: false, message: 'Token not found' });

      const balanceRecord = await this.db.findOne<any>('balances', b => b.wallet_id == wallet.id && b.token_id == token.id);
      const currentBalance = balanceRecord ? parseFloat(balanceRecord.balance) : 0;

      if (currentBalance > 0) {
        await this.db.update('balances', balanceRecord!.id, { balance: 0 });

        // Record in double-entry internal ledger
        const ledger = await this.db.insert<any>('internal_ledger', {
          from_wallet_id: wallet.id,
          to_wallet_id: null,
          token_id: token.id,
          amount: currentBalance,
          description: `Administratively reset balance to 0`
        });

        // Record transaction history
        await this.db.insert<any>('transaction_history', {
          wallet_id: wallet.id,
          type: 'internal',
          direction: 'out',
          asset_symbol: token.symbol,
        token_id: token.id,
          amount: currentBalance,
          counterparty: 'SYSTEM (RESET)',
          fee: 0,
          status: 'completed',
          internal_ledger_id: ledger.id
        });
      }

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `reset_balance: user_id=${userId}, token_id=${tokenId}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'User token balance reset to 0 successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to reset balance' });
    }
  };

  /**
   * Credit user's specific custom token balance
   */
  public creditUserBalance = async (req: AuthenticatedRequest, res: Response) => {
    const { userId, tokenId, amount, description } = req.body;
    const admin = req.admin!;

    if (!userId || !tokenId || !amount) {
      return res.status(400).json({ success: false, message: 'User ID, Token ID, and amount are required' });
    }

    try {
      const user = await this.userRepo.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const wallet = await this.db.findOne<any>('wallets', w => w.user_id == user.id);
      if (!wallet) return res.status(404).json({ success: false, message: 'User has no registered wallet' });

      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token) return res.status(404).json({ success: false, message: 'Token not found' });

      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

      const balanceRecord = await this.db.findOne<any>('balances', b => b.wallet_id == wallet.id && b.token_id == token.id);
      const currentBalance = balanceRecord ? parseFloat(balanceRecord.balance) : 0;

      if (balanceRecord) {
        await this.db.update('balances', balanceRecord.id, { balance: currentBalance + numAmount });
      } else {
        await this.db.insert<any>('balances', { wallet_id: wallet.id, token_id: token.id, balance: numAmount });
      }

      // Record ledger
      const ledger = await this.db.insert<any>('internal_ledger', {
        from_wallet_id: null,
        to_wallet_id: wallet.id,
        token_id: token.id,
        amount: numAmount,
        description: description || `Administratively credited ${numAmount} ${token.symbol}`
      });

      // Record transaction history
      await this.db.insert<any>('transaction_history', {
        wallet_id: wallet.id,
        type: 'internal',
        direction: 'in',
        asset_symbol: token.symbol,
        token_id: token.id,
        amount: numAmount,
        counterparty: 'SYSTEM (CREDIT)',
        fee: 0,
        status: 'completed',
        internal_ledger_id: ledger.id
      });

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `credit_balance: user_id=${userId}, token_id=${tokenId}, amount=${numAmount}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: `Successfully credited ${numAmount} ${token.symbol}` });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to credit balance' });
    }
  };

  /**
   * Debit user's specific custom token balance
   */
  public debitUserBalance = async (req: AuthenticatedRequest, res: Response) => {
    const { userId, tokenId, amount, description } = req.body;
    const admin = req.admin!;

    if (!userId || !tokenId || !amount) {
      return res.status(400).json({ success: false, message: 'User ID, Token ID, and amount are required' });
    }

    try {
      const user = await this.userRepo.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const wallet = await this.db.findOne<any>('wallets', w => w.user_id == user.id);
      if (!wallet) return res.status(404).json({ success: false, message: 'User has no registered wallet' });

      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token) return res.status(404).json({ success: false, message: 'Token not found' });

      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

      const balanceRecord = await this.db.findOne<any>('balances', b => b.wallet_id == wallet.id && b.token_id == token.id);
      const currentBalance = balanceRecord ? parseFloat(balanceRecord.balance) : 0;

      if (currentBalance < numAmount) {
        return res.status(400).json({ success: false, message: `Insufficient balance to debit. Wallet only has ${currentBalance} ${token.symbol}` });
      }

      await this.db.update('balances', balanceRecord.id, { balance: currentBalance - numAmount });

      // Record ledger
      const ledger = await this.db.insert<any>('internal_ledger', {
        from_wallet_id: wallet.id,
        to_wallet_id: null,
        token_id: token.id,
        amount: numAmount,
        description: description || `Administratively debited ${numAmount} ${token.symbol}`
      });

      // Record transaction history
      await this.db.insert<any>('transaction_history', {
        wallet_id: wallet.id,
        type: 'internal',
        direction: 'out',
        asset_symbol: token.symbol,
        token_id: token.id,
        amount: numAmount,
        counterparty: 'SYSTEM (DEBIT)',
        fee: 0,
        status: 'completed',
        internal_ledger_id: ledger.id
      });

      await this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `debit_balance: user_id=${userId}, token_id=${tokenId}, amount=${numAmount}`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: `Successfully debited ${numAmount} ${token.symbol}` });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to debit balance' });
    }
  };
}
