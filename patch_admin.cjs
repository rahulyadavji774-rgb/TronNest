const fs = require('fs');
const file = 'backend/src/controllers/admin.controller.ts';
let code = fs.readFileSync(file, 'utf8');

const suspendCode = `
  public suspendUserTransfers = async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.body;
    const admin = req.admin!;
    try {
      const user = this.db.findById<any>('users', parseInt(userId));
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      this.db.update('users', user.id, { transfers_suspended: true });

      this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: \`suspend_transfers: user_id=\${userId}\`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'User transfers suspended' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to suspend transfers' });
    }
  };

  public restoreUserTransfers = async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.body;
    const admin = req.admin!;
    try {
      const user = this.db.findById<any>('users', parseInt(userId));
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      this.db.update('users', user.id, { transfers_suspended: false });

      this.db.insert<any>('admin_logs', {
        admin_id: admin.id,
        action: \`restore_transfers: user_id=\${userId}\`,
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({ success: true, message: 'User transfers restored' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to restore transfers' });
    }
  };
`;

code = code.replace(/public unfreezeWallet = async .*?\n  };\n/s, match => match + suspendCode);
fs.writeFileSync(file, code);
