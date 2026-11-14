import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

const SESSION_SECRET =
  process.env.SESSION_SECRET || 'campusresolve-dev-secret-change-in-production';

export type UserRole = 'student' | 'staff' | 'admin';

export interface SessionUser {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  is_active: number;
  student_id?: number;
  roll_number?: string;
  department?: string;
  academic_year?: number;
  hostel_block?: string;
  staff_id?: number;
  employee_code?: string;
  specialization?: string;
  availability_status?: string;
  admin_id?: number;
  admin_code?: string;
  designation?: string;
}

export interface AuthedRequest extends Request {
  user?: SessionUser;
}

interface TokenPayload {
  uid: number;
  role: UserRole;
  csrf: string;
  exp: number;
}

function signPayload(payload: TokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isHttpsRequest(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export function setSessionCookie(req: Request, res: Response, userId: number, role: UserRole): string {
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const payload: TokenPayload = {
    uid: userId,
    role,
    csrf: csrfToken,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const signed = signPayload(payload);
  const https = isHttpsRequest(req);
  res.cookie('sc_session', signed, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  return csrfToken;
}

export function clearSessionCookie(req: Request, res: Response): void {
  const https = isHttpsRequest(req);
  res.clearCookie('sc_session', {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    path: '/',
  });
}

export function loadUserProfile(userId: number): SessionUser | null {
  const base = db
    .prepare('SELECT id, full_name, email, role, phone, is_active FROM users WHERE id = ?')
    .get(userId) as
    | { id: number; full_name: string; email: string; role: UserRole; phone: string | null; is_active: number }
    | undefined;

  if (!base || !base.is_active) return null;

  if (base.role === 'student') {
    const st = db
      .prepare('SELECT id as student_id, roll_number, department, academic_year, hostel_block FROM students WHERE user_id = ?')
      .get(base.id) as Record<string, unknown> | undefined;
    return { ...base, ...(st ?? {}) } as SessionUser;
  }

  if (base.role === 'staff') {
    const sf = db
      .prepare(
        'SELECT id as staff_id, employee_code, department, specialization, availability_status FROM staff WHERE user_id = ?'
      )
      .get(base.id) as Record<string, unknown> | undefined;
    return { ...base, ...(sf ?? {}) } as SessionUser;
  }

  if (base.role === 'admin') {
    const ad = db
      .prepare('SELECT id as admin_id, admin_code, designation FROM admins WHERE user_id = ?')
      .get(base.id) as Record<string, unknown> | undefined;
    return { ...base, ...(ad ?? {}) } as SessionUser;
  }

  return base;
}

export function attachSession(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const raw = req.cookies?.sc_session;
  if (!raw || typeof raw !== 'string') {
    next();
    return;
  }
  const payload = verifyToken(raw);
  if (!payload) {
    next();
    return;
  }
  const user = loadUserProfile(payload.uid);
  if (user) {
    req.user = user;
    (req as AuthedRequest & { csrfToken?: string }).csrfToken = payload.csrf;
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden: insufficient permissions for this resource.' });
      return;
    }
    next();
  };
}

export function verifyCsrf(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  // Public auth/contact endpoints don't have a prior authenticated session CSRF token
  if (
    req.path === '/auth/login' ||
    req.path === '/auth/register' ||
    req.path === '/public/contact'
  ) {
    next();
    return;
  }
  const sessionCsrf = (req as AuthedRequest & { csrfToken?: string }).csrfToken;
  const headerCsrf = req.headers['x-csrf-token'];
  if (!sessionCsrf || typeof headerCsrf !== 'string' || headerCsrf !== sessionCsrf) {
    res.status(403).json({ error: 'Invalid or missing CSRF security token.' });
    return;
  }
  next();
}
