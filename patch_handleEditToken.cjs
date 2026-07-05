const fs = require('fs');
const file = 'src/components/AdminPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/setEditPrice\(String\(token\.priceUsd\)\);/, `setEditPrice(String(token.priceUsd));
    setEditBuyPrice(String(token.priceUsd * 1.05)); // mock values or whatever
    setEditSellPrice(String(token.priceUsd * 0.95));
    setEditAutoPrice(false);`);

fs.writeFileSync(file, code);
