const fs = require('fs');
let code = fs.readFileSync('backend/src/services/tron.service.ts', 'utf8');

// Replace getBalances signature
code = code.replace(
  /public async getBalances\(address: string, bypassCache = false\): Promise<\{ TRX: number; USDT: number; failed\?: boolean \}>/g,
  'public async getBalances(address: string, tokensList: any[], bypassCache = false): Promise<{ balances: Record<string, number>; failed?: boolean }>'
);

// Replace _fetchBalancesOnChain signature
code = code.replace(
  /private async _fetchBalancesOnChain\(address: string\): Promise<\{ TRX: number; USDT: number; failed\?: boolean \}>/g,
  'private async _fetchBalancesOnChain(address: string, tokensList: any[]): Promise<{ balances: Record<string, number>; failed?: boolean }>'
);

// Change how _fetchBalancesOnChain is called inside getBalances
code = code.replace(
  /this\._fetchBalancesOnChain\(address\)/g,
  'this._fetchBalancesOnChain(address, tokensList)'
);

fs.writeFileSync('backend/src/services/tron.service.ts', code);
