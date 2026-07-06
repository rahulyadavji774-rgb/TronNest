import jwt from 'jsonwebtoken';
import { Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { TronWeb } from 'tronweb';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { JsonDatabase } from '../config/db';
import { TronService, withRetry } from '../services/tron.service';
import { decrypt, encrypt } from '../utils/crypto';
import { logger } from '../utils/logger';
import { verifyPasscodeWithRateLimit } from '../utils/security';

export class WalletController {
  private db = JsonDatabase.getInstance();
  private tronService = TronService.getInstance();

  private historyCache = new Map<string, { data: any[]; timestamp: number }>();
  private historyPromises = new Map<string, Promise<any[]>>();
  private CACHE_TTL_MS = 15000; // 15 seconds to coalesce concurrent UI requests

  /**
   * Remove every cached balance after a successful transaction to prevent stale state
   */
  private async clearBlockchainCache(walletId: string) {
    try {
      const tokens = await this.db.findMany<any>('tokens', t => !t.is_internal);
      for (const token of tokens) {
        const balRecord = await this.db.findOne<any>('balances', { wallet_id: walletId, token_id: token.id });
        if (balRecord) {
          await this.db.delete('balances', balRecord.id);
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
      const wallet = await this.db.findById<any>('wallets', user.walletId);
      const activeAddress = wallet ? wallet.address : user.address;

      // Automatically fix any mismatch between user.address and wallet.address if different
      if (wallet && wallet.address !== user.address) {
        logger.warn(`[Address Mismatch Fix] user.address (${user.address}) != wallet.address (${wallet.address}). Syncing user.address to wallet.address.`);
        user.address = wallet.address;
        const dbUser = await this.db.findOne<any>('users', { id: user.id });
        if (dbUser && dbUser.address !== wallet.address) {
          // address removed from users update
        }
      }

      const bypassCache = req.query.refresh === 'true';

      // 1. Get real TRON Blockchain balances
      const dbTokens = await this.db.findMany<any>('tokens', t => t.is_visible && t.is_active);
      const liveBalances = await this.tronService.getBalances(activeAddress, dbTokens, bypassCache);
      logger.info(`[Portfolio API - Server] Live balances returned: ${Object.keys(liveBalances.balances).length} tokens, Failed=${liveBalances.failed}`);

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
          const prices = await this.db.query<any>('token_prices');
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
      const prices = await this.db.query<any>('token_prices');

      const portfolio: any[] = [];
      let totalValueUsd = 0;

      for (const token of dbTokens) {
        let balance = 0;
        let priceUsd = 0;

        if (token.symbol === 'TRX') {
          priceUsd = liveTrxPrice;
          const trxPriceObj = prices.find((p: any) => p.token_id === token.id);
          if (trxPriceObj) {
            await this.db.update<any>('token_prices', trxPriceObj.id, { price_usd: liveTrxPrice });
          }
        } else {
          const priceObj = prices.find((p: any) => p.token_id === token.id);
          priceUsd = priceObj ? parseFloat(priceObj.price_usd) : 0.0;
        }

        if (token.is_internal) {
          // Query internal balance from DB
          const balRecord = await this.db.findOne<any>('balances', { wallet_id: user.walletId, token_id: token.id });
          balance = balRecord ? parseFloat(balRecord.balance) : 0.0;
        } else {
          // Check if balance sync failed. If it failed, use previous cached balance!
          const balRecord = await this.db.findOne<any>('balances', { wallet_id: user.walletId, token_id: token.id });
          const cachedBalance = balRecord ? parseFloat(balRecord.balance) : 0.0;

          if (liveBalances.failed && typeof liveBalances.balances[token.id] === 'undefined') {
            // Keep previous successful blockchain data!
            balance = cachedBalance;
          } else {
            // Sync with live TRON chain
            balance = liveBalances.balances[token.id] || 0;

            // Update cache in DB
            if (balRecord) {
              await this.db.update<any>('balances', balRecord.id, { balance: balance });
            } else {
              await this.db.insert<any>('balances', { wallet_id: user.walletId, token_id: token.id, balance: balance });
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
    const { tokenId, recipientAddress, amount, passcode } = req.body;

    if (!tokenId || !recipientAddress || !amount || !passcode) {
      return res.status(400).json({ success: false, message: 'Recipient, amount, token ID, and passcode are required' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid transfer amount' });
    }

    try {
      // 1. Verify Passcode
      const verifyRes = await verifyPasscodeWithRateLimit(user.walletId, passcode);
      if (!verifyRes.success) {
        return res.status(verifyRes.status!).json({ success: false, message: verifyRes.message });
      }

      // 2. Fetch Token from DB
      const token = await this.db.findById<any>('tokens', tokenId);
      if (!token || !token.is_active) {
        return res.status(404).json({ success: false, message: `Token not found or deactivated` });
      }

      const tokenSymbol = token.symbol;

      if (!token.is_transfer_enabled) {
        return res.status(403).json({ success: false, message: `Transfers are currently disabled for ${tokenSymbol}` });
      }

      // 3. Perform transfer based on asset structure
      if (token.is_internal) {
        // --- INTERNAL LEDGER TRANSFER ---
        const recipientWallet = await this.db.findOne<any>('wallets', { address: recipientAddress });
        if (!recipientWallet) {
          return res.status(404).json({ success: false, message: 'Recipient wallet address does not exist in the database' });
        }

        if (recipientWallet.id === user.walletId) {
          return res.status(400).json({ success: false, message: 'Cannot transfer assets to your own address' });
        }

        const senderBalanceRecord = await this.db.findOne<any>('balances', { wallet_id: user.walletId, token_id: token.id });
        const senderBalance = senderBalanceRecord ? parseFloat(senderBalanceRecord.balance) : 0;

        if (senderBalanceRecord && senderBalanceRecord.is_frozen) {
          return res.status(403).json({ success: false, message: 'Your balance for this custom token has been frozen by administration.' });
        }

        if (senderBalance < numAmount) {
          return res.status(400).json({ success: false, message: 'Insufficient internal balance' });
        }

        const txHash = '0x' + crypto.randomBytes(32).toString('hex');

        await this.db.transaction(async (tx) => {
          // Deduct from sender
          await this.db.update<any>('balances', senderBalanceRecord.id, { balance: senderBalance - numAmount }, tx);

          // Add to recipient
          const recipientBalanceRecord = await this.db.findOne<any>('balances', { wallet_id: recipientWallet.id, token_id: token.id }, tx);
          if (recipientBalanceRecord) {
            const recipientBalance = parseFloat(recipientBalanceRecord.balance);
            await this.db.update<any>('balances', recipientBalanceRecord.id, { balance: recipientBalance + numAmount }, tx);
          } else {
            await this.db.insert<any>('balances', { wallet_id: recipientWallet.id, token_id: token.id, balance: numAmount }, tx);
          }
        });
        const blockHeight = Math.floor(Math.random() * 50000) + 1000000;
        const nonce = Math.floor(Math.random() * 100);
        const gasUsed = 289;

        // Insert into internal ledger
        const ledger = await this.db.insert<any>('internal_ledger', {
          from_wallet_id: user.walletId,
          to_wallet_id: recipientWallet.id,
          token_id: token.id,
          amount: numAmount,
          description: `Internal P2P transfer of ${numAmount} ${tokenSymbol}`,
          tx_hash: txHash,
          sender_wallet: user.address,
          receiver_wallet: recipientAddress,
          token_id_str: token.id,
          status: 'completed',
          block_height: blockHeight,
          nonce: nonce,
          gas_used: gasUsed,
          network: 'TronNest',
          created_at: new Date()
        });

        // Insert transaction histories
        const outHistory = await this.db.insert<any>('transaction_history', {
          wallet_id: user.walletId,
          type: 'internal',
          direction: 'out',
          asset_symbol: token.symbol,
          token_id: token.id,
          amount: numAmount,
          counterparty: recipientAddress,
          fee: 0,
          status: 'completed',
          internal_ledger_id: ledger.id,
          tx_hash: txHash,
          block_height: blockHeight,
          nonce: nonce,
          gas_used: gasUsed,
          network: 'TronNest',
          created_at: new Date()
        });

        const inHistory = await this.db.insert<any>('transaction_history', {
          wallet_id: recipientWallet.id,
          type: 'internal',
          direction: 'in',
          asset_symbol: token.symbol,
          token_id: token.id,
          amount: numAmount,
          counterparty: user.address,
          fee: 0,
          status: 'completed',
          internal_ledger_id: ledger.id,
          tx_hash: txHash,
          block_height: blockHeight,
          nonce: nonce,
          gas_used: gasUsed,
          network: 'TronNest',
          created_at: new Date()
        });

        // Add internal Notification for recipient
        await this.db.insert<any>('notifications', {
          user_id: recipientWallet.user_id,
          title: 'Tokens Received',
          message: `You received ${numAmount} ${tokenSymbol} from ${user.address.slice(0, 6)}...${user.address.slice(-4)}`
        });

        return res.status(200).json({
          success: true,
          message: `Successfully transferred ${numAmount} ${tokenSymbol} internally`,
          data: {
            txHash: txHash,
            internalLedgerId: ledger.id,
            historyId: outHistory.id
          }
        });
      } else {
        // --- REAL BLOCKCHAIN TRANSFER (TRON) ---
        // Fetch sender's encrypted private key
        const wallet = await this.db.findById<any>('wallets', user.walletId);
        if (!wallet) {
          return res.status(500).json({ success: false, message: 'Sender credentials unavailable' });
        }

        // Decrypt the private key securely on the fly
        const privateKey = decrypt(wallet.encrypted_private_key);

        let txResult;
        if (!token.contract_address || token.contract_address === '') {
          txResult = await this.tronService.transferTrx(privateKey, recipientAddress, numAmount);
        } else {
          txResult = await this.tronService.transferUsdt(privateKey, recipientAddress, numAmount, token.contract_address, token.decimals);
        }

        // Cache blockchain transaction record in DB
        const bcTx = await this.db.insert<any>('blockchain_transactions', {
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
        const history = await this.db.insert<any>('transaction_history', {
          wallet_id: user.walletId,
          type: 'blockchain',
          direction: 'out',
          asset_symbol: token.symbol,
          token_id: token.id,
          amount: numAmount,
          counterparty: recipientAddress,
          fee: txResult.fee,
          status: 'completed',
          tx_hash: txResult.txHash,
          blockchain_tx_id: bcTx.id
        });

        // If recipient is an internal wallet, generate a matching incoming transaction history for them too!
        const internalRecipient = await this.db.findOne<any>('wallets', { address: recipientAddress });
        if (internalRecipient) {
          await this.db.insert<any>('transaction_history', {
            wallet_id: internalRecipient.id,
            type: 'blockchain',
            direction: 'in',
            asset_symbol: token.symbol,
          token_id: token.id,
            amount: numAmount,
            counterparty: user.address,
            fee: 0,
            status: 'completed',
            tx_hash: txResult.txHash,
            blockchain_tx_id: bcTx.id
          });

          await this.db.insert<any>('notifications', {
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
      const wallet = await this.db.findById<any>('wallets', user.walletId);
      const activeAddress = wallet ? wallet.address : user.address;

      // 1. Get all transaction history currently in the local DB
      const localHistory = await this.db.findMany<any>('transaction_history', { wallet_id: user.walletId });

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
                throw new Error('External API Overloaded');
              }
              return res;
            }, 3, 300, 'TRX history fetch');
            const trxData = await trxResponse.json() as any;

            // Fetch TRC20 (USDT) transfers
            const trc20Url = `https://api.trongrid.io/v1/accounts/${activeAddress}/transactions/trc20?limit=25`;
            const trc20Response = await withRetry(async () => {
              const res = await fetch(trc20Url, { headers: fetchHeaders, signal: controller.signal });
              if (res.status === 429) {
                throw new Error('External API Overloaded');
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
              const tronWeb = await this.tronService.getTronWebInstance();
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
                        const createdAt = new Date(tx.block_timestamp || tx.raw_data.timestamp);

                        // Insert or update in local database to cache this transaction
                        const existing = await this.db.findOne<any>('transaction_history', { tx_hash: txId });
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
                          await this.db.insert<any>('transaction_history', txRecord);
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
                      const createdAt = new Date(tx.block_timestamp);

                      // Insert or update in local database to cache this transaction
                      const existing = await this.db.findOne<any>('transaction_history', { tx_hash: txId });
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
                        await this.db.insert<any>('transaction_history', txRecord);
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
      const notifications = await this.db.findMany<any>('notifications', { user_id: user.id });
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
      const notifications = await this.db.findMany<any>('notifications', { user_id: user.id, is_read: false });
      for (const n of notifications) {
        await this.db.update<any>('notifications', n.id, { is_read: true });
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
      const wallet = await this.db.findOne<any>('wallets', { id: user.walletId });
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
      const wallet = await this.db.findById<any>('wallets', user.walletId);
      const activeAddress = wallet ? wallet.address : user.address;
      const dbTokens = await this.db.findMany<any>('tokens', t => t.symbol === 'TRX');
      const liveBalances = await this.tronService.getBalances(activeAddress, dbTokens);
      return res.status(200).json({
        success: true,
        data: {
          address: activeAddress,
          symbol: 'TRX',
          balance: liveBalances.balances[dbTokens[0]?.id] || 0
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
      const wallet = await this.db.findById<any>('wallets', user.walletId);
      const activeAddress = wallet ? wallet.address : user.address;
      const dbTokens = await this.db.findMany<any>('tokens', t => t.symbol === 'USDT');
      const liveBalances = await this.tronService.getBalances(activeAddress, dbTokens);
      return res.status(200).json({
        success: true,
        data: {
          address: activeAddress,
          symbol: 'USDT',
          balance: liveBalances.balances[dbTokens[0]?.id] || 0
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
      const wallet = await this.db.findById<any>('wallets', user.walletId);
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
      const verifyRes = await verifyPasscodeWithRateLimit(user.walletId, passcode);
      if (!verifyRes.success) {
        return res.status(verifyRes.status!).json({ success: false, message: verifyRes.message });
      }

      const wallet = await this.db.findById<any>('wallets', user.walletId);
      if (!wallet) {
        return res.status(500).json({ success: false, message: 'Credentials unavailable' });
      }

      const privateKey = decrypt(wallet.encrypted_private_key);
      const txResult = await this.tronService.transferTrx(privateKey, recipientAddress, numAmount);

      const token = await this.db.findOne<any>('tokens', { symbol: 'TRX' });

      // Cache blockchain transaction record in DB
      const bcTx = await this.db.insert<any>('blockchain_transactions', {
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
      const history = await this.db.insert<any>('transaction_history', {
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
      const verifyRes = await verifyPasscodeWithRateLimit(user.walletId, passcode);
      if (!verifyRes.success) {
        return res.status(verifyRes.status!).json({ success: false, message: verifyRes.message });
      }

      const wallet = await this.db.findById<any>('wallets', user.walletId);
      if (!wallet) {
        return res.status(500).json({ success: false, message: 'Credentials unavailable' });
      }

      const privateKey = decrypt(wallet.encrypted_private_key);
      const txResult = await this.tronService.transferUsdt(privateKey, recipientAddress, numAmount);

      const token = await this.db.findOne<any>('tokens', { symbol: 'USDT' });

      // Cache blockchain transaction record in DB
      const bcTx = await this.db.insert<any>('blockchain_transactions', {
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
      const history = await this.db.insert<any>('transaction_history', {
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
    const { signedTx, passcode, recipientAddress, amount, tokenId } = req.body;

    if (!signedTx || !passcode || !recipientAddress || !amount || !tokenId) {
      return res.status(400).json({ success: false, message: 'Missing required parameters for broadcasting' });
    }

    const numAmount = parseFloat(amount);

    try {
      // Verify passcode
      const verifyRes = await verifyPasscodeWithRateLimit(user.walletId, passcode);
      if (!verifyRes.success) {
        return res.status(verifyRes.status!).json({ success: false, message: verifyRes.message });
      }

      // Broadcast using TronService
      const txResult = await this.tronService.broadcastSignedTransaction(signedTx);

      const token = await this.db.findById<any>('tokens', tokenId);
      const tokenSymbol = token ? token.symbol : (tokenId === 1 ? 'TRX' : 'USDT');

      // Cache blockchain transaction record in DB
      const bcTx = await this.db.insert<any>('blockchain_transactions', {
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
      const history = await this.db.insert<any>('transaction_history', {
        wallet_id: user.walletId,
        type: 'blockchain',
        direction: 'out',
        asset_symbol: token.symbol,
          token_id: token.id,
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
      const tronWeb = await this.tronService.getTronWebInstance();
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
        const bcTx = await this.db.findOne<any>('blockchain_transactions', { tx_hash: txId });
        if (bcTx) {
          await this.db.update<any>('blockchain_transactions', bcTx.id, {
            status: result.status === 'confirmed' ? 'confirmed' : 'failed'
          });
        }
        const hist = await this.db.findOne<any>('transaction_history', { tx_hash: txId });
        if (hist) {
          await this.db.update<any>('transaction_history', hist.id, {
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
   * Get transaction details by hash (supports future TronNestScan)
   */
  public getTransactionByHash = async (req: AuthenticatedRequest, res: Response) => {
    const { hash } = req.params;
    if (!hash) {
      return res.status(400).json({ success: false, message: 'Transaction hash is required' });
    }
    try {
      const tx = await this.db.findOne<any>('transaction_history', { tx_hash: hash });
      if (!tx) {
        return res.status(404).json({ success: false, message: 'Transaction not found' });
      }

      // If it's a TronNest transaction, let's augment it with all metadata
      if (tx.type === 'internal') {
        const ledger = await this.db.findOne<any>('internal_ledger', { tx_hash: hash });
        return res.status(200).json({
          success: true,
          data: {
            txHash: tx.tx_hash,
            sender_address: tx.direction === 'out' ? (await this.db.findById<any>('wallets', tx.wallet_id))?.address || tx.wallet_id : tx.counterparty,
            receiver_address: tx.direction === 'out' ? tx.counterparty : (await this.db.findById<any>('wallets', tx.wallet_id))?.address || tx.wallet_id,
            token: tx.asset_symbol,
            tokenId: ledger?.token_id || tx.token_id,
            amount: tx.amount,
            timestamp: tx.created_at || ledger?.created_at,
            status: tx.status || 'completed',
            blockHeight: tx.block_height || ledger?.block_height || 1024506,
            nonce: tx.nonce !== undefined ? tx.nonce : (ledger?.nonce !== undefined ? ledger.nonce : 12),
            gasUsed: tx.gas_used || ledger?.gas_used || 289,
            network: tx.network || ledger?.network || 'TronNest'
          }
        });
      }

      // If it is a blockchain transaction, return its standard details
      return res.status(200).json({
        success: true,
        data: {
          txHash: tx.tx_hash,
          sender_address: tx.direction === 'out' ? (await this.db.findById<any>('wallets', tx.wallet_id))?.address || tx.wallet_id : tx.counterparty,
          receiver_address: tx.direction === 'out' ? tx.counterparty : (await this.db.findById<any>('wallets', tx.wallet_id))?.address || tx.wallet_id,
          token: tx.asset_symbol,
          amount: tx.amount,
          timestamp: tx.created_at,
          status: tx.status || 'completed',
          network: 'TRON Mainnet'
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to retrieve transaction details' });
    }
  };

  /**
   * Get the decrypted private key and seed phrase for secure client-side storage
   */
  public getPrivateKey = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { passcode, walletId } = req.body;
    if (!passcode) {
      return res.status(400).json({ success: false, message: 'Passcode is required' });
    }
    try {
      const wId = walletId ? parseInt(walletId) : user.walletId;
      if (!wId) {
        return res.status(400).json({ success: false, message: 'Wallet ID is required' });
      }

      // Verify passcode using verifyPasscodeWithRateLimit
      const verifyRes = await verifyPasscodeWithRateLimit(user.id, passcode);
      if (!verifyRes.success) {
        return res.status(verifyRes.status || 401).json({ success: false, message: verifyRes.message || 'Incorrect PIN' });
      }

      const wallet = await this.db.findOne<any>('wallets', { id: wId, user_id: user.id });
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Wallet credentials unavailable' });
      }
      const privateKey = decrypt(wallet.encrypted_private_key);
      const seedPhrase = wallet.encrypted_seed_phrase ? decrypt(wallet.encrypted_seed_phrase) : null;
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
        lastUpdated: new Date(globalMarketCache.timestamp)
      });
    }

    try {
      const dbTokens = await this.db.findMany<any>('tokens', t => t.is_visible && t.is_active);
      const dbPrices = await this.db.query<any>('token_prices');
      const balances = await this.db.query<any>('balances');
      
      const marketData: any[] = [];
      const todayStr = new Date().toDateString();

      const seedRandomWalk = (endPrice: number, points: number, volatility: number, seedStr: string): number[] => {
        let seed = 0;
        for (let i = 0; i < seedStr.length; i++) {
          seed = (seed * 31 + seedStr.charCodeAt(i)) & 0xffffffff;
        }
        const random = () => {
          seed = (seed * 1103515245 + 12345) & 0xffffffff;
          return (seed >>> 16) / 32768 - 1;
        };
        const walk = new Array(points);
        walk[points - 1] = endPrice;
        for (let i = points - 2; i >= 0; i--) {
          const change = random() * volatility * walk[i + 1];
          walk[i] = walk[i + 1] - change;
        }
        return walk;
      };

      const seedHistory30d = (endPrice: number, points: number, volatility: number, seedStr: string) => {
        const prices = seedRandomWalk(endPrice, points, volatility, seedStr);
        const history = [];
        const today = new Date();
        for (let i = 0; i < points; i++) {
          const d = new Date();
          d.setDate(today.getDate() - (points - 1 - i));
          const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          history.push({ date: dateStr, price: prices[i] });
        }
        return history;
      };

      // Try CoinGecko mapping once for major tokens if we want, but let's keep it simple and dynamic
      let cgData: any = [];
      try {
        const getSignal = (timeoutMs: number) => {
          if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') {
            try { return (AbortSignal as any).timeout(timeoutMs); } catch (_) {}
          }
          return undefined;
        };
        // Just try fetching top markets
        const cgMarketsRes = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=tron,tether&order=market_cap_desc&per_page=10&page=1&sparkline=true', { signal: getSignal(3000) });
        cgData = await cgMarketsRes.json();
      } catch(e) {}

      for (const token of dbTokens) {
        let priceUsd = 0;
        let change24h = 0;
        let marketCap = 0;
        let volume24h = 0;
        let circulatingSupply = 0;
        let totalSupply = 0;
        let ath = 0;
        let atl = 0;
        let sparkline: number[] = [];
        let history30d: any[] = [];

        // Base price from DB
        const priceObj = dbPrices.find((p: any) => p.token_id === token.id);
        if (priceObj) priceUsd = parseFloat(priceObj.price_usd);
        else if (token.symbol === 'USDT' || token.symbol.includes('USD')) priceUsd = 1.0;
        else priceUsd = 0.1;

        // Try Coingecko overlay
        if (Array.isArray(cgData)) {
          let cgId = '';
          if (token.symbol === 'TRX') cgId = 'tron';
          if (token.symbol === 'USDT') cgId = 'tether';
          
          if (cgId) {
            const match = cgData.find(c => c.id === cgId);
            if (match) {
              priceUsd = match.current_price || priceUsd;
              change24h = match.price_change_percentage_24h || change24h;
              marketCap = match.market_cap || marketCap;
              volume24h = match.total_volume || volume24h;
              circulatingSupply = match.circulating_supply || circulatingSupply;
              totalSupply = match.total_supply || totalSupply;
              ath = match.ath || ath;
              atl = match.atl || atl;
              if (match.sparkline_in_7d && Array.isArray(match.sparkline_in_7d.price)) {
                sparkline = match.sparkline_in_7d.price;
              }
            }
          }
        }

        // Calculate supply for internal tokens
        if (token.is_internal) {
          circulatingSupply = balances
            .filter((b: any) => b.token_id === token.id)
            .reduce((sum: number, b: any) => sum + parseFloat(b.balance || '0'), 0);
          totalSupply = circulatingSupply; // Simplification
        }

        // Generate synthetic data if missing
        if (sparkline.length === 0) sparkline = seedRandomWalk(priceUsd, 24, 0.015, `${token.symbol}_spark_${todayStr}`);
        if (history30d.length === 0) history30d = seedHistory30d(priceUsd, 30, 0.02, `${token.symbol}_hist_${todayStr}`);

        // Update price in DB
        if (priceObj && priceObj.price_usd !== priceUsd) {
           await this.db.update<any>('token_prices', priceObj.id, { price_usd: priceUsd, updated_at: new Date() });
        } else if (!priceObj) {
           await this.db.insert<any>('token_prices', { token_id: token.id, price_usd: priceUsd });
        }

        marketData.push({
          id: token.id,
          name: token.name,
          symbol: token.symbol,
          logoUrl: token.logo_url,
          priceUsd,
          change24h,
          marketCap,
          volume24h,
          circulatingSupply,
          totalSupply,
          ath,
          atl,
          sparkline,
          history30d,
          isInternal: token.is_internal
        });
      }

      globalMarketCache = { timestamp: now, data: marketData };

      return res.status(200).json({
        success: true,
        data: marketData,
        cached: false,
        lastUpdated: new Date(now)
      });
    } catch (e: any) {
      logger.error('Fetch market data error:', e.message);
      return res.status(500).json({ success: false, message: 'Failed to retrieve market data' });
    }
  };

  
  public listWallets = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const wallets = await this.db.findMany<any>('wallets', { user_id: req.user!.id });
      return res.status(200).json({ success: true, data: wallets });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public createWallet = async (req: AuthenticatedRequest, res: Response) => {
    // Implemented in auth.controller? Wait, auth.controller handles initial wallet.
    try {
      const { name } = req.body;
      const { address, privateKey, seedPhrase } = await this.tronService.generateWallet();
      
      const { encrypt } = await import('../utils/crypto');
      const encryptedSeed = encrypt(seedPhrase);
      const encryptedPk = encrypt(privateKey);

      const wallet = await this.db.insert<any>('wallets', {
        user_id: req.user!.id,
        address: address,
        encrypted_seed_phrase: encryptedSeed,
        encrypted_private_key: encryptedPk,
        name: name || 'New Wallet'
      });

      const visibleTokens = await this.db.findMany<any>('tokens', t => t.is_visible && t.is_active);
      for (const token of visibleTokens) {
        await this.db.insert<any>('balances', {
          wallet_id: wallet.id,
          token_id: token.id,
          balance: 0.0
        });
      }

      return res.status(200).json({ success: true, data: wallet });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public importWalletEndpoint = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { seedPhrase, name } = req.body;
      const { address, privateKey } = await this.tronService.importWallet(seedPhrase);

      const { encrypt } = await import('../utils/crypto');
      const encryptedSeed = encrypt(seedPhrase);
      const encryptedPk = encrypt(privateKey);

      const wallet = await this.db.insert<any>('wallets', {
        user_id: req.user!.id,
        address: address,
        encrypted_seed_phrase: encryptedSeed,
        encrypted_private_key: encryptedPk,
        name: name || 'Imported Wallet'
      });

      const visibleTokens = await this.db.findMany<any>('tokens', t => t.is_visible && t.is_active);
      for (const token of visibleTokens) {
        await this.db.insert<any>('balances', {
          wallet_id: wallet.id,
          token_id: token.id,
          balance: 0.0
        });
      }

      return res.status(200).json({ success: true, data: wallet });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public renameWallet = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletId, name } = req.body;
      await this.db.update<any>('wallets', walletId, { name });
      return res.status(200).json({ success: true });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public customizeWallet = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletId, color, icon } = req.body;
      await this.db.update<any>('wallets', walletId, { color, icon });
      return res.status(200).json({ success: true });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public switchWallet = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletId } = req.body;
      // In JWT context, switching wallet means giving a new JWT with that wallet ID
      const wallet = await this.db.findById<any>('wallets', walletId);
      if(!wallet || wallet.user_id !== req.user!.id) return res.status(403).json({ success: false });
      
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { id: req.user!.id, walletId: wallet.id, address: wallet.address },
        process.env.JWT_SECRET || 'fallback_secret',
        { expiresIn: '15m' }
      );
      return res.status(200).json({ success: true, token });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public deleteWallet = async (req: AuthenticatedRequest, res: Response) => {
    try {
      await this.db.delete('wallets', req.params.id);
      return res.status(200).json({ success: true });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public confirmBackup = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletId } = req.body;
      await this.db.update<any>('wallets', walletId, { backup_confirmed: true });
      return res.status(200).json({ success: true });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public deleteNotification = async (req: AuthenticatedRequest, res: Response) => {
    try {
      await this.db.delete('notifications', req.params.id);
      return res.status(200).json({ success: true });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public readSingleNotification = async (req: AuthenticatedRequest, res: Response) => {
    try {
      await this.db.update<any>('notifications', req.params.id, { is_read: true });
      return res.status(200).json({ success: true });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };
public getSecuritySettings = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const userObj = await this.db.findById<any>('users', user.id);
      if (!userObj) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      return res.status(200).json({
        success: true,
        data: {
          biometricsEnabled: !!userObj.biometrics_enabled,
          autoLockDuration: userObj.auto_lock_duration || '5',
          privacyModeEnabled: !!userObj.privacy_mode_enabled,
          screenshotProtectionEnabled: !!userObj.screenshot_protection_enabled,
          clipboardAutoclearSeconds: userObj.clipboard_autoclear_seconds || 30
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
      const userObj = await this.db.findById<any>('users', user.id);
      if (!userObj) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const updates: any = {};
      if (biometricsEnabled !== undefined) updates.biometrics_enabled = !!biometricsEnabled;
      if (autoLockDuration !== undefined) updates.auto_lock_duration = autoLockDuration;
      if (privacyModeEnabled !== undefined) updates.privacy_mode_enabled = !!privacyModeEnabled;
      if (screenshotProtectionEnabled !== undefined) updates.screenshot_protection_enabled = !!screenshotProtectionEnabled;
      if (clipboardAutoclearSeconds !== undefined) updates.clipboard_autoclear_seconds = parseInt(clipboardAutoclearSeconds);

      await this.db.update<any>('users', userObj.id, updates);
      return res.status(200).json({ success: true, message: 'Security settings updated' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to update security settings' });
    }
  };

  public getLoginHistory = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      const logs = await this.db.findMany<any>('wallet_logs', { actor_id: user.id });
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
      await this.db.insert<any>('wallet_logs', {
        actor_id: user.id,
        action: 'wallet_unlock',
        status: status || 'success',
        device: deviceName || 'Web Application',
        ip: ipAddress || req.ip || '127.0.0.1',
        created_at: new Date()
      });
      return res.status(200).json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ success: false });
    }
  };

  public getTrustedDevices = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    try {
      let devices = await this.db.findMany<any>('devices', { user_id: user.id });
      if (devices.length === 0) {
        const current = await this.db.insert<any>('devices', {
          user_id: user.id,
          device_name: 'Current Browser Session',
          user_agent: req.headers['user-agent'] || 'Unknown Browser',
          ip_address: req.ip || '127.0.0.1',
          is_trusted: true,
          last_active_at: new Date()
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
      const device = await this.db.findOne<any>('devices', { id: deviceId, user_id: user.id });
      if (!device) {
        return res.status(404).json({ success: false, message: 'Device not found' });
      }
      await this.db.delete('devices', device.id);
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

      const wallets = await this.db.findMany<any>('wallets', { user_id: user.id });
      const backupData = wallets.map(w => ({
        address: w.address,
        privateKey: decrypt(w.encrypted_private_key),
        seedPhrase: w.encrypted_seed_phrase ? decrypt(w.encrypted_seed_phrase) : null,
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

        const existing = await this.db.findOne<any>('wallets', { user_id: user.id, address: item.address });
        if (existing) continue;

        const encryptedSeed = item.seedPhrase ? encrypt(item.seedPhrase) : null;
        const encryptedPrivateKey = encrypt(item.privateKey);

        const wallet = await this.db.insert<any>('wallets', {
          user_id: user.id,
          address: item.address,
          encrypted_seed_phrase: encryptedSeed,
          encrypted_private_key: encryptedPrivateKey,
          name: item.name || 'Restored Wallet',
          color: item.color || '#ef4444',
          icon: item.icon || 'wallet',
          backup_confirmed: true
        });

        const tokens = await this.db.query<any>('tokens');
        for (const t of tokens) {
          await this.db.insert<any>('balances', {
            wallet_id: wallet.id,
            token_id: t.id,
            balance: 0.0
          });
        }

        importedWallets.push(wallet);
      }

      await this.db.insert<any>('notifications', {
        user_id: user.id,
        title: 'Wallets Imported from Backup',
        message: `Successfully restored ${importedWallets.length} wallets from your secure backup file.`,
        created_at: new Date()
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

export function clearMarketCache() { globalMarketCache = null; }
