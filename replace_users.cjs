const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Ensure UserRepository is imported
  if (content.includes("'users'") && !content.includes('UserRepository')) {
    content = content.replace(/(import .* from '..\/config\/db';)/, "$1\nimport { UserRepository } from '../repositories/user.repository';");
    if (!content.includes('UserRepository')) {
       // if first regex failed
       content = `import { UserRepository } from '../repositories/user.repository';\n` + content;
    }
  }

  // Ensure userRepo is instantiated in class
  if (content.includes('class ') && content.includes("'users'") && !content.includes('private userRepo')) {
    content = content.replace(/(private db = JsonDatabase\.getInstance\(\);)/, "$1\n  private userRepo = UserRepository.getInstance();");
  }

  // In utils/security.ts or middleware
  if (!content.includes('class ') && content.includes("'users'") && !content.includes('const userRepo')) {
    content = content.replace(/(const db = JsonDatabase\.getInstance\(\);)/, "$1\n  const userRepo = UserRepository.getInstance();");
  }

  // Replace calls
  content = content.replace(/this\.db\.query(<any>)?\('users'\)/g, "this.userRepo.query()");
  content = content.replace(/this\.db\.findById(<any>)?\('users', (.*?)\)/g, "this.userRepo.findById($2)");
  content = content.replace(/this\.db\.findOne(<any>)?\('users', (.*?)\)/g, "this.userRepo.findOne($2)");
  content = content.replace(/this\.db\.findMany(<any>)?\('users', (.*?)\)/g, "this.userRepo.findMany($2)");
  content = content.replace(/this\.db\.insert(<any>)?\('users', (.*?)\)/g, "this.userRepo.insert($2)");
  content = content.replace(/this\.db\.update(<any>)?\('users', (.*?), (.*?)\)/g, "this.userRepo.update($2, $3)");
  content = content.replace(/this\.db\.delete(<any>)?\('users', (.*?)\)/g, "this.userRepo.delete($2)");

  // For functions without `this.`
  content = content.replace(/db\.query(<any>)?\('users'\)/g, "userRepo.query()");
  content = content.replace(/db\.findById(<any>)?\('users', (.*?)\)/g, "userRepo.findById($2)");
  content = content.replace(/db\.findOne(<any>)?\('users', (.*?)\)/g, "userRepo.findOne($2)");
  content = content.replace(/db\.findMany(<any>)?\('users', (.*?)\)/g, "userRepo.findMany($2)");
  content = content.replace(/db\.insert(<any>)?\('users', (.*?)\)/g, "userRepo.insert($2)");
  content = content.replace(/db\.update(<any>)?\('users', (.*?), (.*?)\)/g, "userRepo.update($2, $3)");
  content = content.replace(/db\.delete(<any>)?\('users', (.*?)\)/g, "userRepo.delete($2)");

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
