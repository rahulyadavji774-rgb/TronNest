import { Response } from 'express';
import bcrypt from 'bcrypt';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { JsonDatabase } from '../config/db';
import { TronService } from '../services/tron.service';
import { decrypt } from '../utils/crypto';
import { logger } from '../utils/logger';

export class WalletController {
  private db = JsonDatabase.getInstance();
  private tronService = TronService.getInstance();

  /**
   * Fetches comprehensive balance portfolio (TRX, USDT + all Visible Internal Tokens)
   */
  public getPortfolio = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      // 1. Get real TRON Blockchain balances
      const liveBalances = await this.tronService.getBalances(user.address);

      // Get live TRX price dynamically
      let liveTrxPrice = 0.125; // fallback default from db
      let priceApiFailed = false;
      try {
        const priceSources = [
          async () => {
            const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=TRXUSDT', { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            if (data && data.price) return parseFloat(data.price);
            throw new Error('Invalid binance response');
          },
          async () => {
            const res = await fetch('https://min-api.cryptocompare.com/data/price?fsym=TRX&tsyms=USD', { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            if (data && typeof data.USD === 'number') return data.USD;
            throw new Error('Invalid cryptocompare response');
          },
          async () => {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd', { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            if (data && data.tron && typeof data.tron.usd === 'number') return data.tron.usd;
            throw new Error('Invalid coingecko response');
          }
        ];

        let successFetch = false;
        for (const src of priceSources) {
          try {
            liveTrxPrice = await src();
            successFetch = true;
            break;
          } catch (err) {
            logger.warn('Price source failed, trying next...');
          }
        }
        if (!successFetch) {
          priceApiFailed = true;
          // Use cached price if API fails
          const prices = this.db.query<any>('token_prices');
          const trxPriceObj = prices.find((p: any) => p.token_id === 1);
          if (trxPriceObj) {
            liveTrxPrice = parseFloat(trxPriceObj.price_usd);
          }
        }
      } catch (err) {
        logger.error('Failed to fetch live TRX price:', err);
        priceApiFailed = true;
      }

      // 2. Query visible tokens from DB
      const dbTokens = this.db.findMany<any>('tokens', t => t.is_visible && t.is_active);
      const prices = this.db.query<any>('token_prices');

      const portfolio: any[] = [];
      let totalValueUsd = 0;

      for (const token of dbTokens) {
        let balance = 0;
        let priceUsd = 0;

        if (token.symbol === 'TRX') {
          priceUsd = liveTrxPrice;
          const trxPriceObj = prices.find((p: any) => p.token_id === token.id);
          if (trxPriceObj) {
            this.db.update('token_prices', trxPriceObj.id, { price_usd: liveTrxPrice });
          }
        } else {
          const priceObj = prices.find((p: any) => p.token_id === token.id);
          priceUsd = priceObj ? parseFloat(priceObj.price_usd) : 0.0;
        }

        if (token.is_internal) {
          // Query internal balance from DB
          const balRecord = this.db.findOne<any>('balances', b => b.wallet_id === user.walletId && b.token_id === token.id);
          balance = balRecord ? parseFloat(balRecord.balance) : 0.0;
        } else {
          // Sync with live TRON chain
          balance = token.symbol === 'TRX' ? liveBalances.TRX : liveBalances.USDT;

          // Update cache in DB
          const balRecord = this.db.findOne<any>('balances', b => b.wallet_id === user.walletId && b.token_id === token.id);
          if (balRecord) {
            this.db.update('balances', balRecord.id, { balance: balance });
          } else {
            this.db.insert<any>('balances', { wallet_id: user.walletId, token_id: token.id, balance: balance });
          }
        }

        const valueUsd = balance * priceUsd;
        totalValueUsd += valueUsd;

        portfolio.push({
          id: token.id,
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          logoUrl: token.logo_url,
          isInternal: token.is_internal,
          balance: balance,
          priceUsd: priceUsd,
          valueUsd: valueUsd,
          isTransferEnabled: token.is_transfer_enabled
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          address: user.address,
          totalPortfolioUsd: totalValueUsd,
          assets: portfolio,
          network: 'TRON Mainnet',
          isUnavailable: !!(liveBalances.failed || priceApiFailed)
        }
      });
    } catch (e: any) {
      logger.error('Fetch portfolio error:', { error: e.message, address: user.address });
      return res.status(500).json({ success: false, message: 'Failed to retrieve wallet portfolio data' });
    }
  };

