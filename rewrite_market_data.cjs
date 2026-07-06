const fs = require('fs');

let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

const getMarketDataStart = code.indexOf('public getMarketData = async (req: AuthenticatedRequest, res: Response) => {');
const nextMethodStart = code.indexOf('public getSecuritySettings = async (req: AuthenticatedRequest, res: Response) => {');

const newMarketData = `public getMarketData = async (req: AuthenticatedRequest, res: Response) => {
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
        if (sparkline.length === 0) sparkline = seedRandomWalk(priceUsd, 24, 0.015, \`\${token.symbol}_spark_\${todayStr}\`);
        if (history30d.length === 0) history30d = seedHistory30d(priceUsd, 30, 0.02, \`\${token.symbol}_hist_\${todayStr}\`);

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

  `;

const before = code.substring(0, getMarketDataStart);
const after = code.substring(nextMethodStart);

fs.writeFileSync('backend/src/controllers/wallet.controller.ts', before + newMarketData + after);
