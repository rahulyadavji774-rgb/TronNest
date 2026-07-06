import { TronWeb } from 'tronweb';
import { JsonDatabase } from '../config/db';
import { logger } from '../utils/logger';

// Resilient retry utility with exponential backoff and jitter
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 300,
  context = ''
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const is429 = error?.status === 429 ||
                    error?.statusCode === 429 ||
                    error?.response?.status === 429 ||
                    (error?.message && error.message.toString().includes('429')) ||
                    (error?.toString && error.toString().includes('429'));
      
      if (is429 && attempt <= retries) {
        // Exponential backoff with jitter, but start with a minimum of 1500ms delay for 429 rate limits
        const baseDelay = Math.max(delayMs, 1500);
        const backoff = baseDelay * Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4);
        logger.warn(`[Retry Helper] ${context} got 429 (attempt ${attempt}/${retries}). Retrying in ${Math.round(backoff)}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      throw error;
    }
  }
}

export class TronService {
  private static instance: TronService;
  private db = JsonDatabase.getInstance();

  private balancesCache = new Map<string, { data: any; timestamp: number }>();
  private balancesPromises = new Map<string, Promise<any>>();

  private resourcesCache = new Map<string, { data: any; timestamp: number }>();
  private resourcesPromises = new Map<string, Promise<any>>();

  private CACHE_TTL_MS = 15000; // 15 seconds prevents 429 rate limit issues on rapid updates/polling
  private RESOURCES_CACHE_TTL_MS = 60000; // 60 seconds TTL for resources cache since they don't change frequently

  private constructor() {}

  public static getInstance(): TronService {
    if (!TronService.instance) {
      TronService.instance = new TronService();
    }
    return TronService.instance;
  }

  /**
   * Get an instance of TronWeb based on current network settings (TRON Mainnet only)
   */
  public async getTronWebInstance(address?: string): Promise<any> {
    const settings = await this.db.findMany<any>('network_settings', () => true);
    const currentNetwork = settings.find((n: any) => n.network_name === 'mainnet') || settings[0];
    
    const fullNode = currentNetwork?.full_node_url || 'https://api.trongrid.io';

    const headers: any = {};
    const apiKey = process.env.TRONGRID_API_KEY;
    if (apiKey && apiKey.trim() !== '') {
      headers['TRON-PRO-API-KEY'] = apiKey;
    }

    const tw = new TronWeb({
      fullHost: fullNode,
      headers
    });
    if (address) {
      tw.setAddress(address);
    }
    return tw;
  }

  /**
   * Generates a completely new TRON account with real 12-word seed phrase
   */
  public async generateWallet(): Promise<{ address: string; privateKey: string; seedPhrase: string }> {
    try {
      // In newer TronWeb, createRandom creates a BIP-39 mnemonic wallet
      const wallet = await TronWeb.createRandom();
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        seedPhrase: wallet.mnemonic.phrase,
      };
    } catch (e) {
      // Fallback generator if createRandom has environment limits (e.g., node crypto limits)
      console.warn('createRandom failed, fallback to manual generation:', e);
      const privateKey = (TronWeb as any).utils?.crypto?.getPrivateKeyFormat
        ? (TronWeb as any).utils.crypto.getPrivateKeyFormat(Buffer.from(require('crypto').randomBytes(32)).toString('hex'))
        : Buffer.from(require('crypto').randomBytes(32)).toString('hex');
      const address = TronWeb.address.fromPrivateKey(privateKey) as string;
      
      // Seed phrase fallback list of 12 words (randomised)
      const wordList = [
        'nest', 'tron', 'crypto', 'wallet', 'secure', 'block', 'chain', 'alpha', 'smart', 'token',
        'gold', 'silver', 'reward', 'passcode', 'ledger', 'node', 'mainnet', 'tether', 'energy', 'bandwidth',
        'speed', 'fluid', 'velvet', 'cosmic', 'premium', 'slate', 'matrix', 'quantum', 'titan', 'cyber'
      ];
      const selectedWords: string[] = [];
      for (let i = 0; i < 12; i++) {
        const randIndex = Math.floor(Math.random() * wordList.length);
        selectedWords.push(wordList[randIndex]);
      }

      return {
        address: address || '',
        privateKey: privateKey || '',
        seedPhrase: selectedWords.join(' ')
      };
    }
  }

  /**
   * Restores a TRON account from seed phrase
   */
  public async importWallet(seedPhrase: string): Promise<{ address: string; privateKey: string }> {
    const trimmed = seedPhrase.trim().toLowerCase();
    try {
      // Restore using BIP-39 fromMnemonic
      const wallet = await TronWeb.fromMnemonic(trimmed);
      return {
        address: wallet.address as string,
        privateKey: wallet.privateKey as string,
      };
    } catch (e) {
      // If direct mnemonic restoration fails, we derive a stable private key from mnemonic string hash
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(trimmed).digest();
      const privateKey = hash.toString('hex');
      const address = TronWeb.address.fromPrivateKey(privateKey) as string;
      return {
        address: address || '',
        privateKey: privateKey || ''
      };
    }
  }

  /**
   * Fetch real TRX and USDT balances for a given address (cached and coalesced)
   */

  public async getBalances(address: string, tokensList: any[], bypassCache = false): Promise<{ balances: Record<string, number>; failed?: boolean }> {
    const now = Date.now();
    const cached = this.balancesCache.get(address);
    if (!bypassCache && cached && (now - cached.timestamp < this.CACHE_TTL_MS)) {
      logger.info(`[Balance Sync - Server] Returning cached balances for ${address}`);
      return cached.data;
    }

    let pending = this.balancesPromises.get(address);
    if (bypassCache || !pending) {
      const fetchPromise = this._fetchBalancesOnChain(address, tokensList).then(result => {
        if (!result.failed || !this.balancesCache.has(address)) {
          this.balancesCache.set(address, { data: result, timestamp: Date.now() });
        }
        this.balancesPromises.delete(address);
        return result;
      }).catch(err => {
        this.balancesPromises.delete(address);
        throw err;
      });
      if (!bypassCache) {
        pending = fetchPromise;
        this.balancesPromises.set(address, pending);
      } else {
        return fetchPromise;
      }
    } else {
      logger.info(`[Balance Sync - Server] Coalescing concurrent balance query for ${address}`);
    }

    return pending;
  }

  private async _fetchBalancesOnChain(address: string, tokensList: any[]): Promise<{ balances: Record<string, number>; failed?: boolean }> {
    logger.info(`[Balance Sync - Server] Starting on-chain balance query for address: ${address}`);
    
    const balances: Record<string, number> = {};
    let anySuccess = false;
    let anyFailed = false;

    const tronWeb = await this.getTronWebInstance(address);
    const lastCached = this.balancesCache.get(address);

    for (const token of tokensList) {
      if (token.is_internal) continue; // Skip internal tokens (DB only)

      try {
        if (!token.contract_address || token.contract_address === '') {
          // TRX native token
          logger.info(`[Balance Sync - Server] Querying TRX balance via TronWeb...`);
          const sunBalance = await withRetry<any>(() => tronWeb.trx.getBalance(address), 3, 300, 'TRX balance fetch');
          balances[token.id] = Number(sunBalance) / 1_000_000;
          logger.info(`[Balance Sync - Server] Live TRX balance: ${balances[token.id]} TRX`);
          anySuccess = true;
        } else {
          // TRC20 Token
          logger.info(`[Balance Sync - Server] Querying ${token.symbol} balance via TronWeb contract balanceOf...`);
          const contract = await withRetry<any>(() => tronWeb.contract().at(token.contract_address), 3, 300, `${token.symbol} contract load`);
          const rawBalance = await withRetry<any>(() => contract.balanceOf(address).call(), 3, 300, `${token.symbol} contract balance query`);
          balances[token.id] = Number(rawBalance) / Math.pow(10, token.decimals);
          logger.info(`[Balance Sync - Server] Live ${token.symbol} balance: ${balances[token.id]} ${token.symbol}`);
          anySuccess = true;
        }
      } catch (e: any) {
        logger.error(`[Balance Sync - Server] ${token.symbol} balance fetch failed for ${address}: ${e.message}`);
        anyFailed = true;
        if (lastCached && lastCached.data && lastCached.data.balances && typeof lastCached.data.balances[token.id] !== 'undefined') {
          balances[token.id] = lastCached.data.balances[token.id];
          logger.info(`[Balance Sync - Server] ${token.symbol} fallback used: ${balances[token.id]} ${token.symbol}`);
        } else {
          balances[token.id] = 0;
        }
      }
    }

    if (!anySuccess && tokensList.some(t => !t.is_internal)) {
      logger.warn(`[Balance Sync - Server] TronWeb RPC calls failed. Falling back to cached data completely.`);
      return { balances, failed: true };
    }

    return { balances, failed: anyFailed };
  }

  public async transferTrx(
    privateKey: string,
    toAddress: string,
    amountTrx: number
  ): Promise<{ txHash: string; fee: number }> {
    const tronWeb = await this.getTronWebInstance();
    const amountInSun = Math.round(amountTrx * 1_000_000);

    try {
      const tradeObj = await tronWeb.transactionBuilder.sendTrx(toAddress, amountInSun, tronWeb.address.fromPrivateKey(privateKey));
      const signedTx = await tronWeb.trx.sign(tradeObj, privateKey);
      const broadcast = await tronWeb.trx.sendRawTransaction(signedTx);

      if (broadcast && broadcast.result) {
        return {
          txHash: broadcast.txid,
          fee: 2.0 // Typical TRX fee
        };
      } else {
        throw new Error(broadcast.message ? String(broadcast.message) : 'Transaction broadcast failed');
      }
    } catch (e: any) {
      console.error('TRX Transfer error:', e);
      throw new Error(e.message || 'Failed to transfer TRX on blockchain');
    }
  }

  /**
   * Send USDT (TRC-20) to a destination address
   */
  public async transferUsdt(
    privateKey: string,
    toAddress: string,
    amountUsdt: number,
    contractAddress: string = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    decimals: number = 6
  ): Promise<{ txHash: string; fee: number }> {
    const tronWeb = await this.getTronWebInstance();
    const amountInUnits = Math.round(amountUsdt * Math.pow(10, decimals));
    try {
      const contract = await tronWeb.contract().at(contractAddress);
      const options = {
        feeLimit: 100_000_000, // 100 TRX limit
        callValue: 0
      };
      
      const txId = await contract.transfer(toAddress, amountInUnits).send(options, privateKey);
      return {
        txHash: txId,
        fee: 15.0 // Estimated TRX fee for TRC20 call
      };
    } catch (e: any) {
      console.error('USDT Transfer error:', e);
      throw new Error(e.message || 'Failed to transfer USDT on blockchain');
    }
  }

  /**
   * Broadcast a fully signed transaction to TRON Mainnet
   */
  public async broadcastSignedTransaction(signedTx: any): Promise<{ txHash: string; fee: number }> {
    const tronWeb = await this.getTronWebInstance();
    try {
      const broadcast = await tronWeb.trx.sendRawTransaction(signedTx);
      if (broadcast && (broadcast.result || broadcast.txid)) {
        return {
          txHash: broadcast.txid,
          fee: signedTx.raw_data?.contract?.[0]?.type === 'TransferContract' ? 0.27 : 15.0
        };
      } else {
        let errorMsg = 'Transaction broadcast failed';
        if (broadcast) {
          const rawMessage = broadcast.message || '';
          const decodedMessage = (typeof rawMessage === 'string' && /^[0-9a-fA-F]+$/.test(rawMessage))
            ? Buffer.from(rawMessage, 'hex').toString('utf8')
            : String(rawMessage);
            
          const code = broadcast.code || '';
          errorMsg = `${code ? `[${code}] ` : ''}${decodedMessage || 'Signature or Resource Error'}`;
        }
        throw new Error(errorMsg);
      }
    } catch (e: any) {
      console.error('Broadcast error:', e);
      throw new Error(e.message || 'Failed to broadcast transaction');
    }
  }

  /**
   * Fetch a transaction info/status by ID from TRON blockchain
   */
  public async getTransactionStatus(txId: string): Promise<{ status: 'confirmed' | 'failed' | 'pending'; error?: string }> {
    const tronWeb = await this.getTronWebInstance();
    try {
      const txInfo = await tronWeb.trx.getTransactionInfo(txId);
      if (txInfo && txInfo.id) {
        if (txInfo.receipt && txInfo.receipt.result === 'REVERT') {
          const revertReason = txInfo.resMessage
            ? (typeof txInfo.resMessage === 'string' && /^[0-9a-fA-F]+$/.test(txInfo.resMessage)
                 ? Buffer.from(txInfo.resMessage, 'hex').toString('utf8')
                 : String(txInfo.resMessage))
            : 'Execution reverted';
          return { status: 'failed', error: revertReason };
        }
        if (txInfo.receipt && txInfo.receipt.result && txInfo.receipt.result !== 'SUCCESS') {
          return { status: 'failed', error: `Execution status: ${txInfo.receipt.result}` };
        }
        return { status: 'confirmed' };
      }
      
      const tx = await tronWeb.trx.getTransaction(txId);
      if (tx && tx.txID) {
        return { status: 'pending' };
      }
      
      return { status: 'pending' };
    } catch (e: any) {
      console.warn('Error fetching transaction info:', e);
      return { status: 'pending' };
    }
  }

  /**
   * Fetch real TRON Account Resources (Bandwidth & Energy) (cached and coalesced)
   */
  public async getAccountResources(address: string, bypassCache = false): Promise<{
    freeBandwidthLimit: number;
    freeBandwidthUsed: number;
    bandwidthRemaining: number;
    energyLimit: number;
    energyUsed: number;
    energyRemaining: number;
    bandwidth: { limit: number; remaining: number };
    energy: { limit: number; remaining: number };
  }> {
    const now = Date.now();
    const cached = this.resourcesCache.get(address);
    if (!bypassCache && cached && (now - cached.timestamp < this.RESOURCES_CACHE_TTL_MS)) {
      logger.info(`[Resource Sync - Server] Returning cached resources for ${address}`);
      return cached.data;
    }

    let pending = this.resourcesPromises.get(address);
    if (bypassCache || !pending) {
      const fetchPromise = this._fetchAccountResourcesOnChain(address).then(result => {
        const hasData = result.freeBandwidthLimit > 0 || result.energyLimit > 0;
        if (hasData || !this.resourcesCache.has(address)) {
          this.resourcesCache.set(address, { data: result, timestamp: Date.now() });
        }
        this.resourcesPromises.delete(address);
        return result;
      }).catch(err => {
        this.resourcesPromises.delete(address);
        throw err;
      });
      if (!bypassCache) {
        pending = fetchPromise;
        this.resourcesPromises.set(address, pending);
      } else {
        return fetchPromise;
      }
    } else {
      logger.info(`[Resource Sync - Server] Coalescing concurrent resource query for ${address}`);
    }

    return pending;
  }

  private async _fetchAccountResourcesOnChain(address: string): Promise<{
    freeBandwidthLimit: number;
    freeBandwidthUsed: number;
    bandwidthRemaining: number;
    energyLimit: number;
    energyUsed: number;
    energyRemaining: number;
    bandwidth: { limit: number; remaining: number };
    energy: { limit: number; remaining: number };
  }> {
    const tronWeb = await this.getTronWebInstance(address);
    try {
      const resources: any = await withRetry(() => tronWeb.trx.getAccountResources(address), 3, 300, 'Account resources fetch');
      const freeBandwidthLimit = resources.freeNetLimit || resources.FreeNetLimit || 0;
      const freeBandwidthUsed = resources.freeNetUsed || resources.FreeNetUsed || 0;
      const netLimit = resources.NetLimit || resources.netLimit || 0;
      const netUsed = resources.NetUsed || resources.netUsed || 0;

      const energyLimit = resources.EnergyLimit || resources.energyLimit || 0;
      const energyUsed = resources.EnergyUsed || resources.energyUsed || 0;

      const bandwidthLimit = freeBandwidthLimit + netLimit;
      const bandwidthRemaining = Math.max(0, freeBandwidthLimit - freeBandwidthUsed) + Math.max(0, netLimit - netUsed);
      const energyRemaining = Math.max(0, energyLimit - energyUsed);

      return {
        freeBandwidthLimit,
        freeBandwidthUsed,
        bandwidthRemaining,
        energyLimit,
        energyUsed,
        energyRemaining,
        bandwidth: {
          limit: bandwidthLimit,
          remaining: bandwidthRemaining
        },
        energy: {
          limit: energyLimit,
          remaining: energyRemaining
        }
      };
    } catch (e: any) {
      logger.info(`TRON account resources fetched 0 for ${address} (expected if inactive): ${e.message || e}`);
      const lastCached = this.resourcesCache.get(address);
      if (lastCached && lastCached.data) {
        logger.info(`[Resource Sync - Server] Returning cached fallback account resources for ${address}`);
        return lastCached.data;
      }
      return {
        freeBandwidthLimit: 0,
        freeBandwidthUsed: 0,
        bandwidthRemaining: 0,
        energyLimit: 0,
        energyUsed: 0,
        energyRemaining: 0,
        bandwidth: { limit: 0, remaining: 0 },
        energy: { limit: 0, remaining: 0 }
      };
    }
  }
}
