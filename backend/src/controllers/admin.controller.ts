import { Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { JsonDatabase } from '../config/db';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'TronNest_SuperSecureJWTSalt_2026';

export class AdminController {
  private db = JsonDatabase.getInstance();

  /**
   * Admin Login using credentials
   */
  public adminLogin = async (req: AuthenticatedRequest, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    try {
      const admin = this.db.findOne<any>('admins', a => a.username === username);
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
      this.db.insert<any>('admin_logs', {
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
      const users = this.db.query<any>('users');
      const wallets = this.db.query<any>('wallets');
      const tokens = this.db.query<any>('tokens');
      const history = this.db.query<any>('transaction_history');
      const adminLogs = this.db.query<any>('admin_logs');

      const blockchainCount = history.filter((h: any) => h.type === 'blockchain').length;
      const internalCount = history.filter((h: any) => h.type === 'internal').length;

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
      const users = this.db.query<any>('users');
      const wallets = this.db.query<any>('wallets');
      const balances = this.db.query<any>('balances');
      const tokens = this.db.query<any>('tokens');

      const formattedUsers = users.map((user: any) => {
        const wallet = wallets.find((w: any) => w.user_id === user.id);
        const walletBalances = wallet
          ? balances
              .filter((b: any) => b.wallet_id === wallet.id)
              .map((b: any) => {
                const token = tokens.find((t: any) => t.id === b.token_id);
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
      const user = this.db.findById<any>('users', parseInt(userId));
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      this.db.update('users', user.id, { status: 'frozen' });

      // Audit log
      this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `freeze_user_wallet: id=${user.id}`,
        ip_address: req.ip || '127.0.0.1'
      });

      this.db.insert<any>('audit_logs', {
        actor_type: 'admin',
        actor_id: admin.id,
        action: 'user_frozen',
        details: { userId: user.id },
        ip_address: req.ip || '127.0.0.1'
      });

      // Send critical user notification
      this.db.insert<any>('notifications', {
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
      const user = this.db.findById<any>('users', parseInt(userId));
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      this.db.update('users', user.id, { status: 'active' });

      // Audit log
      this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: `unfreeze_user_wallet: id=${user.id}`,
        ip_address: req.ip || '127.0.0.1'
      });

      this.db.insert<any>('audit_logs', {
        actor_type: 'admin',
        actor_id: admin.id,
        action: 'user_unfrozen',
        details: { userId: user.id },
        ip_address: req.ip || '127.0.0.1'
      });

      this.db.insert<any>('notifications', {
        user_id: user.id,
        title: 'Account Restored',
        message: 'Your cryptocurrency wallet has been restored to active status.'
      });

      return res.status(200).json({ success: true, message: `Wallet ${userId} unfrozen successfully` });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to unfreeze wallet' });
    }
  };

  /**
   * Returns complete catalog of tokens (Internal + On-chain)
   */
  public listTokens = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokens = this.db.query<any>('tokens');
      const prices = this.db.query<any>('token_prices');
      const balances = this.db.query<any>('balances');

      const data = tokens.map((t: any) => {
        const pr = prices.find((p: any) => p.token_id === t.id);
        let totalSupply = t.total_supply !== undefined ? parseFloat(t.total_supply) : 0;
        
        if (t.is_internal) {
          const sumBalances = balances
            .filter((b: any) => b.token_id === t.id)
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
      const existing = this.db.findOne<any>('tokens', t => t.symbol.toUpperCase() === symbol.toUpperCase());
      if (existing) {
        return res.status(400).json({ success: false, message: `Token with symbol ${symbol} already exists` });
      }

      // Add to tokens list
      const newToken = this.db.insert<any>('tokens', {
        name,
        symbol: symbol.toUpperCase(),
        decimals: parseInt(decimals),
        logo_url: logoUrl || 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=200&auto=format&fit=crop',
        description: description || '',
        is_visible: true,
        is_transfer_enabled: true,
        is_active: true,
        is_internal: isInternal === undefined ? true : !!isInternal,
        contract_address: null
      });

      // Initialize price record
      this.db.insert<any>('token_prices', {
        token_id: newToken.id,
        price_usd: parseFloat(priceUsd || '1.0')
      });

      // Log action
      this.db.insert<any>('admin_logs', {
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
      const token = this.db.findById<any>('tokens', parseInt(tokenId));
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

      this.db.update('tokens', token.id, updates);

      if (priceUsd !== undefined) {
        const tokenPriceRecord = this.db.findOne<any>('token_prices', p => p.token_id === token.id);
        if (tokenPriceRecord) {
          this.db.update('token_prices', tokenPriceRecord.id, {
            price_usd: parseFloat(priceUsd)
          });
        } else {
          this.db.insert<any>('token_prices', {
            token_id: token.id,
            price_usd: parseFloat(priceUsd)
          });
        }
      }

      this.db.insert<any>('admin_logs', {
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
      const token = this.db.findById<any>('tokens', parseInt(tokenId));
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      this.db.update('tokens', token.id, { is_visible: false });

      this.db.insert<any>('admin_logs', {
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
      const token = this.db.findById<any>('tokens', parseInt(tokenId));
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      this.db.update('tokens', token.id, { is_visible: true });

      this.db.insert<any>('admin_logs', {
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
      const token = this.db.findById<any>('tokens', parseInt(tokenId));
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      this.db.update('tokens', token.id, { is_transfer_enabled: true });

      this.db.insert<any>('admin_logs', {
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
      const token = this.db.findById<any>('tokens', parseInt(tokenId));
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      this.db.update('tokens', token.id, { is_transfer_enabled: false });

      this.db.insert<any>('admin_logs', {
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
      const ledger = this.db.query<any>('internal_ledger');
      const tokens = this.db.query<any>('tokens');
      const wallets = this.db.query<any>('wallets');

      const formattedLedger = ledger.map((entry: any) => {
        const token = tokens.find((t: any) => t.id === entry.token_id);
        const fromWallet = entry.from_wallet_id ? wallets.find((w: any) => w.id === entry.from_wallet_id) : null;
        const toWallet = entry.to_wallet_id ? wallets.find((w: any) => w.id === entry.to_wallet_id) : null;

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
      const user = this.db.findById<any>('users', parseInt(userId));
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const wallet = this.db.findOne<any>('wallets', w => w.user_id === user.id);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'User has no registered wallet' });
      }

      const balances = this.db.findMany<any>('balances', b => b.wallet_id === wallet.id);
      const tokens = this.db.query<any>('tokens');

      const formattedBalances = balances.map((b: any) => {
        const token = tokens.find((t: any) => t.id === b.token_id);
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
  public toggleTokenVisibility = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId, isVisible } = req.body;
    const admin = req.admin!;

    try {
      const token = this.db.findById<any>('tokens', parseInt(tokenId));
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      this.db.update('tokens', token.id, { is_visible: !!isVisible });

      this.db.insert<any>('admin_logs', {
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

    if (!tokenId || priceUsd === undefined) {
      return res.status(400).json({ success: false, message: 'Token ID and price are required' });
    }

    try {
      const tokenPriceRecord = this.db.findOne<any>('token_prices', p => p.token_id === parseInt(tokenId));
      if (!tokenPriceRecord) {
        return res.status(404).json({ success: false, message: 'Token price configuration record not found' });
      }

      this.db.update('token_prices', tokenPriceRecord.id, {
        price_usd: parseFloat(priceUsd)
      });

      this.db.insert<any>('admin_logs', {
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
      const token = this.db.findById<any>('tokens', parseInt(tokenId));
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      if (token.symbol === 'TRX' || token.symbol === 'USDT') {
        return res.status(400).json({ success: false, message: 'Cannot delete core system tokens' });
      }

      this.db.delete('tokens', token.id);

      this.db.insert<any>('admin_logs', {
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
      const wallet = this.db.findOne<any>('wallets', w => w.address === walletAddress);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Recipient wallet address not found' });
      }

      const token = this.db.findById<any>('tokens', parseInt(tokenId));
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      if (!token.is_internal) {
        return res.status(400).json({ success: false, message: 'Minting is only supported for off-chain internal custom tokens' });
      }

      const balanceRecord = this.db.findOne<any>('balances', b => b.wallet_id === wallet.id && b.token_id === token.id);
      const currentBalance = balanceRecord ? parseFloat(balanceRecord.balance) : 0;
      const numAmount = parseFloat(amount);

      if (balanceRecord) {
        this.db.update('balances', balanceRecord.id, { balance: currentBalance + numAmount });
      } else {
        this.db.insert<any>('balances', { wallet_id: wallet.id, token_id: token.id, balance: numAmount });
      }

      // Record in double-entry internal ledger
      const ledger = this.db.insert<any>('internal_ledger', {
        from_wallet_id: null, // Null sender indicates minting
        to_wallet_id: wallet.id,
        token_id: token.id,
        amount: numAmount,
        description: description || `Administratively minted ${numAmount} ${token.symbol}`
      });

      // Record in transaction histories
      this.db.insert<any>('transaction_history', {
        wallet_id: wallet.id,
        type: 'internal',
        direction: 'in',
        asset_symbol: token.symbol,
        amount: numAmount,
        counterparty: 'SYSTEM (MINT)',
        fee: 0,
        status: 'completed',
        internal_ledger_id: ledger.id
      });

      // Notify user
      this.db.insert<any>('notifications', {
        user_id: wallet.user_id,
        title: 'System Credit',
        message: `Admin has minted and deposited ${numAmount} ${token.symbol} to your wallet.`
      });

      this.db.insert<any>('admin_logs', {
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
  public deductTokens = async (req: AuthenticatedRequest, res: Response) => {
    const { walletAddress, tokenId, amount, description } = req.body;
    const admin = req.admin!;

    if (!walletAddress || !tokenId || !amount) {
      return res.status(400).json({ success: false, message: 'Wallet address, Token ID, and amount are required' });
    }

    try {
      const wallet = this.db.findOne<any>('wallets', w => w.address === walletAddress);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Target wallet address not found' });
      }

      const token = this.db.findById<any>('tokens', parseInt(tokenId));
      if (!token) {
        return res.status(404).json({ success: false, message: 'Token not found' });
      }

      if (!token.is_internal) {
        return res.status(400).json({ success: false, message: 'Deducting is only supported for off-chain internal custom tokens' });
      }

      const balanceRecord = this.db.findOne<any>('balances', b => b.wallet_id === wallet.id && b.token_id === token.id);
      const currentBalance = balanceRecord ? parseFloat(balanceRecord.balance) : 0;
      const numAmount = parseFloat(amount);

      if (currentBalance < numAmount) {
        return res.status(400).json({ success: false, message: `Insufficient balance to deduct. Wallet only has ${currentBalance} ${token.symbol}` });
      }

      this.db.update('balances', balanceRecord.id, { balance: currentBalance - numAmount });

      // Record in double-entry internal ledger
      const ledger = this.db.insert<any>('internal_ledger', {
        from_wallet_id: wallet.id,
        to_wallet_id: null, // Null recipient indicates deduction
        token_id: token.id,
        amount: numAmount,
        description: description || `Administratively deducted ${numAmount} ${token.symbol}`
      });

      // Record in transaction histories
      this.db.insert<any>('transaction_history', {
        wallet_id: wallet.id,
        type: 'internal',
        direction: 'out',
        asset_symbol: token.symbol,
        amount: numAmount,
        counterparty: 'SYSTEM (DEDUCT)',
        fee: 0,
        status: 'completed',
        internal_ledger_id: ledger.id
      });

      // Notify user
      this.db.insert<any>('notifications', {
        user_id: wallet.user_id,
        title: 'System Debit',
        message: `Admin has deducted ${numAmount} ${token.symbol} from your wallet balance.`
      });

      this.db.insert<any>('admin_logs', {
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
      const logs = this.db.query<any>('admin_logs');
      const audit = this.db.query<any>('audit_logs');
      const admins = this.db.query<any>('admins');

      const logsWithAdmins = logs.map((log: any) => {
        const ad = admins.find((a: any) => a.id === log.admin_id);
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
      const user = this.db.findById<any>('users', parseInt(userId));
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const wallet = this.db.findOne<any>('wallets', w => w.user_id === user.id);
      if (!wallet) return res.status(404).json({ success: false, message: 'User has no registered wallet' });

      const token = this.db.findById<any>('tokens', parseInt(tokenId));
      if (!token) return res.status(404).json({ success: false, message: 'Token not found' });

      const balanceRecord = this.db.findOne<any>('balances', b => b.wallet_id === wallet.id && b.token_id === token.id);
      if (!balanceRecord) {
        this.db.insert<any>('balances', { wallet_id: wallet.id, token_id: token.id, balance: 0, is_frozen: true });
      } else {
        this.db.update('balances', balanceRecord.id, { is_frozen: true });
      }

      this.db.insert<any>('admin_logs', {
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
      const user = this.db.findById<any>('users', parseInt(userId));
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const wallet = this.db.findOne<any>('wallets', w => w.user_id === user.id);
      if (!wallet) return res.status(404).json({ success: false, message: 'User has no registered wallet' });

      const balanceRecord = this.db.findOne<any>('balances', b => b.wallet_id === wallet.id && b.token_id === parseInt(tokenId));
      if (balanceRecord) {
        this.db.update('balances', balanceRecord.id, { is_frozen: false });
      }

      this.db.insert<any>('admin_logs', {
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
      const user = this.db.findById<any>('users', parseInt(userId));
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const wallet = this.db.findOne<any>('wallets', w => w.user_id === user.id);
      if (!wallet) return res.status(404).json({ success: false, message: 'User has no registered wallet' });

      const token = this.db.findById<any>('tokens', parseInt(tokenId));
      if (!token) return res.status(404).json({ success: false, message: 'Token not found' });

      const balanceRecord = this.db.findOne<any>('balances', b => b.wallet_id === wallet.id && b.token_id === token.id);
      const currentBalance = balanceRecord ? parseFloat(balanceRecord.balance) : 0;

      if (currentBalance > 0) {
        this.db.update('balances', balanceRecord!.id, { balance: 0 });

        // Record in double-entry internal ledger
        const ledger = this.db.insert<any>('internal_ledger', {
          from_wallet_id: wallet.id,
          to_wallet_id: null,
          token_id: token.id,
          amount: currentBalance,
          description: `Administratively reset balance to 0`
        });

        // Record transaction history
        this.db.insert<any>('transaction_history', {
          wallet_id: wallet.id,
          type: 'internal',
          direction: 'out',
          asset_symbol: token.symbol,
          amount: currentBalance,
          counterparty: 'SYSTEM (RESET)',
          fee: 0,
          status: 'completed',
          internal_ledger_id: ledger.id
        });
      }

      this.db.insert<any>('admin_logs', {
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
      const user = this.db.findById<any>('users', parseInt(userId));
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const wallet = this.db.findOne<any>('wallets', w => w.user_id === user.id);
      if (!wallet) return res.status(404).json({ success: false, message: 'User has no registered wallet' });

      const token = this.db.findById<any>('tokens', parseInt(tokenId));
      if (!token) return res.status(404).json({ success: false, message: 'Token not found' });

      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

      const balanceRecord = this.db.findOne<any>('balances', b => b.wallet_id === wallet.id && b.token_id === token.id);
      const currentBalance = balanceRecord ? parseFloat(balanceRecord.balance) : 0;

      if (balanceRecord) {
        this.db.update('balances', balanceRecord.id, { balance: currentBalance + numAmount });
      } else {
        this.db.insert<any>('balances', { wallet_id: wallet.id, token_id: token.id, balance: numAmount });
      }

      // Record ledger
      const ledger = this.db.insert<any>('internal_ledger', {
        from_wallet_id: null,
        to_wallet_id: wallet.id,
        token_id: token.id,
        amount: numAmount,
        description: description || `Administratively credited ${numAmount} ${token.symbol}`
      });

      // Record transaction history
      this.db.insert<any>('transaction_history', {
        wallet_id: wallet.id,
        type: 'internal',
        direction: 'in',
        asset_symbol: token.symbol,
        amount: numAmount,
        counterparty: 'SYSTEM (CREDIT)',
        fee: 0,
        status: 'completed',
        internal_ledger_id: ledger.id
      });

      this.db.insert<any>('admin_logs', {
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
      const user = this.db.findById<any>('users', parseInt(userId));
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const wallet = this.db.findOne<any>('wallets', w => w.user_id === user.id);
      if (!wallet) return res.status(404).json({ success: false, message: 'User has no registered wallet' });

      const token = this.db.findById<any>('tokens', parseInt(tokenId));
      if (!token) return res.status(404).json({ success: false, message: 'Token not found' });

      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

      const balanceRecord = this.db.findOne<any>('balances', b => b.wallet_id === wallet.id && b.token_id === token.id);
      const currentBalance = balanceRecord ? parseFloat(balanceRecord.balance) : 0;

      if (currentBalance < numAmount) {
        return res.status(400).json({ success: false, message: `Insufficient balance to debit. Wallet only has ${currentBalance} ${token.symbol}` });
      }

      this.db.update('balances', balanceRecord.id, { balance: currentBalance - numAmount });

      // Record ledger
      const ledger = this.db.insert<any>('internal_ledger', {
        from_wallet_id: wallet.id,
        to_wallet_id: null,
        token_id: token.id,
        amount: numAmount,
        description: description || `Administratively debited ${numAmount} ${token.symbol}`
      });

      // Record transaction history
      this.db.insert<any>('transaction_history', {
        wallet_id: wallet.id,
        type: 'internal',
        direction: 'out',
        asset_symbol: token.symbol,
        amount: numAmount,
        counterparty: 'SYSTEM (DEBIT)',
        fee: 0,
        status: 'completed',
        internal_ledger_id: ledger.id
      });

      this.db.insert<any>('admin_logs', {
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
