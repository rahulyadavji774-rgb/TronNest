import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_123';

export class AuthEngine {
  static async loginUser(username: string, passwordPlain: string) {
    const db = getDb();
    const users = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
    if (!users.length) throw new Error('Invalid credentials');
    
    const user = users[0];
    const match = await bcrypt.compare(passwordPlain, user.passwordHash);
    if (!match) throw new Error('Invalid credentials');
    if (user.status !== 'active') throw new Error('Account inactive');

    const token = jwt.sign({ id: user.id, type: 'user' }, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = crypto.randomBytes(40).toString('hex');

    await db.insert(schema.sessions).values({
      userId: user.id,
      token,
      refreshToken,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) // 7 days
    });

    await db.update(schema.users).set({ lastLogin: new Date() }).where(eq(schema.users.id, user.id));

    return { token, refreshToken, user: { id: user.id, username: user.username } };
  }

  static async loginAdmin(username: string, passwordPlain: string) {
    const db = getDb();
    const admins = await db.select().from(schema.admins).where(eq(schema.admins.username, username)).limit(1);
    if (!admins.length) throw new Error('Invalid credentials');
    
    const admin = admins[0];
    const match = await bcrypt.compare(passwordPlain, admin.passwordHash);
    if (!match) throw new Error('Invalid credentials');
    if (!admin.isActive) throw new Error('Account inactive');

    const token = jwt.sign({ id: admin.id, type: 'admin', role: admin.role }, JWT_SECRET, { expiresIn: '4h' });
    const refreshToken = crypto.randomBytes(40).toString('hex');

    await db.insert(schema.sessions).values({
      adminId: admin.id,
      token,
      refreshToken,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) // 7 days
    });

    return { token, refreshToken, admin: { id: admin.id, username: admin.username, role: admin.role } };
  }

  static async logout(token: string) {
    const db = getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
  }
}