  /**
   * Executes a transfer of assets (either on-chain TRON TRX/USDT or off-chain Internal Tokens)
   */
  public transferAssets = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { tokenSymbol, recipientAddress, amount, passcode } = req.body;

    if (!tokenSymbol || !recipientAddress || !amount || !passcode) {
      return res.status(400).json({ success: false, message: 'Recipient, amount, asset symbol, and passcode are required' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid transfer amount' });
    }

    try {
      // 1. Verify Passcode
      const security = this.db.findOne<any>('wallet_security', s => s.wallet_id === user.walletId);
      if (!security) {
        return res.status(404).json({ success: false, message: 'Wallet security profile missing' });
      }

      const isPasscodeCorrect = await bcrypt.compare(passcode, security.passcode_hash);
      if (!isPasscodeCorrect) {
        return res.status(401).json({ success: false, message: 'Incorrect 6-digit transaction passcode' });
      }

      // 2. Fetch Token from DB
      const token = this.db.findOne<any>('tokens', t => t.symbol === tokenSymbol && t.is_active);
      if (!token) {
        return res.status(404).json({ success: false, message: `Token ${tokenSymbol} not found or deactivated` });
      }

      if (!token.is_transfer_enabled) {
        return res.status(403).json({ success: false, message: `Transfers are currently disabled for ${tokenSymbol}` });
      }

      // 3. Perform transfer based on asset structure
      if (token.is_internal) {
        // --- INTERNAL LEDGER TRANSFER ---
        const recipientWallet = this.db.findOne<any>('wallets', w => w.address === recipientAddress);
        if (!recipientWallet) {
          return res.status(404).json({ success: false, message: 'Recipient wallet address does not exist in the database' });
        }

        if (recipientWallet.id === user.walletId) {
          return res.status(400).json({ success: false, message: 'Cannot transfer assets to your own address' });
        }

        const senderBalanceRecord = this.db.findOne<any>('balances', b => b.wallet_id === user.walletId && b.token_id === token.id);
        const senderBalance = senderBalanceRecord ? parseFloat(senderBalanceRecord.balance) : 0;

        if (senderBalanceRecord && senderBalanceRecord.is_frozen) {
          return res.status(403).json({ success: false, message: 'Your balance for this custom token has been frozen by administration.' });
        }

        if (senderBalance < numAmount) {
          return res.status(400).json({ success: false, message: 'Insufficient internal balance' });
        }

        // Deduct from sender
        this.db.update('balances', senderBalanceRecord.id, { balance: senderBalance - numAmount });

        // Add to recipient
        const recipientBalanceRecord = this.db.findOne<any>('balances', b => b.wallet_id === recipientWallet.id && b.token_id === token.id);
        if (recipientBalanceRecord) {
          const recipientBalance = parseFloat(recipientBalanceRecord.balance);
          this.db.update('balances', recipientBalanceRecord.id, { balance: recipientBalance + numAmount });
        } else {
          this.db.insert<any>('balances', { wallet_id: recipientWallet.id, token_id: token.id, balance: numAmount });
        }

        // Insert into internal ledger
        const ledger = this.db.insert<any>('internal_ledger', {
          from_wallet_id: user.walletId,
          to_wallet_id: recipientWallet.id,
          token_id: token.id,
          amount: numAmount,
          description: `Internal P2P transfer of ${numAmount} ${tokenSymbol}`
        });

        // Insert transaction histories
        const outHistory = this.db.insert<any>('transaction_history', {
          wallet_id: user.walletId,
          type: 'internal',
          direction: 'out',
          asset_symbol: tokenSymbol,
          amount: numAmount,
          counterparty: recipientAddress,
          fee: 0,
          status: 'completed',
          internal_ledger_id: ledger.id
        });

        const inHistory = this.db.insert<any>('transaction_history', {
          wallet_id: recipientWallet.id,
          type: 'internal',
          direction: 'in',
          asset_symbol: tokenSymbol,
          amount: numAmount,
          counterparty: user.address,
          fee: 0,
          status: 'completed',
          internal_ledger_id: ledger.id
        });

        // Add internal Notification for recipient
        this.db.insert<any>('notifications', {
          user_id: recipientWallet.user_id,
          title: 'Tokens Received',
          message: `You received ${numAmount} ${tokenSymbol} from ${user.address.slice(0, 6)}...${user.address.slice(-4)}`
        });

        return res.status(200).json({
          success: true,
          message: `Successfully transferred ${numAmount} ${tokenSymbol} internally`,
          data: {
            txHash: null,
            internalLedgerId: ledger.id,
            historyId: outHistory.id
          }
        });
      } else {
        // --- REAL BLOCKCHAIN TRANSFER (TRON) ---
        // Fetch sender's encrypted private key
        const wallet = this.db.findById<any>('wallets', user.walletId);
        if (!wallet) {
          return res.status(500).json({ success: false, message: 'Sender credentials unavailable' });
        }

        // Decrypt the private key securely on the fly
        const privateKey = decrypt(wallet.encrypted_private_key);

        let txResult;
        if (tokenSymbol === 'TRX') {
          txResult = await this.tronService.transferTrx(privateKey, recipientAddress, numAmount);
        } else if (tokenSymbol === 'USDT') {
          txResult = await this.tronService.transferUsdt(privateKey, recipientAddress, numAmount);
        } else {
          return res.status(400).json({ success: false, message: 'Unsupported blockchain token' });
        }

        // Cache blockchain transaction record in DB
        const bcTx = this.db.insert<any>('blockchain_transactions', {
          wallet_id: user.walletId,
          tx_hash: txResult.txHash,
          token_id: token.id,
          from_address: user.address,
          to_address: recipientAddress,
          amount: numAmount,
          fee: txResult.fee,
          status: 'confirmed'
        });

        // Write to TransactionHistory
        const history = this.db.insert<any>('transaction_history', {
          wallet_id: user.walletId,
          type: 'blockchain',
          direction: 'out',
          asset_symbol: tokenSymbol,
          amount: numAmount,
          counterparty: recipientAddress,
          fee: txResult.fee,
          status: 'completed',
          tx_hash: txResult.txHash,
          blockchain_tx_id: bcTx.id
        });

        // If recipient is an internal wallet, generate a matching incoming transaction history for them too!
        const internalRecipient = this.db.findOne<any>('wallets', w => w.address === recipientAddress);
        if (internalRecipient) {
          this.db.insert<any>('transaction_history', {
            wallet_id: internalRecipient.id,
            type: 'blockchain',
            direction: 'in',
            asset_symbol: tokenSymbol,
            amount: numAmount,
            counterparty: user.address,
            fee: 0,
            status: 'completed',
            tx_hash: txResult.txHash,
            blockchain_tx_id: bcTx.id
          });

          this.db.insert<any>('notifications', {
            user_id: internalRecipient.user_id,
            title: 'Blockchain Deposit Confirmed',
            message: `Your wallet received a transfer of ${numAmount} ${tokenSymbol} on the TRON network.`
          });
        }

        return res.status(200).json({
          success: true,
          message: `Successfully sent ${numAmount} ${tokenSymbol} on TRON Network`,
          data: {
            txHash: txResult.txHash,
            fee: txResult.fee,
            historyId: history.id
          }
        });
      }
    } catch (e: any) {
      logger.error('Asset transfer error:', { error: e.message, user: user.address });
      return res.status(500).json({ success: false, message: e.message || 'Asset transfer failed' });
    }
  };

  /**
   * Returns merged activity history of both blockchain and internal transaction logs
   */
  public getHistory = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      // 1. Fetch internal/off-chain ledger history from local DB
      const localHistory = this.db.findMany<any>('transaction_history', h => h.wallet_id === user.walletId);
      
      // Keep only internal transactions from DB (to avoid duplicates since we fetch blockchain live)
      const internalHistoryList = localHistory.filter((h: any) => h.type === 'internal');

      // 2. Fetch on-chain TRX transactions from TronGrid
      const address = user.address;
      const onChainHistoryList: any[] = [];

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4-second timeout for responsiveness

        // Fetch standard transactions
        const trxUrl = `https://api.trongrid.io/v1/accounts/${address}/transactions?limit=25`;
        const trxResponse = await fetch(trxUrl, { signal: controller.signal });
        const trxData = await trxResponse.json() as any;

        // Fetch TRC20 (USDT) transfers
        const trc20Url = `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=25`;
        const trc20Response = await fetch(trc20Url, { signal: controller.signal });
        const trc20Data = await trc20Response.json() as any;

        clearTimeout(timeoutId);

        // Parse standard TRX transactions
        if (trxData && trxData.success && Array.isArray(trxData.data)) {
          const tronWeb = this.tronService.getTronWebInstance();
          for (const tx of trxData.data) {
            try {
              if (tx.raw_data && tx.raw_data.contract && tx.raw_data.contract[0]) {
                const contract = tx.raw_data.contract[0];
                if (contract.type === 'TransferContract') {
                  const val = contract.parameter.value;
                  const rawAmount = val.amount; // In SUN
                  const amount = rawAmount / 1_000_000;
                  
                  const fromHex = val.owner_address;
                  const toHex = val.to_address;
                  
                  const fromBase58 = tronWeb.address.fromHex(fromHex);
                  const toBase58 = tronWeb.address.fromHex(toHex);

                  const isOut = fromBase58 === address;
                  const isIn = toBase58 === address;

                  if (isOut || isIn) {
                    onChainHistoryList.push({
                      id: tx.txID,
                      wallet_id: user.walletId,
                      type: 'blockchain',
                      direction: isOut ? 'out' : 'in',
                      asset_symbol: 'TRX',
                      amount: amount,
                      counterparty: isOut ? toBase58 : fromBase58,
                      fee: tx.net_fee ? (tx.net_fee / 1_000_000) : 0.0,
                      status: tx.ret?.[0]?.contractRet === 'SUCCESS' ? 'completed' : 'failed',
                      tx_hash: tx.txID,
                      created_at: new Date(tx.block_timestamp || tx.raw_data.timestamp).toISOString()
                    });
                  }
                }
              }
            } catch (innerError) {
              // Ignore invalid/malformed tx
            }
          }
        }

        // Parse TRC20 (USDT) transactions
        if (trc20Data && trc20Data.success && Array.isArray(trc20Data.data)) {
          for (const tx of trc20Data.data) {
            try {
              if (tx.token_info && tx.token_info.symbol === 'USDT') {
                const fromBase58 = tx.from;
                const toBase58 = tx.to;
                
                const isOut = fromBase58 === address;
                const isIn = toBase58 === address;
                
                if (isOut || isIn) {
                  const decimals = tx.token_info.decimals || 6;
                  const amount = Number(tx.value) / Math.pow(10, decimals);
                  
                  onChainHistoryList.push({
                    id: tx.transaction_id,
                    wallet_id: user.walletId,
                    type: 'blockchain',
                    direction: isOut ? 'out' : 'in',
                    asset_symbol: 'USDT',
                    amount: amount,
                    counterparty: isOut ? toBase58 : fromBase58,
                    fee: 15.0, // Standard fee estimation for listing
                    status: 'completed',
                    tx_hash: tx.transaction_id,
                    created_at: new Date(tx.block_timestamp).toISOString()
                  });
                }
              }
            } catch (innerError) {
              // Ignore error
            }
          }
        }
      } catch (gridError) {
        logger.error('Failed to fetch transaction history from TronGrid, falling back to local DB:', gridError);
        // Fallback to local DB's cached blockchain txs
        const blockchainHistory = localHistory.filter((h: any) => h.type === 'blockchain');
        onChainHistoryList.push(...blockchainHistory);
      }

