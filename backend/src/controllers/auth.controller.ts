import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JsonDatabase } from '../config/db';
import { encrypt, decrypt } from '../utils/crypto';
import { TronService } from '../services/tron.service';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'TronNest_SuperSecureJWTSalt_2026';

export class AuthController {
  private db = JsonDatabase.getInstance();
  private tronService = TronService.getInstance();

  /**
   * Check if a TRON address exists/is registered in our database
   */
  public checkAddress = async (req: Request, res: Response) => {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ success: false, message: 'Address is required' });
    }
    try {
      const wallet = this.db.findOne<any>('wallets', w => w.address === address);
      return res.status(200).json({ success: true, isExistingUser: !!wallet });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to verify address registration' });
    }
  };

  /**
   * Generates a brand new TRON Wallet and Seed Phrase
   */
  public generateNewWalletAndMnemonic = async (req: Request, res: Response) => {
    try {
      const walletData = await this.tronService.generateWallet();
      
      // Calculate a unique sha256 hash of the seed phrase to detect duplicates
      const seedHash = crypto.createHash('sha256').update(walletData.seedPhrase.trim().toLowerCase()).digest('hex');
      
      const existingUser = this.db.findOne<any>('users', u => u.seed_phrase_hash === seedHash);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'This wallet seed phrase already exists in the system.'
        });
      }

      // Return the unencrypted credentials to the user ONLY ONCE
      return res.status(200).json({
        success: true,
        data: {
          address: walletData.address,
          seedPhrase: walletData.seedPhrase,
          privateKey: walletData.privateKey
        }
      });
    } catch (e: any) {
      logger.error('Wallet generation error:', { error: e.message });
      return res.status(500).json({ success: false, message: 'Failed to generate TRON wallet' });
    }
  };

  /**
   * Finalises wallet creation by setting the 6-digit passcode
   */
  public finalizeWalletSetup = async (req: Request, res: Response) => {
    const { address, seedPhrase, privateKey, passcode } = req.body;

    if (!address || !seedPhrase || !privateKey || !passcode) {
      return res.status(400).json({ success: false, message: 'Missing required wallet parameters' });
    }

    if (!/^\d{6}$/.test(passcode)) {
      return res.status(400).json({ success: false, message: 'Passcode must be exactly 6 numeric digits' });
    }

    try {
      const seedHash = crypto.createHash('sha256').update(seedPhrase.trim().toLowerCase()).digest('hex');

      // Create user entry
      const user = this.db.insert<any>('users', {
        seed_phrase_hash: seedHash,
        status: 'active'
      });

      // Encrypt sensitive fields
      const encryptedSeed = encrypt(seedPhrase.trim().toLowerCase());
      const encryptedPrivateKey = encrypt(privateKey);

      // Create wallet entry
      const wallet = this.db.insert<any>('wallets', {
        user_id: user.id,
        address: address,
        encrypted_seed: encryptedSeed,
        encrypted_private_key: encryptedPrivateKey
      });

      // Bcrypt hash the passcode
      const passcodeHash = await bcrypt.hash(passcode, 12);
      this.db.insert<any>('wallet_security', {
        wallet_id: wallet.id,
        passcode_hash: passcodeHash,
        failed_attempts: 0,
        locked_until: null
      });

      // Create initial balance records for TRX, USDT and default internal tokens (mUSD, GOLD)
      const tokens = this.db.query<any>('tokens');
      for (const token of tokens) {
        this.db.insert<any>('balances', {
          wallet_id: wallet.id,
          token_id: token.id,
          balance: 0.0
        });
      }

      // Generate session JWTs (Access & Refresh)
      const token = jwt.sign(
        { id: user.id, walletId: wallet.id, address: wallet.address },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      const refreshToken = jwt.sign(
        { id: user.id, walletId: wallet.id, address: wallet.address, isRefresh: true },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'Unknown Device';

      // Store session with device details and refresh token
      this.db.insert<any>('sessions', {
        user_id: user.id,
        token: token,
        refresh_token: refreshToken,
        ip_address: String(ipAddress),
        user_agent: String(userAgent),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });

      // Create audit log
      this.db.insert<any>('audit_logs', {
        actor_type: 'user',
        actor_id: user.id,
        action: 'wallet_created',
        details: { address: wallet.address },
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(201).json({
        success: true,
        message: 'Wallet secured and registered successfully',
        data: {
          token,
          refreshToken,
          user: {
            id: user.id,
            address: wallet.address
          }
        }
      });
    } catch (e: any) {
      logger.error('Finalize wallet setup error:', { error: e.message });
      return res.status(500).json({ success: false, message: 'Failed to secure and store wallet' });
    }
  };

  /**
   * Restores an existing wallet using a seed phrase
   */
  public importWallet = async (req: Request, res: Response) => {
    const { seedPhrase } = req.body;

    if (!seedPhrase) {
      return res.status(400).json({ success: false, message: 'Seed phrase is required for restoration' });
    }

    try {
      const normalizedSeed = seedPhrase.trim().toLowerCase();
      const seedHash = crypto.createHash('sha256').update(normalizedSeed).digest('hex');

      // Check if wallet exists in our DB
      const existingUser = this.db.findOne<any>('users', u => u.seed_phrase_hash === seedHash);
      if (existingUser) {
        const wallet = this.db.findOne<any>('wallets', w => w.user_id === existingUser.id);
        if (!wallet) {
          return res.status(404).json({ success: false, message: 'User exists but wallet structure is corrupted' });
        }

        // Return wallet address, requiring the user to verify/enter passcode to log in
        return res.status(200).json({
          success: true,
          message: 'Wallet found. Please enter passcode to confirm session restore.',
          data: {
            isExistingUser: true,
            address: wallet.address,
            userId: existingUser.id
          }
        });
      }

      // If it's a completely new wallet seed phrase import (external wallet)
      const importedCreds = await this.tronService.importWallet(normalizedSeed);

      return res.status(200).json({
        success: true,
        message: 'New seed phrase verified. Complete setup to security-lock your keypair.',
        data: {
          isExistingUser: false,
          address: importedCreds.address,
          privateKey: importedCreds.privateKey,
          seedPhrase: normalizedSeed
        }
      });
    } catch (e: any) {
      logger.error('Wallet restoration error:', { error: e.message });
      return res.status(500).json({ success: false, message: 'Failed to restore TRON wallet' });
    }
  };

  /**
   * Verify passcode for existing session restore
   */
  public verifyPasscodeAndLogin = async (req: Request, res: Response) => {
    const { address, passcode } = req.body;

    if (!address || !passcode) {
      return res.status(400).json({ success: false, message: 'Wallet address and passcode are required' });
    }

    try {
      const wallet = this.db.findOne<any>('wallets', w => w.address === address);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Wallet registration not found' });
      }

      const security = this.db.findOne<any>('wallet_security', s => s.wallet_id === wallet.id);
      if (!security) {
        return res.status(404).json({ success: false, message: 'Wallet security rules not set' });
      }

      // Check if locked
      if (security.locked_until && new Date(security.locked_until) > new Date()) {
        return res.status(403).json({
          success: false,
          message: `This account is locked due to multiple failed passcode attempts. Please try again after ${new Date(security.locked_until).toLocaleTimeString()}`
        });
      }

      // Verify passcode using bcrypt
      const isMatch = await bcrypt.compare(passcode, security.passcode_hash);
      if (!isMatch) {
        const failedAttempts = security.failed_attempts + 1;
        let lockedUntil = null;
        if (failedAttempts >= 5) {
          lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // lock for 15 minutes
        }
        
        this.db.update('wallet_security', security.id, {
          failed_attempts: failedAttempts,
          locked_until: lockedUntil
        });

        return res.status(401).json({
          success: false,
          message: failedAttempts >= 5 
            ? 'Account locked for 15 minutes due to 5 consecutive invalid attempts.'
            : `Invalid 6-digit passcode. ${5 - failedAttempts} attempts remaining.`
        });
      }

      // Clear failed attempts
      this.db.update('wallet_security', security.id, {
        failed_attempts: 0,
        locked_until: null
      });

      // Generate session JWTs (Access & Refresh)
      const token = jwt.sign(
        { id: wallet.user_id, walletId: wallet.id, address: wallet.address },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      const refreshToken = jwt.sign(
        { id: wallet.user_id, walletId: wallet.id, address: wallet.address, isRefresh: true },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'Unknown Device';

      // Store session with device details and refresh token
      this.db.insert<any>('sessions', {
        user_id: wallet.user_id,
        token: token,
        refresh_token: refreshToken,
        ip_address: String(ipAddress),
        user_agent: String(userAgent),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });

      this.db.insert<any>('audit_logs', {
        actor_type: 'user',
        actor_id: wallet.user_id,
        action: 'login_success',
        details: { address: wallet.address },
        ip_address: req.ip || '127.0.0.1'
      });

      return res.status(200).json({
        success: true,
        message: 'Passcode verified, login successful',
        data: {
          token,
          refreshToken,
          user: {
            id: wallet.user_id,
            address: wallet.address
          }
        }
      });
    } catch (e: any) {
      logger.error('Passcode verification login error:', { error: e.message });
      return res.status(500).json({ success: false, message: 'Internal server security error' });
    }
  };

  /**
   * Refreshes JWT sessions using a refresh token
   */
  public refreshToken = async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }

    try {
      const activeSession = this.db.findOne<any>('sessions', s => s.refresh_token === refreshToken);
      if (!activeSession) {
        return res.status(401).json({ success: false, message: 'Session not found or revoked' });
      }

      if (new Date(activeSession.expires_at) < new Date()) {
        this.db.delete('sessions', activeSession.id);
        return res.status(401).json({ success: false, message: 'Refresh token expired' });
      }

      const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;
      if (!decoded.isRefresh) {
        return res.status(401).json({ success: false, message: 'Invalid token type' });
      }

      const wallet = this.db.findOne<any>('wallets', w => w.user_id === decoded.id);
      if (!wallet) {
        return res.status(404).json({ success: false, message: 'Associated wallet not found' });
      }

      // Generate new short-lived access token
      const newToken = jwt.sign(
        { id: decoded.id, walletId: wallet.id, address: wallet.address },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      // Generate new refresh token for rotation
      const newRefreshToken = jwt.sign(
        { id: decoded.id, walletId: wallet.id, address: wallet.address, isRefresh: true },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Update current session in DB
      this.db.update('sessions', activeSession.id, {
        token: newToken,
        refresh_token: newRefreshToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });

      return res.status(200).json({
        success: true,
        data: {
          token: newToken,
          refreshToken: newRefreshToken
        }
      });
    } catch (e: any) {
      logger.error('Refresh token error:', { error: e.message });
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }
  };

  /**
   * Logout current session
   */
  public logout = async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access token missing' });
    }
    const token = authHeader.split(' ')[1];

    try {
      const session = this.db.findOne<any>('sessions', s => s.token === token);
      if (session) {
        this.db.delete('sessions', session.id);
      }
      return res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
  };

  /**
   * Logout all devices (destroy all sessions for user)
   */
  public logoutAllDevices = async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access token missing' });
    }
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const userId = decoded.id;

      const sessions = this.db.findMany<any>('sessions', s => s.user_id === userId);
      for (const s of sessions) {
        this.db.delete('sessions', s.id);
      }

      return res.status(200).json({ success: true, message: 'Successfully logged out of all devices' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: 'Failed to logout from all devices' });
    }
  };
}
