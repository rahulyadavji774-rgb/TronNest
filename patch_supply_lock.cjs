const fs = require('fs');
const file = 'backend/src/controllers/admin.controller.ts';
let code = fs.readFileSync(file, 'utf8');

const additionalMethods = `
  public lockSupply = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      this.db.update('tokens', parseInt(tokenId), { supply_locked: true });
      this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: \`lock_supply: token_id=\${tokenId}\`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Token supply locked' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public unlockSupply = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      this.db.update('tokens', parseInt(tokenId), { supply_locked: false });
      this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: \`unlock_supply: token_id=\${tokenId}\`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Token supply unlocked' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };
`;

code = code.replace(/public deductTokens = async /, match => additionalMethods + '\n  ' + match);
fs.writeFileSync(file, code);