      // Merge and sort everything newest first
      const mergedHistory = [...internalHistoryList, ...onChainHistoryList];
      const sortedHistory = mergedHistory.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Limit to 40 items for efficiency
      const finalHistory = sortedHistory.slice(0, 40);

      return res.status(200).json({
        success: true,
        data: finalHistory
      });
    } catch (e: any) {
      logger.error('Fetch transaction history error:', { error: e.message });
      return res.status(500).json({ success: false, message: 'Failed to retrieve transaction activity logs' });
    }
  };

  /**
   * Returns user's unread notifications
   */
  public getNotifications = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const notifications = this.db.findMany<any>('notifications', n => n.user_id === user.id);
      return res.status(200).json({
        success: true,
        data: notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve notifications' });
    }
  };

  /**
   * Dismiss/read notifications
   */
  public readNotifications = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const notifications = this.db.findMany<any>('notifications', n => n.user_id === user.id && !n.is_read);
      for (const n of notifications) {
        this.db.update('notifications', n.id, { is_read: true });
      }
      return res.status(200).json({ success: true, message: 'All notifications cleared' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to clear notifications' });
    }
  };

  /**
   * Get wallet registration and metadata details
   */
  public getWalletDetails = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const wallet = this.db.findOne<any>('wallets', w => w.id === user.walletId);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Wallet not found' });
      }
      return res.status(200).json({
        success: true,
        data: {
          walletId: wallet.id,
          userId: wallet.user_id,
          address: wallet.address,
          network: 'TRON Mainnet',
          isSecured: true,
          created_at: wallet.created_at
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve wallet details' });
    }
  };

  /**
   * Dedicated REST API to fetch live TRX balance
   */
  public getTrxBalance = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const liveBalances = await this.tronService.getBalances(user.address);
      return res.status(200).json({
        success: true,
        data: {
          address: user.address,
          symbol: 'TRX',
          balance: liveBalances.TRX
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve TRX balance' });
    }
  };

  /**
   * Dedicated REST API to fetch live USDT balance
   */
  public getUsdtBalance = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const liveBalances = await this.tronService.getBalances(user.address);
      return res.status(200).json({
        success: true,
        data: {
          address: user.address,
          symbol: 'USDT',
          balance: liveBalances.USDT
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve USDT balance' });
    }
  };

  /**
   * Dedicated REST API to fetch real TRON resources (energy and bandwidth)
   */
  public getResources = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const resData = await this.tronService.getAccountResources(user.address);
      return res.status(200).json({
        success: true,
        data: resData
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve account resources' });
    }
  };

  /**
   * Dedicated REST API to transfer TRX (requires passcode validation)
   */
  public sendTrx = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { recipientAddress, amount, passcode } = req.body;

    if (!recipientAddress || !amount || !passcode) {
      return res.status(400).json({ success: false, message: 'Recipient, amount, and passcode are required' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid transfer amount' });
    }

    try {
      // Verify passcode
      const security = this.db.findOne<any>('wallet_security', s => s.wallet_id === user.walletId);
      if (!security) {
        return res.status(404).json({ success: false, message: 'Wallet security profile missing' });
      }

      const isPasscodeCorrect = await bcrypt.compare(passcode, security.passcode_hash);
      if (!isPasscodeCorrect) {
        return res.status(401).json({ success: false, message: 'Incorrect 6-digit passcode' });
      }

      const wallet = this.db.findById<any>('wallets', user.walletId);
      if (!wallet) {
        return res.status(500).json({ success: false, message: 'Credentials unavailable' });
      }

      const privateKey = decrypt(wallet.encrypted_private_key);
      const txResult = await this.tronService.transferTrx(privateKey, recipientAddress, numAmount);

      const token = this.db.findOne<any>('tokens', t => t.symbol === 'TRX');

      // Cache blockchain transaction record in DB
      const bcTx = this.db.insert<any>('blockchain_transactions', {
        wallet_id: user.walletId,
        tx_hash: txResult.txHash,
        token_id: token ? token.id : 1,
        from_address: user.address,
        to_address: recipientAddress,
        amount: numAmount,
        fee: txResult.fee,
        status: 'confirmed'
      });

      // Write to TransactionHistory
      const history = this.db.insert<any>('transaction_history', {
        wallet_id: user.walletId,
        type: 'blockchain',
        direction: 'out',
        asset_symbol: 'TRX',
        amount: numAmount,
        counterparty: recipientAddress,
        fee: txResult.fee,
        status: 'completed',
        tx_hash: txResult.txHash,
        blockchain_tx_id: bcTx.id
      });

      return res.status(200).json({
        success: true,
        message: `Successfully transferred ${numAmount} TRX on TRON Mainnet`,
        data: {
          txHash: txResult.txHash,
          fee: txResult.fee,
          historyId: history.id
        }
      });
    } catch (e: any) {
      logger.error('sendTrx error:', { error: e.message, address: user.address });
      return res.status(500).json({ success: false, message: e.message || 'TRX transfer failed' });
    }
  };

  /**
   * Dedicated REST API to transfer USDT (requires passcode validation)
   */
  public sendUsdt = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { recipientAddress, amount, passcode } = req.body;

    if (!recipientAddress || !amount || !passcode) {
      return res.status(400).json({ success: false, message: 'Recipient, amount, and passcode are required' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid transfer amount' });
    }

    try {
      // Verify passcode
      const security = this.db.findOne<any>('wallet_security', s => s.wallet_id === user.walletId);
      if (!security) {
        return res.status(404).json({ success: false, message: 'Wallet security profile missing' });
      }

      const isPasscodeCorrect = await bcrypt.compare(passcode, security.passcode_hash);
      if (!isPasscodeCorrect) {
        return res.status(401).json({ success: false, message: 'Incorrect 6-digit passcode' });
      }

      const wallet = this.db.findById<any>('wallets', user.walletId);
      if (!wallet) {
        return res.status(500).json({ success: false, message: 'Credentials unavailable' });
      }

      const privateKey = decrypt(wallet.encrypted_private_key);
      const txResult = await this.tronService.transferUsdt(privateKey, recipientAddress, numAmount);

      const token = this.db.findOne<any>('tokens', t => t.symbol === 'USDT');

      // Cache blockchain transaction record in DB
      const bcTx = this.db.insert<any>('blockchain_transactions', {
        wallet_id: user.walletId,
        tx_hash: txResult.txHash,
        token_id: token ? token.id : 2,
        from_address: user.address,
        to_address: recipientAddress,
        amount: numAmount,
        fee: txResult.fee,
        status: 'confirmed'
      });

      // Write to TransactionHistory
      const history = this.db.insert<any>('transaction_history', {
        wallet_id: user.walletId,
        type: 'blockchain',
        direction: 'out',
        asset_symbol: 'USDT',
        amount: numAmount,
        counterparty: recipientAddress,
        fee: txResult.fee,
        status: 'completed',
        tx_hash: txResult.txHash,
        blockchain_tx_id: bcTx.id
      });

      return res.status(200).json({
        success: true,
        message: `Successfully transferred ${numAmount} USDT on TRON Mainnet`,
        data: {
          txHash: txResult.txHash,
          fee: txResult.fee,
          historyId: history.id
        }
      });
    } catch (e: any) {
      logger.error('sendUsdt error:', { error: e.message, address: user.address });
      return res.status(500).json({ success: false, message: e.message || 'USDT transfer failed' });
    }
  };

  /**
   * Broadcasts a fully signed transaction to the TRON Mainnet
   */
  public broadcastTransaction = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { signedTx, passcode, recipientAddress, amount, tokenSymbol } = req.body;

    if (!signedTx || !passcode || !recipientAddress || !amount || !tokenSymbol) {
      return res.status(400).json({ success: false, message: 'Missing required parameters for broadcasting' });
    }

    const numAmount = parseFloat(amount);

    try {
      // Verify passcode
      const security = this.db.findOne<any>('wallet_security', s => s.wallet_id === user.walletId);
      if (!security) {
        return res.status(404).json({ success: false, message: 'Wallet security profile missing' });
      }

      const isPasscodeCorrect = await bcrypt.compare(passcode, security.passcode_hash);
      if (!isPasscodeCorrect) {
        return res.status(401).json({ success: false, message: 'Incorrect 6-digit passcode' });
      }

      // Broadcast using TronService
      const txResult = await this.tronService.broadcastSignedTransaction(signedTx);

      const token = this.db.findOne<any>('tokens', t => t.symbol === tokenSymbol);

      // Cache blockchain transaction record in DB
      const bcTx = this.db.insert<any>('blockchain_transactions', {
        wallet_id: user.walletId,
        tx_hash: txResult.txHash,
        token_id: token ? token.id : (tokenSymbol === 'TRX' ? 1 : 2),
        from_address: user.address,
        to_address: recipientAddress,
        amount: numAmount,
        fee: txResult.fee,
        status: 'confirmed'
      });

      // Write to TransactionHistory
      const history = this.db.insert<any>('transaction_history', {
        wallet_id: user.walletId,
        type: 'blockchain',
        direction: 'out',
        asset_symbol: tokenSymbol,
        amount: numAmount,
        counterparty: recipientAddress,
        fee: txResult.fee,
        status: 'completed',
        tx_hash: txResult.txHash,
        blockchain_tx_id: bcTx.id
      });

      return res.status(200).json({
        success: true,
        message: `Successfully transferred ${numAmount} ${tokenSymbol} on TRON Mainnet`,
        data: {
          txHash: txResult.txHash,
          fee: txResult.fee,
          historyId: history.id
        }
      });
    } catch (e: any) {
      logger.error('broadcastTransaction error:', { error: e.message, address: user.address });
      return res.status(500).json({ success: false, message: e.message || 'Transaction broadcast failed' });
    }
  };

  /**
   * Check if a TRON address is activated
   */
  public isActivated = async (req: AuthenticatedRequest, res: Response) => {
    const { address } = req.query;
    if (!address || typeof address !== 'string') {
      return res.status(400).json({ success: false, message: 'Address is required' });
    }
    try {
      const tronWeb = this.tronService.getTronWebInstance();
      const acc = await tronWeb.trx.getAccount(address);
      const isActivated = !!(acc && acc.address);
      return res.status(200).json({ success: true, isActivated });
    } catch (e: any) {
      return res.status(200).json({ success: true, isActivated: true }); // Fallback to true safely
    }
  };

  /**
   * Get the decrypted private key and seed phrase for secure client-side storage
   */
  public getPrivateKey = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { passcode } = req.body;
    if (!passcode) {
      return res.status(400).json({ success: false, message: 'Passcode is required' });
    }
    try {
      // Verify passcode
      const security = this.db.findOne<any>('wallet_security', s => s.wallet_id === user.walletId);
      if (!security) {
        return res.status(404).json({ success: false, message: 'Wallet security profile missing' });
      }
      const isPasscodeCorrect = await bcrypt.compare(passcode, security.passcode_hash);
      if (!isPasscodeCorrect) {
        return res.status(401).json({ success: false, message: 'Incorrect 6-digit passcode' });
      }
      const wallet = this.db.findById<any>('wallets', user.walletId);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Wallet credentials unavailable' });
      }
      const privateKey = decrypt(wallet.encrypted_private_key);
      const seedPhrase = decrypt(wallet.encrypted_seed);
      return res.status(200).json({ success: true, privateKey, seedPhrase });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve credentials securely' });
    }
  };
}
