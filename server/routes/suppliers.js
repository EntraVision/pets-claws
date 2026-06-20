const router = require('express').Router();
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  const result = await db.query(
    `SELECT s.*, COUNT(i.id)::int AS item_count
     FROM suppliers s
     LEFT JOIN items i ON i.supplier_id = s.id
     GROUP BY s.id
     ORDER BY s.name ASC`
  );
  res.json(result.rows);
});

router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  const { name, email, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = await db.query(
    'INSERT INTO suppliers (name, email, phone, address) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, email || null, phone || null, address || null]
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { name, email, phone, address } = req.body;
  const result = await db.query(
    `UPDATE suppliers SET name=COALESCE($1,name), email=$2, phone=$3, address=$4
     WHERE id=$5 RETURNING *`,
    [name || null, email || null, phone || null, address || null, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Supplier not found' });
  res.json(result.rows[0]);
});

router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const result = await db.query('DELETE FROM suppliers WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Supplier not found' });
  res.json({ success: true });
});

module.exports = router;
