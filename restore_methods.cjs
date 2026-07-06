const fs = require('fs');

const methods = `
  public listWallets = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const wallets = await this.db.findMany<any>('wallets', { user_id: req.user!.id });
      return res.status(200).json({ success: true, data: wallets });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public createWallet = async (req: AuthenticatedRequest, res: Response) => {
    // Implemented in auth.controller? Wait, auth.controller handles initial wallet.
    try {
      const { name } = req.body;
      const { address, privateKey, seedPhrase } = await this.tronService.generateWallet();
      
      const { encrypt } = await import('../utils/crypto');
      const encryptedSeed = encrypt(seedPhrase);
      const encryptedPk = encrypt(privateKey);

      const wallet = await this.db.insert<any>('wallets', {
        user_id: req.user!.id,
        address: address,
        encrypted_seed_phrase: encryptedSeed,
        encrypted_private_key: encryptedPk,
        name: name || 'New Wallet'
      });

      const visibleTokens = await this.db.findMany<any>('tokens', t => t.is_visible && t.is_active);
      for (const token of visibleTokens) {
        await this.db.insert<any>('balances', {
          wallet_id: wallet.id,
          token_id: token.id,
          balance: 0.0
        });
      }

      return res.status(200).json({ success: true, data: wallet });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public importWalletEndpoint = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { seedPhrase, name } = req.body;
      const { address, privateKey } = await this.tronService.importWallet(seedPhrase);

      const { encrypt } = await import('../utils/crypto');
      const encryptedSeed = encrypt(seedPhrase);
      const encryptedPk = encrypt(privateKey);

      const wallet = await this.db.insert<any>('wallets', {
        user_id: req.user!.id,
        address: address,
        encrypted_seed_phrase: encryptedSeed,
        encrypted_private_key: encryptedPk,
        name: name || 'Imported Wallet'
      });

      const visibleTokens = await this.db.findMany<any>('tokens', t => t.is_visible && t.is_active);
      for (const token of visibleTokens) {
        await this.db.insert<any>('balances', {
          wallet_id: wallet.id,
          token_id: token.id,
          balance: 0.0
        });
      }

      return res.status(200).json({ success: true, data: wallet });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public renameWallet = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletId, name } = req.body;
      await this.db.update<any>('wallets', walletId, { name });
      return res.status(200).json({ success: true });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public customizeWallet = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletId, color, icon } = req.body;
      await this.db.update<any>('wallets', walletId, { color, icon });
      return res.status(200).json({ success: true });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public switchWallet = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletId } = req.body;
      // In JWT context, switching wallet means giving a new JWT with that wallet ID
      const wallet = await this.db.findById<any>('wallets', walletId);
      if(!wallet || wallet.user_id !== req.user!.id) return res.status(403).json({ success: false });
      
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { id: req.user!.id, walletId: wallet.id, address: wallet.address },
        process.env.JWT_SECRET || 'fallback_secret',
        { expiresIn: '15m' }
      );
      return res.status(200).json({ success: true, token });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public deleteWallet = async (req: AuthenticatedRequest, res: Response) => {
    try {
      await this.db.delete('wallets', req.params.id);
      return res.status(200).json({ success: true });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public confirmBackup = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletId } = req.body;
      await this.db.update<any>('wallets', walletId, { backup_confirmed: true });
      return res.status(200).json({ success: true });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public deleteNotification = async (req: AuthenticatedRequest, res: Response) => {
    try {
      await this.db.delete('notifications', req.params.id);
      return res.status(200).json({ success: true });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };

  public readSingleNotification = async (req: AuthenticatedRequest, res: Response) => {
    try {
      await this.db.update<any>('notifications', req.params.id, { is_read: true });
      return res.status(200).json({ success: true });
    } catch(e: any) { return res.status(500).json({ success: false }); }
  };
`;

let code = fs.readFileSync('backend/src/controllers/wallet.controller.ts', 'utf8');

const marker = 'public getSecuritySettings = async';
const markerIndex = code.indexOf(marker);

const before = code.substring(0, markerIndex);
const after = code.substring(markerIndex);

fs.writeFileSync('backend/src/controllers/wallet.controller.ts', before + methods + after);

