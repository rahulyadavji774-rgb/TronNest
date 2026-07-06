const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Since inserting and updating an object usually spans multiple lines, we can just replace the function call prefix.
  content = content.replace(/this\.db\.insert(?:<any>)?\(\s*'users'\s*,/g, "this.userRepo.insert(");
  content = content.replace(/this\.db\.update(?:<any>)?\(\s*'users'\s*,/g, "this.userRepo.update(");
  content = content.replace(/this\.db\.delete(?:<any>)?\(\s*'users'\s*,/g, "this.userRepo.delete(");
  
  content = content.replace(/db\.insert(?:<any>)?\(\s*'users'\s*,/g, "userRepo.insert(");
  content = content.replace(/db\.update(?:<any>)?\(\s*'users'\s*,/g, "userRepo.update(");
  content = content.replace(/db\.delete(?:<any>)?\(\s*'users'\s*,/g, "userRepo.delete(");

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${filePath}`);
  }
}

const files = [
  'backend/src/controllers/admin.controller.ts',
  'backend/src/controllers/wallet.controller.ts',
  'backend/src/controllers/auth.controller.ts',
  'backend/src/middleware/auth.middleware.ts',
  'backend/src/utils/security.ts'
];

files.forEach(processFile);
