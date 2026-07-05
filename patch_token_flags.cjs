const fs = require('fs');
const file = 'backend/src/controllers/admin.controller.ts';
let code = fs.readFileSync(file, 'utf8');

const additionalMethods = `
  public enableTrading = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      this.db.update('tokens', parseInt(tokenId), { trading_enabled: true });
      this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: \`enable_trading: token_id=\${tokenId}\`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Trading enabled successfully' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public disableTrading = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      this.db.update('tokens', parseInt(tokenId), { trading_enabled: false });
      this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: \`disable_trading: token_id=\${tokenId}\`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Trading disabled successfully' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public enableDeposit = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      this.db.update('tokens', parseInt(tokenId), { deposit_enabled: true });
      this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: \`enable_deposit: token_id=\${tokenId}\`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Deposit enabled successfully' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public disableDeposit = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      this.db.update('tokens', parseInt(tokenId), { deposit_enabled: false });
      this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: \`disable_deposit: token_id=\${tokenId}\`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Deposit disabled successfully' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public enableWithdraw = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      this.db.update('tokens', parseInt(tokenId), { withdraw_enabled: true });
      this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: \`enable_withdraw: token_id=\${tokenId}\`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Withdraw enabled successfully' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };

  public disableWithdraw = async (req: AuthenticatedRequest, res: Response) => {
    const { tokenId } = req.body;
    try {
      this.db.update('tokens', parseInt(tokenId), { withdraw_enabled: false });
      this.db.insert<any>('admin_logs', { admin_id: req.admin!.id, action: \`disable_withdraw: token_id=\${tokenId}\`, ip_address: req.ip || '127.0.0.1' });
      return res.status(200).json({ success: true, message: 'Withdraw disabled successfully' });
    } catch (e: any) { return res.status(500).json({ success: false, message: 'Failed' }); }
  };
`;

code = code.replace(/public toggleTokenVisibility = async /, match => additionalMethods + '\n  ' + match);
fs.writeFileSync(file, code);
