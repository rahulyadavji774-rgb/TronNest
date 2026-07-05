const fs = require('fs');

function rewriteFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace this.db.findOne<any>('table', x => x.a === b)
  // with this.db.findOne<any>('table', { a: b })
  // We need to handle `&&` as well.
  
  // A simple regex might be too brittle, let's use a regex with replacer function
  const regex = /this\.db\.find(One|Many)<[^>]+>\('([^']+)',\s*([a-zA-Z0-9_]+)\s*=>\s*([^)]+)\)/g;
  
  content = content.replace(regex, (match, type, table, varName, condition) => {
    // condition is like `w.id === walletId && w.user_id === user.id`
    // We want to turn it into `{ id: walletId, user_id: user.id }`
    
    // Check if there are complex conditions like `!n.is_read`
    if (condition.includes('!n.is_read')) {
      return `this.db.find${type}('${table}', { user_id: user.id, is_read: false })`;
    }
    if (condition.includes('w.id !== walletToDelete.id')) {
        // Special case, leave it alone or handle it. Actually Drizzle supports `ne`.
        // Let's change the API to Drizzle's direct query format if possible.
        return match;
    }
    
    const parts = condition.split('&&').map(p => p.trim());
    let objParts = [];
    for (let part of parts) {
      const eqMatch = part.match(new RegExp(`^${varName}\\.([a-zA-Z0-9_]+)\\s*===\\s*(.+)$`));
      if (eqMatch) {
        objParts.push(`${eqMatch[1]}: ${eqMatch[2]}`);
      } else {
        // If we can't parse it, return original match (will not replace properly, but we can fix manually)
        console.log('Could not parse:', part, 'in', filePath);
        return match;
      }
    }
    
    return `this.db.find${type}('${table}', { ${objParts.join(', ')} })`;
  });

  fs.writeFileSync(filePath, content);
}

rewriteFile('backend/src/controllers/wallet.controller.ts');
rewriteFile('backend/src/controllers/auth.controller.ts');
rewriteFile('backend/src/utils/security.ts');
rewriteFile('backend/src/middleware/auth.middleware.ts');
