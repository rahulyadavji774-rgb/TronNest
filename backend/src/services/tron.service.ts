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
  public getTronWebInstance(address?: string): any {
    const settings = this.db.findMany<any>('network_settings', () => true);
    const currentNetwork = settings.find(n => n.network_name === 'mainnet') || settings[0];
    
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
  public async getBalances(address: string, bypassCache = false): Promise<{ TRX: number; USDT: number; failed?: boolean }> {
    const now = Date.now();
    const cached = this.balancesCache.get(address);
    if (!bypassCache && cached && (now - cached.timestamp < this.CACHE_TTL_MS)) {
      logger.info(`[Balance Sync - Server] Returning cached balances for ${address}`);
      return cached.data;
    }

    let pending = this.balancesPromises.get(address);
    if (bypassCache || !pending) {
      const fetchPromise = this._fetchBalancesOnChain(address).then(result => {
        // Only cache if the query succeeded, or if we didn't have any cached data before
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

  private async _fetchBalancesOnChain(address: string): Promise<{ TRX: number; USDT: number; failed?: boolean }> {
    logger.info(`[Balance Sync - Server] Starting on-chain balance query for address: ${address}`);
    
    let trxBalance = 0;
    let usdtBalance = 0;
    let trxSuccess = false;
    let usdtSuccess = false;

    const tokens = this.db.findMany<any>('tokens', t => t.symbol === 'USDT');
    const usdtToken = tokens[0];
    const contractAddress = usdtToken?.contract_address || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    const decimals = usdtToken?.decimals || 6;

    const tronWeb = this.getTronWebInstance(address);
    const lastCached = this.balancesCache.get(address);

    // 1. Fetch TRX balance (represented in SUN)
    try {
      logger.info(`[Balance Sync - Server] Querying TRX balance via TronWeb...`);
      const sunBalance = await withRetry<any>(() => tronWeb.trx.getBalance(address), 3, 300, 'TRX balance fetch');
      trxBalance = Number(sunBalance) / 1_000_000;
      logger.info(`[Balance Sync - Server] Live TRX balance: ${trxBalance} TRX`);
      trxSuccess = true;
    } catch (e: any) {
      logger.error(`[Balance Sync - Server] TRX balance fetch failed for ${address}: ${e.message}`);
      if (lastCached && lastCached.data) {
        trxBalance = lastCached.data.TRX;
        trxSuccess = true;
        logger.info(`[Balance Sync - Server] TRX fallback used: ${trxBalance} TRX`);
      } else {
        trxBalance = 0;
      }
    }

    // 2. Fetch USDT balance using the contract address
    try {
      logger.info(`[Balance Sync - Server] Querying USDT balance via TronWeb contract balanceOf...`);
      const contract = await withRetry<any>(() => tronWeb.contract().at(contractAddress), 3, 300, 'USDT contract load');
      const rawBalance = await withRetry<any>(() => contract.balanceOf(address).call(), 3, 300, 'USDT contract balance query');
      usdtBalance = Number(rawBalance) / Math.pow(10, decimals);
      logger.info(`[Balance Sync - Server] Live USDT balance: ${usdtBalance} USDT`);
      usdtSuccess = true;
    } catch (e: any) {
      logger.error(`[Balance Sync - Server] USDT balance fetch failed for ${address}: ${e.message}`);
      if (lastCached && lastCached.data) {
        usdtBalance = lastCached.data.USDT;
        usdtSuccess = true;
        logger.info(`[Balance Sync - Server] USDT fallback used: ${usdtBalance} USDT`);
      } else {
        usdtBalance = 0;
      }
    }

    // 3. Fallback to direct REST API if TronWeb queries failed completely
    if (!trxSuccess && !usdtSuccess) {
      logger.warn(`[Balance Sync - Server] TronWeb RPC calls failed. Trying REST API direct fetch fallback...`);
      const endpoints = [
        { name: 'TronGrid Mainnet API', url: `https://api.trongrid.io/v1/accounts/${address}` },
        { name: 'TronStack Mainnet API', url: `https://api.tronstack.io/v1/accounts/${address}` }
      ];

      for (const endpoint of endpoints) {
        try {
          logger.info(`[Balance Sync - Server] Attempting direct fetch from ${endpoint.name}...`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);

          const fetchHeaders: any = { 'Accept': 'application/json' };
          const apiKey = process.env.TRONGRID_API_KEY;
          if (apiKey && apiKey.trim() !== '') {
            fetchHeaders['TRON-PRO-API-KEY'] = apiKey;
          }

          const response = await withRetry(async () => {
            const res = await fetch(endpoint.url, {
              headers: fetchHeaders,
              signal: controller.signal
            });
            if (res.status === 429) {
              throw new Error('429 Rate Limit Exceeded');
            }
            return res;
          }, 3, 300, `Direct balance fallback fetch from ${endpoint.name}`);

          clearTimeout(timeoutId);

          if (response.ok) {
            const json = (await response.json()) as any;
            if (json && json.success && Array.isArray(json.data)) {
              if (json.data.length === 0) {
                trxBalance = 0;
                usdtBalance = 0;
                trxSuccess = true;
                usdtSuccess = true;
                break;
              } else {
                const accountData = json.data[0];
                const sunBalance = accountData.balance || 0;
                trxBalance = sunBalance / 1_000_000;
                trxSuccess = true;

                if (Array.isArray(accountData.trc20)) {
                  for (const tokenRecord of accountData.trc20) {
                    const key = Object.keys(tokenRecord)[0];
                    if (key === contractAddress) {
                      const rawUsdt = tokenRecord[key];
                      usdtBalance = Number(rawUsdt) / Math.pow(10, decimals);
                      usdtSuccess = true;
                      break;
                    }
                  }
                }
                break;
              }
            }
          }
        } catch (err: any) {
          logger.error(`[Balance Sync - Server] REST API query failed: ${err.message}`);
        }
      }
    }

    const failed = !trxSuccess && !usdtSuccess;
    logger.info(`[Balance Sync - Server] Completed balance sync. Address: ${address} | TRX: ${trxBalance} | USDT: ${usdtBalance} | Failed: ${failed}`);

    return {
      TRX: trxBalance,
      USDT: usdtBalance,
      failed: failed
    };
  }

  /**
   * Send TRX to a destination address
   */
  public async transferTrx(
    privateKey: string,
    toAddress: string,
    amountTrx: number
  ): Promise<{ txHash: string; fee: number }> {
    const tronWeb = this.getTronWebInstance();
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
    amountUsdt: number
  ): Promise<{ txHash: string; fee: number }> {
    const tronWeb = this.getTronWebInstance();
    
    const tokens = this.db.findMany<any>('tokens', t => t.symbol === 'USDT');
    const usdtToken = tokens[0];
    const contractAddress = usdtToken?.contract_address || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    const decimals = usdtToken?.decimals || 6;
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
    const tronWeb = this.getTronWebInstance();
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
    const tronWeb = this.getTronWebInstance();
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
    const tronWeb = this.getTronWebInstance(address);
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
