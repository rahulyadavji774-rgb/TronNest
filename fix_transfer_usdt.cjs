const fs = require('fs');
let code = fs.readFileSync('backend/src/services/tron.service.ts', 'utf8');

code = code.replace(
  /public async transferUsdt\([\s\S]*?\): Promise<\{ txHash: string; fee: number \}> \{[\s\S]*?const contract = await tronWeb.contract\(\).at\(contractAddress\);/g,
  `public async transferUsdt(
    privateKey: string,
    toAddress: string,
    amountUsdt: number,
    contractAddress: string = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    decimals: number = 6
  ): Promise<{ txHash: string; fee: number }> {
    const tronWeb = await this.getTronWebInstance();
    const amountInUnits = Math.round(amountUsdt * Math.pow(10, decimals));
    try {
      const contract = await tronWeb.contract().at(contractAddress);`
);

fs.writeFileSync('backend/src/services/tron.service.ts', code);
