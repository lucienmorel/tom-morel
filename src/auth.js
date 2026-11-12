const crypto = require('crypto');
const { db } = require('./db');
const { COOKIE_SECURE, SESSION_DAYS } = require('./config');

const COOKIE = 'sid';

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}

function verifyPassword(pw, stored) {
  const [algo, s, h] = String(stored).split('$');
  if (algo !== 'scrypt' || !s || !h) return false;
  const expected = Buffer.from(h, 'hex');
  const got = crypto.scryptSync(pw, Buffer.from(s, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, got);
}

// Code d'accès lisible : XXXX-XXXX-XXXX (sans 0/O/1/I/L), ~59 bits d'entropie
function generateCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 12; i++) {
    if (i && i % 4 === 0) out += '-';
    out += alphabet[crypto.randomInt(alphabet.length)];
  }
  return out;
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function cookieString(value, maxAgeSec) {
  return [
    `${COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
    COOKIE_SECURE ? 'Secure' : null,
  ].filter(Boolean).join('; ');
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  const maxAge = SESSION_DAYS * 86400;
  db.prepare('INSERT INTO sessions (token, user_id, csrf, expires) VALUES (?, ?, ?, ?)')
    .run(token, userId, csrf, Date.now() + maxAge * 1000);
  res.setHeader('Set-Cookie', cookieString(token, maxAge));
}

function destroySession(req, res) {
  if (req.session) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.session.token);
  res.setHeader('Set-Cookie', cookieString('', 0));
}

// Middleware : charge la session et l'utilisateur
function loadSession(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  req.user = null;
  req.session = null;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const row = db.prepare(`
      SELECT s.token, s.csrf, s.flash, s.expires, u.id, u.username, u.is_admin
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires > ?`).get(token, Date.now());
    if (row) {
      req.session = { token: row.token, csrf: row.csrf, flash: row.flash };
      req.user = { id: row.id, username: row.username, is_admin: !!row.is_admin };
    }
  }
  next();
}

function setFlash(req, type, msg, extra = {}) {
  if (!req.session) return;
  db.prepare('UPDATE sessions SET flash = ? WHERE token = ?')
    .run(JSON.stringify({ type, msg, ...extra }), req.session.token);
}

function popFlash(req) {
  if (!req.session || !req.session.flash) return null;
  db.prepare('UPDATE sessions SET flash = NULL WHERE token = ?').run(req.session.token);
  try { return JSON.parse(req.session.flash); } catch { return null; }
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  const target = req.method === 'GET' ? `?suite=${encodeURIComponent(req.originalUrl)}` : '';
  res.redirect(`/connexion${target}`);
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.is_admin) return next();
  res.status(403).send('Accès réservé à l’administration.');
}

function csrfCheck(req, res, next) {
  const sent = req.body && req.body._csrf;
  if (req.session && typeof sent === 'string' && sent.length === req.session.csrf.length &&
      crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(req.session.csrf))) return next();
  res.status(403).send('Jeton de sécurité invalide. Rechargez la page et recommencez.');
}

// Limitation des tentatives de connexion : 10 échecs / 15 min par IP
const attempts = new Map();
function loginAllowed(ip) {
  const a = attempts.get(ip);
  if (!a) return true;
  if (Date.now() > a.until) { attempts.delete(ip); return true; }
  return a.count < 10;
}
function loginFailed(ip) {
  const a = attempts.get(ip);
  if (!a || Date.now() > a.until) attempts.set(ip, { count: 1, until: Date.now() + 15 * 60 * 1000 });
  else a.count++;
}
function loginSucceeded(ip) { attempts.delete(ip); }

module.exports = {
  hashPassword, verifyPassword, generateCode,
  createSession, destroySession, loadSession,
  setFlash, popFlash, requireAuth, requireAdmin, csrfCheck,
  loginAllowed, loginFailed, loginSucceeded,
};
