const crypto = require('crypto');
const db = require('../db');

const TOKEN_SECRET = process.env.AUTH_SECRET || 'pets-and-claws-dev-secret';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const DEFAULT_STAFF_PERMISSIONS = {
  pos: true,
  stock: false,
  purchases: false,
  expenses: false,
  dashboard: false,
  monthly_report: false,
  admin: false,
};

function normalizePermissions(role, permissions = {}) {
  if (role === 'admin') {
    return {
      pos: true,
      stock: true,
      purchases: true,
      expenses: true,
      dashboard: true,
      monthly_report: true,
      admin: true,
    };
  }
  return { ...DEFAULT_STAFF_PERMISSIONS, ...(permissions || {}) };
}

function signPayload(payload) {
  return crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('base64url');
}

function createToken(user) {
  const body = Buffer.from(JSON.stringify({
    id: user.id,
    username: user.username,
    role: user.role,
    permissions: normalizePermissions(user.role, user.permissions),
    exp: Date.now() + TOKEN_TTL_MS,
  })).toString('base64url');
  return `${body}.${signPayload(body)}`;
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (signPayload(body) !== signature) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (!stored.includes(':')) return password === stored;
  const [salt] = stored.split(':');
  return hashPassword(password, salt) === stored;
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = readToken(token);
  if (!payload) return res.status(401).json({ error: 'Authentication required' });

  const result = await db.query(
    'SELECT id, username, role, permissions, active FROM users WHERE id = $1 AND active = true',
    [payload.id]
  );
  if (!result.rows[0]) return res.status(401).json({ error: 'Authentication required' });

  req.user = {
    ...result.rows[0],
    permissions: normalizePermissions(result.rows[0].role, result.rows[0].permissions),
  };
  req.auth = { userId: String(result.rows[0].id) };
  next();
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

const requirePermission = (...permissions) => (req, res, next) => {
  if (!req.user) return res.status(403).json({ error: 'Insufficient permissions' });
  if (req.user.role === 'admin') return next();
  if (permissions.some(permission => req.user.permissions?.[permission])) return next();
  return res.status(403).json({ error: 'Insufficient permissions' });
};

const syncUser = (req, res, next) => next();

module.exports = { authenticate, requireRole, requirePermission, syncUser, createToken, hashPassword, verifyPassword, normalizePermissions, DEFAULT_STAFF_PERMISSIONS };
