import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { HttpError } from './errors';

export type Role = 'admin' | 'operador';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, {
    expiresIn: config.jwtExpires as jwt.SignOptions['expiresIn'],
  });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return next(new HttpError(401, 'No autenticado'));
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = { id: payload.id, username: payload.username, fullName: payload.fullName, role: payload.role };
    next();
  } catch {
    next(new HttpError(401, 'Sesión expirada, vuelve a iniciar sesión'));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') return next(new HttpError(403, 'Solo un administrador puede realizar esta acción'));
  next();
}
