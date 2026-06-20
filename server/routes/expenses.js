const router = require('express').Router();
const db = require('../db');
const { authenticate, requireRole, requirePermission } = require('../middleware/auth');
const LEBANON_TODAY = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Beirut')::date";

router.get('/categories', authenticate, async (req, res) => {
  const result = await db.query('SELECT * FROM expense_categories ORDER BY name ASC');
  res.json(result.rows);
});

router.post('/categories', authenticate, requireRole('admin'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = await db.query('INSERT INTO expense_categories (name) VALUES ($1) RETURNING *', [name]);
  res.status(201).json(result.rows[0]);
});

router.get('/', authenticate, requirePermission('expenses'), async (req, res) => {
  const result = await db.query(
    `SELECT e.*, ec.name AS category_name, u.username AS created_by_name
     FROM expenses e
     LEFT JOIN expense_categories ec ON ec.id = e.category_id
     LEFT JOIN users u ON u.id = e.created_by
     ORDER BY e.expense_date DESC, e.id DESC
     LIMIT 200`
  );
  res.json(result.rows);
});

router.post('/', authenticate, requirePermission('expenses'), async (req, res) => {
  const { category_id, amount, expense_date, vendor, notes } = req.body;
  if (amount === undefined) return res.status(400).json({ error: 'amount is required' });
  const result = await db.query(
    `INSERT INTO expenses (category_id, amount, expense_date, vendor, notes, created_by, created_at)
     VALUES ($1,$2,COALESCE($3::date,${LEBANON_TODAY}),$4,$5,$6,NOW())
     RETURNING *`,
    [category_id || null, amount, expense_date || null, vendor || null, notes || null, req.user.id]
  );
  res.status(201).json(result.rows[0]);
});

router.delete('/:id', authenticate, requirePermission('expenses'), async (req, res) => {
  const result = await db.query('DELETE FROM expenses WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Expense not found' });
  res.json({ success: true });
});

module.exports = router;
