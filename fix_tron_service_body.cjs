const fs = require('fs');

let code = fs.readFileSync('backend/src/services/tron.service.ts', 'utf8');

const replacement = `
  public async getBalances(address: string, tokensList: any[], bypassCache = false): Promise<{ balances: Record<string, number>; failed?: boolean }> {
    const now = Date.now();
    const cached = this.balancesCache.get(address);
    if (!bypassCache && cached && (now - cached.timestamp < this.CACHE_TTL_MS)) {
      logger.info(\`[Balance Sync - Server] Returning cached balances for \${address}\`);
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
      logger.info(\`[Balance Sync - Server] Coalescing concurrent balance query for \${address}\`);
    }

    return pending;
  }

  private async _fetchBalancesOnChain(address: string, tokensList: any[]): Promise<{ balances: Record<string, number>; failed?: boolean }> {
    logger.info(\`[Balance Sync - Server] Starting on-chain balance query for address: \${address}\`);
    
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
          logger.info(\`[Balance Sync - Server] Querying TRX balance via TronWeb...\`);
          const sunBalance = await withRetry<any>(() => tronWeb.trx.getBalance(address), 3, 300, 'TRX balance fetch');
          balances[token.id] = Number(sunBalance) / 1_000_000;
          logger.info(\`[Balance Sync - Server] Live TRX balance: \${balances[token.id]} TRX\`);
          anySuccess = true;
        } else {
          // TRC20 Token
          logger.info(\`[Balance Sync - Server] Querying \${token.symbol} balance via TronWeb contract balanceOf...\`);
          const contract = await withRetry<any>(() => tronWeb.contract().at(token.contract_address), 3, 300, \`\${token.symbol} contract load\`);
          const rawBalance = await withRetry<any>(() => contract.balanceOf(address).call(), 3, 300, \`\${token.symbol} contract balance query\`);
          balances[token.id] = Number(rawBalance) / Math.pow(10, token.decimals);
          logger.info(\`[Balance Sync - Server] Live \${token.symbol} balance: \${balances[token.id]} \${token.symbol}\`);
          anySuccess = true;
        }
      } catch (e: any) {
        logger.error(\`[Balance Sync - Server] \${token.symbol} balance fetch failed for \${address}: \${e.message}\`);
        anyFailed = true;
        if (lastCached && lastCached.data && lastCached.data.balances && typeof lastCached.data.balances[token.id] !== 'undefined') {
          balances[token.id] = lastCached.data.balances[token.id];
          logger.info(\`[Balance Sync - Server] \${token.symbol} fallback used: \${balances[token.id]} \${token.symbol}\`);
        } else {
          balances[token.id] = 0;
        }
      }
    }

    if (!anySuccess && tokensList.some(t => !t.is_internal)) {
      logger.warn(\`[Balance Sync - Server] TronWeb RPC calls failed. Falling back to cached data completely.\`);
      return { balances, failed: true };
    }

    return { balances, failed: anyFailed };
  }
`;

const lines = code.split('\n');
const getBalancesStart = lines.findIndex(l => l.includes('public async getBalances('));
const transferTrxStart = lines.findIndex(l => l.includes('public async transferTrx('));

const before = lines.slice(0, getBalancesStart).join('\n');
const after = lines.slice(transferTrxStart).join('\n');

fs.writeFileSync('backend/src/services/tron.service.ts', before + '\n' + replacement + '\n' + after);
