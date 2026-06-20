const router = require('express').Router();
const db = require('../db');
const { authenticate, requirePermission, hashPassword, normalizePermissions, DEFAULT_STAFF_PERMISSIONS } = require('../middleware/auth');

function cleanRole(role = 'staff') {
  return role === 'admin' ? 'admin' : 'staff';
}

function cleanPermissions(role, permissions) {
  return normalizePermissions(cleanRole(role), { ...DEFAULT_STAFF_PERMISSIONS, ...(permissions || {}) });
}

router.get('/', authenticate, requirePermission('admin'), async (req, res) => {
  const result = await db.query('SELECT id, username, role, permissions, active, created_at FROM users ORDER BY created_at DESC');
  res.json(result.rows.map(user => ({ ...user, permissions: normalizePermissions(user.role, user.permissions) })));
});

router.post('/', authenticate, requirePermission('admin'), async (req, res) => {
  const { username, password = '1234', active = true, role = 'staff', permissions } = req.body;
  if (!username) return res.status(400).json({ error: 'username is required' });
  const nextRole = cleanRole(role);
  const nextPermissions = cleanPermissions(nextRole, permissions);
  const result = await db.query(
    `INSERT INTO users (username, password_hash, role, permissions, active)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, username, role, permissions, active, created_at`,
    [String(username).trim().toLowerCase(), hashPassword(password), nextRole, JSON.stringify(nextPermissions), active]
  );
  res.status(201).json({ ...result.rows[0], permissions: normalizePermissions(result.rows[0].role, result.rows[0].permissions) });
});

router.patch('/:id', authenticate, requirePermission('admin'), async (req, res) => {
  const existing = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'User not found' });

  const { active, password, role, permissions, username } = req.body;
  if (password && String(req.user.id) !== String(req.params.id)) {
    return res.status(403).json({ error: 'You can only change your own password' });
  }
  const nextUsername = username === undefined ? existing.rows[0].username : String(username).trim().toLowerCase();
  if (!nextUsername) return res.status(400).json({ error: 'username is required' });
  const nextRole = role ? cleanRole(role) : existing.rows[0].role;
  const nextPermissions = permissions ? cleanPermissions(nextRole, permissions) : normalizePermissions(nextRole, existing.rows[0].permissions);

  const result = await db.query(
    `UPDATE users SET
       username = $1,
       active = COALESCE($2, active),
       password_hash = COALESCE($3, password_hash),
       role = $4,
       permissions = $5
     WHERE id=$6
     RETURNING id, username, role, permissions, active, created_at`,
    [nextUsername, active, password ? hashPassword(password) : null, nextRole, JSON.stringify(nextPermissions), req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ ...result.rows[0], permissions: normalizePermissions(result.rows[0].role, result.rows[0].permissions) });
});

module.exports = router;
