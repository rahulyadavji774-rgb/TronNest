import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JsonDatabase } from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'TronNest_SuperSecureJWTSalt_2026';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    walletId: number;
    address: string;
  };
  admin?: {
    id: number;
    username: string;
    role: 'root' | 'editor' | 'viewer';
  };
}

export function authenticateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authorization token missing or malformed' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const db = JsonDatabase.getInstance();
    
    // Check if token exists in active sessions
    const activeSession = db.findOne<any>('sessions', s => s.token === token);
    if (!activeSession) {
      return res.status(401).json({ success: false, message: 'Session expired or invalidated' });
    }

    if (new Date(activeSession.expires_at) < new Date()) {
      db.delete('sessions', activeSession.id);
      return res.status(401).json({ success: false, message: 'Session expired' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.id,
      walletId: decoded.walletId,
      address: decoded.address
    };

    // Confirm wallet is not frozen
    const userObj = db.findById<any>('users', decoded.id);
    if (userObj && (userObj.status === 'suspended' || userObj.status === 'frozen')) {
      return res.status(403).json({ success: false, message: 'Your account has been frozen or suspended. Access denied.' });
    }

    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

export function authenticateAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Admin authentication token missing' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded.isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied: administrative permissions required' });
    }

    req.admin = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role || 'viewer'
    };

    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid administrative token' });
  }
}

export function requireAdminRole(roles: ('root' | 'editor' | 'viewer')[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: 'Admin session required' });
    }
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied: administrative role '${req.admin.role}' has insufficient permissions for this operation.` 
      });
    }
    next();
  };
}
