import { Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { TronWeb } from 'tronweb';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { JsonDatabase } from '../config/db';
import { TronService, withRetry } from '../services/tron.service';
import { decrypt, encrypt } from '../utils/crypto';
import { logger } from '../utils/logger';

export class WalletController {
  private db = JsonDatabase.getInstance();
  private tronService = TronService.getInstance();

  private historyCache = new Map<string, { data: any[]; timestamp: number }>();
  private historyPromises = new Map<string, Promise<any[]>>();
  private CACHE_TTL_MS = 15000; // 15 seconds to coalesce concurrent UI requests

  /**
   * Remove every cached balance after a successful transaction to prevent stale state
   */
  private clearBlockchainCache(walletId: number) {
    try {
      const tokens = this.db.findMany<any>('tokens', t => !t.is_internal);
      for (const token of tokens) {
        const balRecord = this.db.findOne<any>('balances', b => b.wallet_id === walletId && b.token_id === token.id);
        if (balRecord) {
          this.db.delete('balances', balRecord.id);
        }
      }
    } catch (err) {
      logger.error('Failed to clear blockchain cache:', err);
    }
  }

  /**
   * Fetches comprehensive balance portfolio (TRX, USDT + all Visible Internal Tokens)
   */
  public getPortfolio = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    logger.info(`[Portfolio API - Server] Starting portfolio fetch for user wallet: ${user.address} (Wallet ID: ${user.walletId})`);
    try {
      const wallet = this.db.findById<any>('wallets', user.walletId);
      const activeAddress = wallet ? wallet.address : user.address;

      // Automatically fix any mismatch between user.address and wallet.address if different
      if (wallet && wallet.address !== user.address) {
        logger.warn(`[Address Mismatch Fix] user.address (${user.address}) != wallet.address (${wallet.address}). Syncing user.address to wallet.address.`);
        user.address = wallet.address;
        const dbUser = this.db.findOne<any>('users', u => u.id === user.id);
        if (dbUser && dbUser.address !== wallet.address) {
          this.db.update('users', dbUser.id, { address: wallet.address });
        }
      }

      const bypassCache = req.query.refresh === 'true';

      // 1. Get real TRON Blockchain balances
      const liveBalances = await this.tronService.getBalances(activeAddress, bypassCache);
      logger.info(`[Portfolio API - Server] Live balances returned: TRX=${liveBalances.TRX}, USDT=${liveBalances.USDT}, Failed=${liveBalances.failed}`);

      // Fetch resources to satisfy logging requirements
      let rawBandwidth = '0 / 0';
      let rawEnergy = '0 / 0';
      try {
        const resources = await this.tronService.getAccountResources(activeAddress, bypassCache);
        rawBandwidth = `${resources.bandwidth.remaining} / ${resources.bandwidth.limit}`;
        rawEnergy = `${resources.energy.remaining} / ${resources.energy.limit}`;
      } catch (err: any) {
        logger.warn(`[Portfolio API - Server] Failed to fetch resources for debug logs: ${err.message}`);
      }

      // Add detailed debug logs as explicitly required by the user:
      logger.info(`[DEBUG LOGS] Wallet address used for history: ${activeAddress}`);
      logger.info(`[DEBUG LOGS] Wallet address used for balance: ${activeAddress}`);
      logger.info(`[DEBUG LOGS] Raw TRX balance returned from blockchain: ${liveBalances.TRX} TRX`);
      logger.info(`[DEBUG LOGS] Raw USDT balance returned from blockchain: ${liveBalances.USDT} USDT`);
      logger.info(`[DEBUG LOGS] Raw Bandwidth: ${rawBandwidth}`);
      logger.info(`[DEBUG LOGS] Raw Energy: ${rawEnergy}`);

      // Get live TRX price dynamically
      let liveTrxPrice = 0.125; // fallback default from db
      let priceApiFailed = false;
      try {
        const getSignal = (timeoutMs: number) => {
          if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') {
            try { return (AbortSignal as any).timeout(timeoutMs); } catch (_) {}
          }
          return undefined;
        };

        const priceSources = [
          async () => {
            const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=TRXUSDT', { signal: getSignal(3000) });
            const data = await res.json();
            if (data && data.price) return parseFloat(data.price);
            throw new Error('Invalid binance response');
          },
          async () => {
            const res = await fetch('https://min-api.cryptocompare.com/data/price?fsym=TRX&tsyms=USD', { signal: getSignal(3000) });
            const data = await res.json();
            if (data && typeof data.USD === 'number') return data.USD;
            throw new Error('Invalid cryptocompare response');
          },
          async () => {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd', { signal: getSignal(3000) });
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
            logger.info(`[Portfolio API - Server] Successfully updated TRX price: $${liveTrxPrice}`);
            break;
          } catch (err: any) {
            logger.warn(`[Portfolio API - Server] Price source failed: ${err.message}, trying next...`);
          }
        }
        if (!successFetch) {
          priceApiFailed = true;
          logger.warn('[Portfolio API - Server] All price APIs failed. Utilizing cached token prices.');
          // Use cached price if API fails
          const prices = this.db.query<any>('token_prices');
          const trxPriceObj = prices.find((p: any) => p.token_id === 1);
          if (trxPriceObj) {
            liveTrxPrice = parseFloat(trxPriceObj.price_usd);
          }
        }
      } catch (err: any) {
        logger.error('[Portfolio API - Server] Failed to fetch live TRX price:', err);
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
          // Check if balance sync failed. If it failed, use previous cached balance!
          const balRecord = this.db.findOne<any>('balances', b => b.wallet_id === user.walletId && b.token_id === token.id);
          const cachedBalance = balRecord ? parseFloat(balRecord.balance) : 0.0;

          if (liveBalances.failed) {
            // Keep previous successful blockchain data!
            balance = cachedBalance;
          } else {
            // Sync with live TRON chain
            balance = token.symbol === 'TRX' ? liveBalances.TRX : liveBalances.USDT;

            // Update cache in DB
            if (balRecord) {
              this.db.update('balances', balRecord.id, { balance: balance });
            } else {
              this.db.insert<any>('balances', { wallet_id: user.walletId, token_id: token.id, balance: balance });
            }
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

      logger.info(`[Portfolio API - Server] Successfully aggregated portfolio. Total USD: $${totalValueUsd.toFixed(2)}`);

      return res.status(200).json({
        success: true,
        data: {
          address: activeAddress,
          totalPortfolioUsd: totalValueUsd,
          assets: portfolio,
          network: 'TRON Mainnet',
          isUnavailable: false // Never show Balance Unavailable as long as database / cache exists
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

        // Clear cached balances to prevent stale state
        this.clearBlockchainCache(user.walletId);

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
    logger.info(`[History API - Server] Fetching history for user address: ${user.address}`);
    try {
      const wallet = this.db.findById<any>('wallets', user.walletId);
      const activeAddress = wallet ? wallet.address : user.address;

      // 1. Get all transaction history currently in the local DB
      const localHistory = this.db.findMany<any>('transaction_history', h => h.wallet_id === user.walletId);

      // We'll build the active list of blockchain transactions
      let onChainHistoryList: any[] = [];
      let fetchSuccess = false;

      // Check history cache
      const now = Date.now();
      const cached = this.historyCache.get(activeAddress);
      const bypassCache = req.query.refresh === 'true';
      
      if (!bypassCache && cached && (now - cached.timestamp < this.CACHE_TTL_MS)) {
        logger.info(`[History API - Server] Returning cached on-chain history for ${activeAddress}`);
        onChainHistoryList = cached.data;
        fetchSuccess = true;
      } else {
        let pending = bypassCache ? null : this.historyPromises.get(activeAddress);
        if (!pending) {
          pending = (async () => {
            const list: any[] = [];
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const fetchHeaders: any = { 'Accept': 'application/json' };
            const apiKey = process.env.TRONGRID_API_KEY;
            if (apiKey && apiKey.trim() !== '') {
              fetchHeaders['TRON-PRO-API-KEY'] = apiKey;
            }

            // Fetch standard transactions
            const trxUrl = `https://api.trongrid.io/v1/accounts/${activeAddress}/transactions?limit=25`;
            const trxResponse = await withRetry(async () => {
              const res = await fetch(trxUrl, { headers: fetchHeaders, signal: controller.signal });
              if (res.status === 429) {
                throw new Error('429 Rate Limit Exceeded');
              }
              return res;
            }, 3, 300, 'TRX history fetch');
            const trxData = await trxResponse.json() as any;

            // Fetch TRC20 (USDT) transfers
            const trc20Url = `https://api.trongrid.io/v1/accounts/${activeAddress}/transactions/trc20?limit=25`;
            const trc20Response = await withRetry(async () => {
              const res = await fetch(trc20Url, { headers: fetchHeaders, signal: controller.signal });
              if (res.status === 429) {
                throw new Error('429 Rate Limit Exceeded');
              }
              return res;
            }, 3, 300, 'TRC20 history fetch');
            const trc20Data = await trc20Response.json() as any;

            clearTimeout(timeoutId);

            if (!trxResponse.ok || !trxData || trxData.success === false) {
              throw new Error(`TronGrid TRX query failed with status: ${trxResponse.status}`);
            }
            if (!trc20Response.ok || !trc20Data || trc20Data.success === false) {
              throw new Error(`TronGrid TRC20 query failed with status: ${trc20Response.status}`);
            }

            // Parse standard TRX transactions
            if (Array.isArray(trxData.data)) {
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

                      const isOut = fromBase58 === activeAddress;
                      const isIn = toBase58 === activeAddress;

                      if (isOut || isIn) {
                        const txId = tx.txID;
                        const createdAt = new Date(tx.block_timestamp || tx.raw_data.timestamp).toISOString();

                        // Insert or update in local database to cache this transaction
                        const existing = this.db.findOne<any>('transaction_history', h => h.tx_hash === txId);
                        const txRecord = {
                          wallet_id: user.walletId,
                          type: 'blockchain',
                          direction: isOut ? 'out' : 'in',
                          asset_symbol: 'TRX',
                          amount: amount,
                          counterparty: isOut ? toBase58 : fromBase58,
                          fee: tx.net_fee ? (tx.net_fee / 1_000_000) : 0.0,
                          status: tx.ret?.[0]?.contractRet === 'SUCCESS' ? 'completed' : 'failed',
                          tx_hash: txId,
                          created_at: createdAt
                        };

                        if (!existing) {
                          this.db.insert<any>('transaction_history', txRecord);
                        }

                        list.push({
                          id: txId,
                          ...txRecord
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
            if (Array.isArray(trc20Data.data)) {
              for (const tx of trc20Data.data) {
                try {
                  if (tx.token_info && tx.token_info.symbol === 'USDT') {
                    const fromBase58 = tx.from;
                    const toBase58 = tx.to;
                    
                    const isOut = fromBase58 === activeAddress;
                    const isIn = toBase58 === activeAddress;
                    
                    if (isOut || isIn) {
                      const decimals = tx.token_info.decimals || 6;
                      const amount = Number(tx.value) / Math.pow(10, decimals);
                      const txId = tx.transaction_id;
                      const createdAt = new Date(tx.block_timestamp).toISOString();

                      // Insert or update in local database to cache this transaction
                      const existing = this.db.findOne<any>('transaction_history', h => h.tx_hash === txId);
                      const txRecord = {
                        wallet_id: user.walletId,
                        type: 'blockchain',
                        direction: isOut ? 'out' : 'in',
                        asset_symbol: 'USDT',
                        amount: amount,
                        counterparty: isOut ? toBase58 : fromBase58,
                        fee: 15.0, // Standard fee estimation for listing
                        status: 'completed',
                        tx_hash: txId,
                        created_at: createdAt
                      };

                      if (!existing) {
                        this.db.insert<any>('transaction_history', txRecord);
                      }

                      list.push({
                        id: txId,
                        ...txRecord
                      });
                    }
                  }
                } catch (innerError) {
                  // Ignore error
                }
              }
            }

            return list;
          })();

          this.historyPromises.set(activeAddress, pending);
        } else {
          logger.info(`[History API - Server] Coalescing concurrent history query for ${activeAddress}`);
        }

        try {
          onChainHistoryList = await pending;
          this.historyCache.set(activeAddress, { data: onChainHistoryList, timestamp: Date.now() });
          this.historyPromises.delete(activeAddress);
          fetchSuccess = true;
          logger.info(`[History API - Server] Successfully fetched and cached ${onChainHistoryList.length} transactions from TronGrid.`);
        } catch (gridError: any) {
          this.historyPromises.delete(activeAddress);
          logger.error(`[History API - Server] Failed to fetch transaction history from TronGrid: ${gridError.message}. Falling back to cached history.`);
        }
      }

      // 3. Merging logic
      let finalHistoryList: any[] = [];
      if (fetchSuccess) {
        // If fetch succeeded, we use our freshly queried (and cached) blockchain list plus internal transactions
        const internalHistoryList = localHistory.filter((h: any) => h.type === 'internal');
        finalHistoryList = [...internalHistoryList, ...onChainHistoryList];
      } else {
        // If fetch failed, fallback to the ENTIRE local history (which now contains previously cached blockchain txs!)
        finalHistoryList = localHistory;
      }

      // Remove duplicate tx_hash items if any exist
      const seenHashes = new Set<string>();
      const uniqueHistoryList: any[] = [];
      for (const item of finalHistoryList) {
        if (item.tx_hash) {
          if (seenHashes.has(item.tx_hash)) {
            continue;
          }
          seenHashes.add(item.tx_hash);
        }
        uniqueHistoryList.push(item);
      }

      // Sort newest first
      const sortedHistory = uniqueHistoryList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Limit to 40 items for efficiency
      const finalHistory = sortedHistory.slice(0, 40);

      logger.info(`[History API - Server] Returning ${finalHistory.length} history records to client.`);

      return res.status(200).json({
        success: true,
        address: activeAddress,
        data: finalHistory
      });
    } catch (e: any) {
      logger.error('[History API - Server] Fetch transaction history error:', { error: e.message });
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
      const wallet = this.db.findById<any>('wallets', user.walletId);
      const activeAddress = wallet ? wallet.address : user.address;
      const liveBalances = await this.tronService.getBalances(activeAddress);
      return res.status(200).json({
        success: true,
        data: {
          address: activeAddress,
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
      const wallet = this.db.findById<any>('wallets', user.walletId);
      const activeAddress = wallet ? wallet.address : user.address;
      const liveBalances = await this.tronService.getBalances(activeAddress);
      return res.status(200).json({
        success: true,
        data: {
          address: activeAddress,
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
      const wallet = this.db.findById<any>('wallets', user.walletId);
      const activeAddress = wallet ? wallet.address : user.address;
      const bypassCache = req.query.refresh === 'true';
      const resData = await this.tronService.getAccountResources(activeAddress, bypassCache);
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

      // Clear cached balances to prevent stale state
      this.clearBlockchainCache(user.walletId);

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

      // Clear cached balances to prevent stale state
      this.clearBlockchainCache(user.walletId);

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

      // Clear cached balances to prevent stale state
      this.clearBlockchainCache(user.walletId);

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
   * Get live transaction status from TRON blockchain and update local DB
   */
  public getTransactionStatus = async (req: AuthenticatedRequest, res: Response) => {
    const { txId } = req.query;
    if (!txId || typeof txId !== 'string') {
      return res.status(400).json({ success: false, message: 'txId is required' });
    }
    try {
      const result = await this.tronService.getTransactionStatus(txId);
      
      // Update transaction status in local database if it's confirmed or failed
      if (result.status !== 'pending') {
        const bcTx = this.db.findOne<any>('blockchain_transactions', t => t.tx_hash === txId);
        if (bcTx) {
          this.db.update('blockchain_transactions', bcTx.id, {
            status: result.status === 'confirmed' ? 'confirmed' : 'failed'
          });
        }
        const hist = this.db.findOne<any>('transaction_history', t => t.tx_hash === txId);
        if (hist) {
          this.db.update('transaction_history', hist.id, {
            status: result.status === 'confirmed' ? 'completed' : 'failed'
          });
        }
      }

      return res.status(200).json({ success: true, ...result });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message || 'Failed to get transaction status' });
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

  /**
   * Fetch comprehensive live/custom market details and statistics
   */
  public getMarketData = async (req: AuthenticatedRequest, res: Response) => {
    const bypassCache = req.query.refresh === 'true';
    const now = Date.now();

    // 30 seconds refresh cache limit
    if (!bypassCache && globalMarketCache && (now - globalMarketCache.timestamp < 30000)) {
      return res.status(200).json({
        success: true,
        data: globalMarketCache.data,
        cached: true,
        lastUpdated: new Date(globalMarketCache.timestamp).toISOString()
      });
    }

    try {
      const getSignal = (timeoutMs: number) => {
        if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') {
          try { return (AbortSignal as any).timeout(timeoutMs); } catch (_) {}
        }
        return undefined;
      };

      // 1. Fetch live prices and stats for public assets (TRX, USDT)
      let trxPrice = 0.125;
      let trxChange24h = -1.2;
      let trxVolume24h = 1450000000;
      let trxMarketCap = 10800000000;
      let trxAth = 0.3004;
      let trxAtl = 0.00109;
      let trxCircSupply = 86810000000;
      let trxTotalSupply = 86812000000;
      let trxSparkline: number[] = [];
      let trxHistory30d: { date: string; price: number }[] = [];

      let usdtPrice = 1.00;
      let usdtChange24h = 0.02;
      let usdtVolume24h = 48500000000;
      let usdtMarketCap = 112000000000;
      let usdtAth = 1.32;
      let usdtAtl = 0.57;
      let usdtCircSupply = 112000000000;
      let usdtTotalSupply = 112000000000;
      let usdtSparkline: number[] = [];
      let usdtHistory30d: { date: string; price: number }[] = [];

      let successTRX = false;

      // Try Binance first as it is super robust and reliable
      try {
        const binanceTickerRes = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=TRXUSDT', { signal: getSignal(3000) });
        const binanceData = await binanceTickerRes.json();
        if (binanceData && binanceData.lastPrice) {
          trxPrice = parseFloat(binanceData.lastPrice);
          trxChange24h = parseFloat(binanceData.priceChangePercent || '0');
          trxVolume24h = parseFloat(binanceData.volume || '0') * trxPrice;
          trxAth = parseFloat(binanceData.highPrice || '0.30');
          trxAtl = parseFloat(binanceData.lowPrice || '0.001');
          successTRX = true;
        }

        // Try to fetch historical klines (30 days of daily prices)
        const binanceKlinesRes = await fetch('https://api.binance.com/api/v3/klines?symbol=TRXUSDT&interval=1d&limit=30', { signal: getSignal(3000) });
        const klinesData = await binanceKlinesRes.json();
        if (Array.isArray(klinesData)) {
          trxHistory30d = klinesData.map((k: any) => {
            const dateStr = new Date(k[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return { date: dateStr, price: parseFloat(k[4]) };
          });
          trxSparkline = trxHistory30d.slice(-7).map(h => h.price);
        }
      } catch (err: any) {
        logger.warn(`Binance fetch failed: ${err.message}. Trying CoinGecko...`);
      }

      // If Binance failed or to fetch USDT stats, try CoinGecko
      try {
        const cgMarketsRes = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=tron,tether&order=market_cap_desc&per_page=10&page=1&sparkline=true', { signal: getSignal(3000) });
        const cgData = await cgMarketsRes.json();
        if (Array.isArray(cgData)) {
          const tronData = cgData.find((c: any) => c.id === 'tron');
          if (tronData) {
            if (!successTRX) {
              trxPrice = tronData.current_price || trxPrice;
              trxChange24h = tronData.price_change_percentage_24h || trxChange24h;
              trxVolume24h = tronData.total_volume || trxVolume24h;
              trxAth = tronData.ath || trxAth;
              trxAtl = tronData.atl || trxAtl;
            }
            trxMarketCap = tronData.market_cap || trxMarketCap;
            trxCircSupply = tronData.circulating_supply || trxCircSupply;
            trxTotalSupply = tronData.total_supply || trxTotalSupply;
            if (trxSparkline.length === 0 && tronData.sparkline_in_7d && Array.isArray(tronData.sparkline_in_7d.price)) {
              trxSparkline = tronData.sparkline_in_7d.price;
            }
          }

          const tetherData = cgData.find((c: any) => c.id === 'tether');
          if (tetherData) {
            usdtPrice = tetherData.current_price || usdtPrice;
            usdtChange24h = tetherData.price_change_percentage_24h || usdtChange24h;
            usdtVolume24h = tetherData.total_volume || usdtVolume24h;
            usdtMarketCap = tetherData.market_cap || usdtMarketCap;
            usdtCircSupply = tetherData.circulating_supply || usdtCircSupply;
            usdtTotalSupply = tetherData.total_supply || usdtTotalSupply;
            usdtAth = tetherData.ath || usdtAth;
            usdtAtl = tetherData.atl || usdtAtl;
            if (tetherData.sparkline_in_7d && Array.isArray(tetherData.sparkline_in_7d.price)) {
              usdtSparkline = tetherData.sparkline_in_7d.price;
            }
          }
        }
      } catch (err: any) {
        logger.warn(`CoinGecko fetch failed: ${err.message}. Relying on robust defaults/cache...`);
      }

      // Generate sparklines if not loaded
      const seedRandomWalk = (endPrice: number, points: number, volatility: number, seedStr: string): number[] => {
        let seed = 0;
        for (let i = 0; i < seedStr.length; i++) {
          seed = (seed * 31 + seedStr.charCodeAt(i)) & 0xffffffff;
        }
        const random = () => {
          seed = (seed * 1103515245 + 12345) & 0xffffffff;
          return (seed >>> 16) / 32768 - 1;
        };
        const walk: number[] = new Array(points);
        walk[points - 1] = endPrice;
        for (let i = points - 2; i >= 0; i--) {
          const change = random() * volatility * walk[i + 1];
          walk[i] = walk[i + 1] - change;
        }
        return walk;
      };

      const seedHistory30d = (endPrice: number, points: number, volatility: number, seedStr: string): { date: string; price: number }[] => {
        const prices = seedRandomWalk(endPrice, points, volatility, seedStr);
        const history: { date: string; price: number }[] = [];
        const today = new Date();
        for (let i = 0; i < points; i++) {
          const d = new Date();
          d.setDate(today.getDate() - (points - 1 - i));
          const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          history.push({ date: dateStr, price: prices[i] });
        }
        return history;
      };

      const todayStr = new Date().toDateString();

      if (trxSparkline.length === 0) {
        trxSparkline = seedRandomWalk(trxPrice, 24, 0.015, `trx_spark_${todayStr}`);
      }
      if (trxHistory30d.length === 0) {
        trxHistory30d = seedHistory30d(trxPrice, 30, 0.02, `trx_hist_${todayStr}`);
      }

      if (usdtSparkline.length === 0) {
        usdtSparkline = seedRandomWalk(usdtPrice, 24, 0.001, `usdt_spark_${todayStr}`);
      }
      if (usdtHistory30d.length === 0) {
        usdtHistory30d = seedHistory30d(usdtPrice, 30, 0.001, `usdt_hist_${todayStr}`);
      }

      // 2. Fetch custom token prices from DB table `token_prices` and compute supplies
      const dbPrices = this.db.query<any>('token_prices');
      const dbTokens = this.db.query<any>('tokens');
      const balances = this.db.query<any>('balances');

      // Nest Dollar config
      const mUSDToken = dbTokens.find((t: any) => t.symbol === 'mUSD');
      const mUSDPriceObj = dbPrices.find((p: any) => p.token_id === 3);
      const musdPrice = mUSDPriceObj ? parseFloat(mUSDPriceObj.price_usd) : 1.00;

      // Calculate circulating supply from all wallets in DB
      const musdCircSupply = balances
        .filter((b: any) => b.token_id === 3)
        .reduce((sum: number, b: any) => sum + parseFloat(b.balance || '0'), 0);

      const musdSparkline = seedRandomWalk(musdPrice, 24, 0.0005, `musd_spark_${todayStr}`);
      const musdHistory30d = seedHistory30d(musdPrice, 30, 0.0006, `musd_hist_${todayStr}`);

      // Gold Nest config
      const goldToken = dbTokens.find((t: any) => t.symbol === 'GOLD');
      const goldPriceObj = dbPrices.find((p: any) => p.token_id === 4);
      const goldPrice = goldPriceObj ? parseFloat(goldPriceObj.price_usd) : 75.50;

      const goldCircSupply = balances
        .filter((b: any) => b.token_id === 4)
        .reduce((sum: number, b: any) => sum + parseFloat(b.balance || '0'), 0);

      const goldSparkline = seedRandomWalk(goldPrice, 24, 0.005, `gold_spark_${todayStr}`);
      const goldHistory30d = seedHistory30d(goldPrice, 30, 0.006, `gold_hist_${todayStr}`);

      // 3. Update the `token_prices` database with the latest fetched public prices to ensure consistency
      const trxPriceObj = dbPrices.find((p: any) => p.token_id === 1);
      if (trxPriceObj) {
        this.db.update('token_prices', trxPriceObj.id, { price_usd: trxPrice, updated_at: new Date().toISOString() });
      }
      const usdtPriceObj = dbPrices.find((p: any) => p.token_id === 2);
      if (usdtPriceObj) {
        this.db.update('token_prices', usdtPriceObj.id, { price_usd: usdtPrice, updated_at: new Date().toISOString() });
      }

      // Aggregate all market data records
      const marketData = [
        {
          id: 1,
          name: 'TRON',
          symbol: 'TRX',
          logoUrl: 'https://cryptologos.cc/logos/tron-trx-logo.png',
          priceUsd: trxPrice,
          change24h: trxChange24h,
          marketCap: trxMarketCap,
          volume24h: trxVolume24h,
          circulatingSupply: trxCircSupply,
          totalSupply: trxTotalSupply,
          ath: trxAth,
          atl: trxAtl,
          sparkline: trxSparkline,
          history30d: trxHistory30d,
          isInternal: false
        },
        {
          id: 2,
          name: 'Tether USD',
          symbol: 'USDT',
          logoUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.png',
          priceUsd: usdtPrice,
          change24h: usdtChange24h,
          marketCap: usdtMarketCap,
          volume24h: usdtVolume24h,
          circulatingSupply: usdtCircSupply,
          totalSupply: usdtTotalSupply,
          ath: usdtAth,
          atl: usdtAtl,
          sparkline: usdtSparkline,
          history30d: usdtHistory30d,
          isInternal: false
        },
        {
          id: 3,
          name: 'Nest Dollar',
          symbol: 'mUSD',
          logoUrl: mUSDToken?.logo_url || 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=200&auto=format&fit=crop',
          priceUsd: musdPrice,
          change24h: -0.01,
          marketCap: musdPrice * (musdCircSupply || 500000),
          volume24h: 1240,
          circulatingSupply: musdCircSupply || 500000,
          totalSupply: 10000000,
          ath: 1.05,
          atl: 0.95,
          sparkline: musdSparkline,
          history30d: musdHistory30d,
          isInternal: true
        },
        {
          id: 4,
          name: 'Gold Nest',
          symbol: 'GOLD',
          logoUrl: goldToken?.logo_url || 'https://images.unsplash.com/photo-1610375228911-2f073259b662?q=80&w=200&auto=format&fit=crop',
          priceUsd: goldPrice,
          change24h: 0.42,
          marketCap: goldPrice * (goldCircSupply || 25000),
          volume24h: 18450,
          circulatingSupply: goldCircSupply || 25000,
          totalSupply: 1000000,
          ath: 85.00,
          atl: 55.00,
          sparkline: goldSparkline,
          history30d: goldHistory30d,
          isInternal: true
        }
      ];

      globalMarketCache = {
        timestamp: now,
        data: marketData
      };

      return res.status(200).json({
        success: true,
        data: marketData,
        cached: false,
        lastUpdated: new Date(now).toISOString()
      });
    } catch (err: any) {
      logger.error('Market data compilation error:', err);

      // Fallback gracefully to offline cache if compilation fails
      if (globalMarketCache) {
        return res.status(200).json({
          success: true,
          data: globalMarketCache.data,
          cached: true,
          lastUpdated: new Date(globalMarketCache.timestamp).toISOString(),
          error: 'Using stale offline cache due to upstream API failure'
        });
      }

      // If no cache exists, use db values for basic info
      try {
        const dbPrices = this.db.query<any>('token_prices');
        const dbTokens = this.db.query<any>('tokens');
        const basicData = dbTokens.map((t: any) => {
          const pr = dbPrices.find((p: any) => p.token_id === t.id);
          const price = pr ? parseFloat(pr.price_usd) : 1.0;
          return {
            id: t.id,
            name: t.name,
            symbol: t.symbol,
            logoUrl: t.logo_url,
            priceUsd: price,
            change24h: 0.0,
            marketCap: price * 1000000,
            volume24h: 100000,
            circulatingSupply: 1000000,
            totalSupply: 1000000,
            ath: price * 1.2,
            atl: price * 0.8,
            sparkline: new Array(24).fill(price),
            history30d: new Array(30).fill(price).map((p, idx) => ({ date: `Day ${idx}`, price: p })),
            isInternal: t.is_internal
          };
        });

        return res.status(200).json({
          success: true,
          data: basicData,
          cached: true,
          lastUpdated: new Date().toISOString(),
          warning: 'Offline mode active'
        });
      } catch (dbErr: any) {
        return res.status(500).json({ success: false, message: 'Failsafe market aggregation error' });
      }
    }
  };

  /**
   * Module 1: Notifications
   */
  public deleteNotification = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const notificationId = parseInt(req.params.id);
      const notification = this.db.findOne<any>('notifications', n => n.id === notificationId && n.user_id === user.id);
      if (!notification) {
        return res.status(404).json({ success: false, message: 'Notification not found' });
      }
      this.db.delete('notifications', notification.id);
      return res.status(200).json({ success: true, message: 'Notification deleted successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to delete notification' });
    }
  };

  public readSingleNotification = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const notificationId = parseInt(req.params.id);
      const notification = this.db.findOne<any>('notifications', n => n.id === notificationId && n.user_id === user.id);
      if (!notification) {
        return res.status(404).json({ success: false, message: 'Notification not found' });
      }
      this.db.update('notifications', notification.id, { is_read: true });
      return res.status(200).json({ success: true, message: 'Notification marked as read' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to update notification' });
    }
  };

  /**
   * Module 2: Multi-Wallet Management
   */
  public listWallets = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const wallets = this.db.findMany<any>('wallets', w => w.user_id === user.id);
      const tokens = this.db.query<any>('tokens');
      const prices = this.db.query<any>('token_prices');
      const userObj = this.db.findById<any>('users', user.id);
      const activeWalletId = userObj ? (userObj.active_wallet_id || userObj.wallet_id) : user.walletId;

      const formattedWallets = [];
      let totalPortfolioAllWallets = 0;

      for (const w of wallets) {
        let walletTotalUsd = 0;
        const walletAssets = [];

        for (const token of tokens) {
          if (!token.is_visible || !token.is_active) continue;
          const balRecord = this.db.findOne<any>('balances', b => b.wallet_id === w.id && b.token_id === token.id);
          const balance = balRecord ? parseFloat(balRecord.balance) : 0.0;
          const priceObj = prices.find((p: any) => p.token_id === token.id);
          const priceUsd = priceObj ? parseFloat(priceObj.price_usd) : 0.0;
          const valueUsd = balance * priceUsd;
          walletTotalUsd += valueUsd;

          walletAssets.push({
            symbol: token.symbol,
            balance,
            valueUsd
          });
        }

        totalPortfolioAllWallets += walletTotalUsd;

        formattedWallets.push({
          id: w.id,
          address: w.address,
          name: w.name || `Wallet ${w.id}`,
          color: w.color || '#ef4444',
          icon: w.icon || 'wallet',
          isBackupConfirmed: !!w.backup_confirmed,
          isActive: w.id === activeWalletId,
          totalValueUsd: walletTotalUsd,
          assets: walletAssets
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          wallets: formattedWallets,
          totalAssetsAllWalletsUsd: totalPortfolioAllWallets
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve wallets list' });
    }
  };

  public createWallet = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const { name, color, icon } = req.body;
      const walletData = await this.tronService.generateWallet();
      
      const encryptedSeed = encrypt(walletData.seedPhrase);
      const encryptedPrivateKey = encrypt(walletData.privateKey);

      const wallet = this.db.insert<any>('wallets', {
        user_id: user.id,
        address: walletData.address,
        encrypted_seed: encryptedSeed,
        encrypted_private_key: encryptedPrivateKey,
        name: name || `Wallet ${Math.floor(Math.random() * 1000)}`,
        color: color || '#ef4444',
        icon: icon || 'wallet',
        backup_confirmed: false
      });

      const primaryWallet = this.db.findOne<any>('wallets', w => w.user_id === user.id && w.id !== wallet.id);
      if (primaryWallet) {
        const primarySecurity = this.db.findOne<any>('wallet_security', s => s.wallet_id === primaryWallet.id);
        if (primarySecurity) {
          this.db.insert<any>('wallet_security', {
            wallet_id: wallet.id,
            passcode_hash: primarySecurity.passcode_hash,
            failed_attempts: 0,
            locked_until: null,
            biometrics_enabled: primarySecurity.biometrics_enabled || false,
            auto_lock_duration: primarySecurity.auto_lock_duration || '5',
            privacy_mode_enabled: primarySecurity.privacy_mode_enabled || false,
            screenshot_protection_enabled: primarySecurity.screenshot_protection_enabled || false,
            clipboard_autoclear_seconds: primarySecurity.clipboard_autoclear_seconds || 30
          });
        }
      }

      const tokens = this.db.query<any>('tokens');
      for (const t of tokens) {
        this.db.insert<any>('balances', {
          wallet_id: wallet.id,
          token_id: t.id,
          balance: 0.0
        });
      }

      this.db.insert<any>('notifications', {
        user_id: user.id,
        title: 'New Wallet Created',
        message: `Wallet "${wallet.name}" successfully created and secured with your PIN.`,
        created_at: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        message: 'Wallet created successfully',
        data: {
          id: wallet.id,
          address: wallet.address,
          name: wallet.name,
          privateKey: walletData.privateKey,
          seedPhrase: walletData.seedPhrase
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to create new wallet' });
    }
  };

  public importWalletEndpoint = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const { privateKey, seedPhrase, name, color, icon } = req.body;
      
      let address = '';
      let derivedPrivateKey = '';
      let derivedSeedPhrase = '';

      if (privateKey) {
        const cleanKey = privateKey.trim();
        try {
          address = TronWeb.address.fromPrivateKey(cleanKey) as string;
          derivedPrivateKey = cleanKey;
        } catch (err) {
          return res.status(400).json({ success: false, message: 'Invalid private key format.' });
        }
      } else if (seedPhrase) {
        const cleanPhrase = seedPhrase.trim().toLowerCase();
        const restored = await this.tronService.importWallet(cleanPhrase);
        address = restored.address;
        derivedPrivateKey = restored.privateKey;
        derivedSeedPhrase = cleanPhrase;
      } else {
        return res.status(400).json({ success: false, message: 'Private key or Seed phrase is required' });
      }

      const existing = this.db.findOne<any>('wallets', w => w.user_id === user.id && w.address === address);
      if (existing) {
        return res.status(400).json({ success: false, message: 'This wallet is already imported under your account.' });
      }

      const encryptedSeed = derivedSeedPhrase ? encrypt(derivedSeedPhrase) : null;
      const encryptedPrivateKey = encrypt(derivedPrivateKey);

      const wallet = this.db.insert<any>('wallets', {
        user_id: user.id,
        address: address,
        encrypted_seed: encryptedSeed,
        encrypted_private_key: encryptedPrivateKey,
        name: name || `Imported Wallet`,
        color: color || '#2563eb',
        icon: icon || 'import',
        backup_confirmed: true
      });

      const primaryWallet = this.db.findOne<any>('wallets', w => w.user_id === user.id && w.id !== wallet.id);
      if (primaryWallet) {
        const primarySecurity = this.db.findOne<any>('wallet_security', s => s.wallet_id === primaryWallet.id);
        if (primarySecurity) {
          this.db.insert<any>('wallet_security', {
            wallet_id: wallet.id,
            passcode_hash: primarySecurity.passcode_hash,
            failed_attempts: 0,
            locked_until: null,
            biometrics_enabled: primarySecurity.biometrics_enabled || false,
            auto_lock_duration: primarySecurity.auto_lock_duration || '5',
            privacy_mode_enabled: primarySecurity.privacy_mode_enabled || false,
            screenshot_protection_enabled: primarySecurity.screenshot_protection_enabled || false,
            clipboard_autoclear_seconds: primarySecurity.clipboard_autoclear_seconds || 30
          });
        }
      }

      const tokens = this.db.query<any>('tokens');
      for (const t of tokens) {
        this.db.insert<any>('balances', {
          wallet_id: wallet.id,
          token_id: t.id,
          balance: 0.0
        });
      }

      this.tronService.getBalances(address, true).catch(() => {});

      this.db.insert<any>('notifications', {
        user_id: user.id,
        title: 'Wallet Imported',
        message: `Wallet "${wallet.name}" successfully imported and integrated.`,
        created_at: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        message: 'Wallet imported successfully',
        data: {
          id: wallet.id,
          address: wallet.address,
          name: wallet.name
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to import wallet' });
    }
  };

  public renameWallet = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const { walletId, name } = req.body;
      if (!walletId || !name) {
        return res.status(400).json({ success: false, message: 'Wallet ID and Name are required' });
      }
      const wallet = this.db.findOne<any>('wallets', w => w.id === walletId && w.user_id === user.id);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Wallet not found' });
      }
      this.db.update('wallets', wallet.id, { name });
      return res.status(200).json({ success: true, message: 'Wallet renamed successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to rename wallet' });
    }
  };

  public customizeWallet = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const { walletId, color, icon } = req.body;
      if (!walletId) {
        return res.status(400).json({ success: false, message: 'Wallet ID is required' });
      }
      const wallet = this.db.findOne<any>('wallets', w => w.id === walletId && w.user_id === user.id);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Wallet not found' });
      }
      const updates: any = {};
      if (color) updates.color = color;
      if (icon) updates.icon = icon;
      this.db.update('wallets', wallet.id, updates);
      return res.status(200).json({ success: true, message: 'Wallet customized successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to customize wallet' });
    }
  };

  public switchWallet = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const { walletId } = req.body;
      if (!walletId) {
        return res.status(400).json({ success: false, message: 'Wallet ID is required' });
      }
      const wallet = this.db.findOne<any>('wallets', w => w.id === walletId && w.user_id === user.id);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Wallet not found' });
      }

      const userObj = this.db.findById<any>('users', user.id);
      if (userObj) {
        this.db.update('users', user.id, { active_wallet_id: wallet.id, address: wallet.address });
      }

      return res.status(200).json({
        success: true,
        message: 'Switched wallet successfully',
        data: {
          walletId: wallet.id,
          address: wallet.address,
          name: wallet.name
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to switch wallet' });
    }
  };

  public deleteWallet = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const walletId = parseInt(req.params.id);
      if (!walletId) {
        return res.status(400).json({ success: false, message: 'Wallet ID is required' });
      }
      
      const wallets = this.db.findMany<any>('wallets', w => w.user_id === user.id);
      if (wallets.length <= 1) {
         return res.status(400).json({ success: false, message: 'Cannot delete the only wallet on your account.' });
      }

      const walletToDelete = wallets.find(w => w.id === walletId);
      if (!walletToDelete) {
        return res.status(404).json({ success: false, message: 'Wallet not found' });
      }

      this.db.delete('wallets', walletToDelete.id);
      
      const security = this.db.findOne<any>('wallet_security', s => s.wallet_id === walletToDelete.id);
      if (security) {
        this.db.delete('wallet_security', security.id);
      }

      const balances = this.db.findMany<any>('balances', b => b.wallet_id === walletToDelete.id);
      for (const b of balances) {
        this.db.delete('balances', b.id);
      }

      const userObj = this.db.findById<any>('users', user.id);
      if (userObj && (userObj.active_wallet_id === walletToDelete.id || userObj.wallet_id === walletToDelete.id)) {
        const remainingWallet = wallets.find(w => w.id !== walletToDelete.id)!;
        this.db.update('users', user.id, { 
          active_wallet_id: remainingWallet.id, 
          address: remainingWallet.address,
          wallet_id: remainingWallet.id
        });
      }

      return res.status(200).json({ success: true, message: 'Wallet deleted successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to delete wallet' });
    }
  };

  public confirmBackup = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const { walletId } = req.body;
      if (!walletId) {
        return res.status(400).json({ success: false, message: 'Wallet ID is required' });
      }
      const wallet = this.db.findOne<any>('wallets', w => w.id === walletId && w.user_id === user.id);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Wallet not found' });
      }
      this.db.update('wallets', wallet.id, { backup_confirmed: true });
      return res.status(200).json({ success: true, message: 'Backup confirmed successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to confirm backup' });
    }
  };

  /**
   * Module 3: Advanced Security Center
   */
  public getSecuritySettings = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const security = this.db.findOne<any>('wallet_security', s => s.wallet_id === user.walletId);
      if (!security) {
        return res.status(200).json({
          success: true,
          data: {
            biometricsEnabled: false,
            autoLockDuration: '5',
            privacyModeEnabled: false,
            screenshotProtectionEnabled: false,
            clipboardAutoclearSeconds: 30
          }
        });
      }
      return res.status(200).json({
        success: true,
        data: {
          biometricsEnabled: !!security.biometrics_enabled,
          autoLockDuration: security.auto_lock_duration || '5',
          privacyModeEnabled: !!security.privacy_mode_enabled,
          screenshotProtectionEnabled: !!security.screenshot_protection_enabled,
          clipboardAutoclearSeconds: security.clipboard_autoclear_seconds || 30
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve security settings' });
    }
  };

  public updateSecuritySettings = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const { biometricsEnabled, autoLockDuration, privacyModeEnabled, screenshotProtectionEnabled, clipboardAutoclearSeconds } = req.body;
      let security = this.db.findOne<any>('wallet_security', s => s.wallet_id === user.walletId);
      if (!security) {
        security = this.db.insert<any>('wallet_security', {
          wallet_id: user.walletId,
          passcode_hash: '$2b$10$U6Uv6D.uSNoWp6qU8bC/NuQJ43uT5oA/G8p17X7K2vUfOsn2vH1.y',
          failed_attempts: 0,
          locked_until: null
        });
      }

      const updates: any = {};
      if (biometricsEnabled !== undefined) updates.biometrics_enabled = !!biometricsEnabled;
      if (autoLockDuration !== undefined) updates.auto_lock_duration = autoLockDuration;
      if (privacyModeEnabled !== undefined) updates.privacy_mode_enabled = !!privacyModeEnabled;
      if (screenshotProtectionEnabled !== undefined) updates.screenshot_protection_enabled = !!screenshotProtectionEnabled;
      if (clipboardAutoclearSeconds !== undefined) updates.clipboard_autoclear_seconds = parseInt(clipboardAutoclearSeconds);

      this.db.update('wallet_security', security.id, updates);
      return res.status(200).json({ success: true, message: 'Security settings updated' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to update security settings' });
    }
  };

  public getLoginHistory = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const logs = this.db.findMany<any>('wallet_logs', l => l.actor_id === user.id);
      return res.status(200).json({
        success: true,
        data: logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20)
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve login history' });
    }
  };

  public logLogin = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const { deviceName, status, ipAddress } = req.body;
      this.db.insert<any>('wallet_logs', {
        actor_id: user.id,
        action: 'wallet_unlock',
        status: status || 'success',
        device: deviceName || 'Web Application',
        ip: ipAddress || req.ip || '127.0.0.1',
        created_at: new Date().toISOString()
      });
      return res.status(200).json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ success: false });
    }
  };

  public getTrustedDevices = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      let devices = this.db.findMany<any>('devices', d => d.user_id === user.id);
      if (devices.length === 0) {
        const current = this.db.insert<any>('devices', {
          user_id: user.id,
          device_name: 'Current Browser Session',
          user_agent: req.headers['user-agent'] || 'Unknown Browser',
          ip_address: req.ip || '127.0.0.1',
          is_trusted: true,
          last_active_at: new Date().toISOString()
        });
        devices = [current];
      }
      return res.status(200).json({ success: true, data: devices });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve trusted devices' });
    }
  };

  public deleteTrustedDevice = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const deviceId = parseInt(req.params.id);
      const device = this.db.findOne<any>('devices', d => d.id === deviceId && d.user_id === user.id);
      if (!device) {
        return res.status(404).json({ success: false, message: 'Device not found' });
      }
      this.db.delete('devices', device.id);
      return res.status(200).json({ success: true, message: 'Device removed from trusted list' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to remove trusted device' });
    }
  };

  public exportBackup = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ success: false, message: 'Encryption password is required' });
      }

      const wallets = this.db.findMany<any>('wallets', w => w.user_id === user.id);
      const backupData = wallets.map(w => ({
        address: w.address,
        privateKey: decrypt(w.encrypted_private_key),
        seedPhrase: w.encrypted_seed ? decrypt(w.encrypted_seed) : null,
        name: w.name,
        color: w.color,
        icon: w.icon
      }));

      const jsonStr = JSON.stringify(backupData);
      const encryptedBackup = encryptWithPassword(jsonStr, password);

      return res.status(200).json({
        success: true,
        data: {
          backupString: encryptedBackup
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to export encrypted backup' });
    }
  };

  public importBackup = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const { backupString, password } = req.body;
      if (!backupString || !password) {
        return res.status(400).json({ success: false, message: 'Backup data and password are required' });
      }

      let decryptedStr;
      try {
        decryptedStr = decryptWithPassword(backupString, password);
      } catch (err) {
        return res.status(400).json({ success: false, message: 'Incorrect password or corrupted backup data' });
      }

      const backupData = JSON.parse(decryptedStr);
      if (!Array.isArray(backupData)) {
        return res.status(400).json({ success: false, message: 'Invalid backup structure' });
      }

      const importedWallets = [];
      for (const item of backupData) {
        if (!item.address || !item.privateKey) continue;

        const existing = this.db.findOne<any>('wallets', w => w.user_id === user.id && w.address === item.address);
        if (existing) continue;

        const encryptedSeed = item.seedPhrase ? encrypt(item.seedPhrase) : null;
        const encryptedPrivateKey = encrypt(item.privateKey);

        const wallet = this.db.insert<any>('wallets', {
          user_id: user.id,
          address: item.address,
          encrypted_seed: encryptedSeed,
          encrypted_private_key: encryptedPrivateKey,
          name: item.name || 'Restored Wallet',
          color: item.color || '#ef4444',
          icon: item.icon || 'wallet',
          backup_confirmed: true
        });

        const primaryWallet = this.db.findOne<any>('wallets', w => w.user_id === user.id && w.id !== wallet.id);
        if (primaryWallet) {
          const primarySecurity = this.db.findOne<any>('wallet_security', s => s.wallet_id === primaryWallet.id);
          if (primarySecurity) {
            this.db.insert<any>('wallet_security', {
              wallet_id: wallet.id,
              passcode_hash: primarySecurity.passcode_hash,
              failed_attempts: 0,
              locked_until: null,
              biometrics_enabled: primarySecurity.biometrics_enabled || false,
              auto_lock_duration: primarySecurity.auto_lock_duration || '5',
              privacy_mode_enabled: primarySecurity.privacy_mode_enabled || false,
              screenshot_protection_enabled: primarySecurity.screenshot_protection_enabled || false,
              clipboard_autoclear_seconds: primarySecurity.clipboard_autoclear_seconds || 30
            });
          }
        }

        const tokens = this.db.query<any>('tokens');
        for (const t of tokens) {
          this.db.insert<any>('balances', {
            wallet_id: wallet.id,
            token_id: t.id,
            balance: 0.0
          });
        }

        importedWallets.push(wallet);
      }

      this.db.insert<any>('notifications', {
        user_id: user.id,
        title: 'Wallets Imported from Backup',
        message: `Successfully restored ${importedWallets.length} wallets from your secure backup file.`,
        created_at: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        message: `Successfully restored ${importedWallets.length} wallets from your secure backup file.`,
        data: {
          importedCount: importedWallets.length
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to import backup' });
    }
  };
}

function encryptWithPassword(text: string, key: string): string {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', derivedKey, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
}

function decryptWithPassword(encryptedText: string, key: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error('Invalid backup format');
  const salt = Buffer.from(parts[0], 'hex');
  const iv = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

let globalMarketCache: { timestamp: number; data: any } | null = null;

