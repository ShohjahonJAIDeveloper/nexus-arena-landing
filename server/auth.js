/** Авторизация администратора: пароль из .env + подписанная cookie с токеном сессии. */
import crypto from 'node:crypto';
import { createAdminSession, destroyAdminSession, isAdminSessionValid } from './db.js';

export const ADMIN_COOKIE = 'nx_admin';
const SESSION_DAYS = 7;

/** Сравнение постоянного времени, чтобы пароль нельзя было подобрать по таймингам. */
export function passwordMatches(input) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(String(input ?? '')).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function startSession(res) {
  const token = crypto.randomBytes(32).toString('hex');
  createAdminSession(token, SESSION_DAYS);
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    signed: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
  return token;
}

export function endSession(req, res) {
  const token = req.signedCookies?.[ADMIN_COOKIE];
  if (token) destroyAdminSession(token);
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
}

export function isAuthed(req) {
  return isAdminSessionValid(req.signedCookies?.[ADMIN_COOKIE]);
}

/** Middleware для API админки: отдаёт 401 вместо редиректа. */
export function requireAdminApi(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ ok: false, error: 'Требуется вход' });
  return next();
}
