import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.ts';
import type { User } from '../types.ts';

export interface AuthUser { id: string; role: 'teacher' | 'admin'; email: string; name: string; }
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AuthUser; }
  }
}

export function signToken(u: { id: string; role: 'teacher' | 'admin'; email: string; name: string }): string {
  return jwt.sign({ id: u.id, role: u.role, email: u.email, name: u.name }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: '未登录或登录已过期' });
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = { id: payload.id, role: payload.role, email: payload.email, name: payload.name };
    next();
  } catch {
    return res.status(401).json({ error: '登录状态无效，请重新登录' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: '未登录' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

export function safeUser(u: User) {
  const { passwordHash: _p, ...rest } = u;
  return rest;
}

// Express 4 async 包装
export function ah(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
