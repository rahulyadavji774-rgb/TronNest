const fs = require('fs');
let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

const oldLogic = `        if (tokenSymbol === 'TRX') {
          txResult = await this.tronService.transferTrx(privateKey, recipientAddress, numAmount);
        } else if (tokenSymbol === 'USDT') {
          txResult = await this.tronService.transferUsdt(privateKey, recipientAddress, numAmount);
        } else {
          return res.status(400).json({ success: false, message: 'Unsupported blockchain token' });
        }`;

const newLogic = `        if (!token.contract_address || token.contract_address === '') {
          txResult = await this.tronService.transferTrx(privateKey, recipientAddress, numAmount);
        } else {
          txResult = await this.tronService.transferUsdt(privateKey, recipientAddress, numAmount, token.contract_address, token.decimals);
        }`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('backend/src/controllers/wallet.controller.ts', code);

// Now update TronService.ts transferUsdt -> transferTrc20
let tronCode = fs.readFileSync('backend/src/services/tron.service.ts', 'utf8');
tronCode = tronCode.replace(
  /public async transferUsdt\(privateKey: string, toAddress: string, amount: number\): Promise<\{ txHash: string; fee: number \}>/g,
  'public async transferUsdt(privateKey: string, toAddress: string, amount: number, contractAddress: string = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: number = 6): Promise<{ txHash: string; fee: number }>'
);
tronCode = tronCode.replace(
  /const usdtContractAddress = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';/g,
  'const usdtContractAddress = contractAddress;'
);
tronCode = tronCode.replace(
  /const amountInDecimals = amount \* 1_000_000;/g,
  'const amountInDecimals = amount * Math.pow(10, decimals);'
);

fs.writeFileSync('backend/src/services/tron.service.ts', tronCode);

