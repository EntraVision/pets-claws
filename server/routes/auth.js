const router = require('express').Router();
const db = require('../db');
const { authenticate, createToken, verifyPassword, normalizePermissions } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });

  const result = await db.query(
    'SELECT id, username, password_hash, role, permissions, active FROM users WHERE username = $1',
    [String(username).trim().toLowerCase()]
  );
  const user = result.rows[0];
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const safeUser = { id: user.id, username: user.username, role: user.role, permissions: normalizePermissions(user.role, user.permissions) };
  res.json({ token: createToken(safeUser), user: safeUser });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', authenticate, (req, res) => {
  res.json({ success: true });
});

module.exports = router;
