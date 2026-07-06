const fs = require('fs');
let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

code = code.replace(
  /const liveBalances = await this\.tronService\.getBalances\(activeAddress\);[\s\S]*?balance: liveBalances\.TRX/g,
  `const dbTokens = await this.db.findMany<any>('tokens', t => t.symbol === 'TRX');
      const liveBalances = await this.tronService.getBalances(activeAddress, dbTokens);
      return res.status(200).json({
        success: true,
        data: {
          address: activeAddress,
          symbol: 'TRX',
          balance: liveBalances.balances[dbTokens[0]?.id] || 0`
);

code = code.replace(
  /const liveBalances = await this\.tronService\.getBalances\(activeAddress\);[\s\S]*?balance: liveBalances\.USDT/g,
  `const dbTokens = await this.db.findMany<any>('tokens', t => t.symbol === 'USDT');
      const liveBalances = await this.tronService.getBalances(activeAddress, dbTokens);
      return res.status(200).json({
        success: true,
        data: {
          address: activeAddress,
          symbol: 'USDT',
          balance: liveBalances.balances[dbTokens[0]?.id] || 0`
);

fs.writeFileSync('backend/src/controllers/wallet.controller.ts', code);
