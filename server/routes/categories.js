const router = require('express').Router();
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  const result = await db.query(
    `SELECT c.*, COUNT(i.id)::int AS item_count
     FROM categories c
     LEFT JOIN items i ON i.category_id = c.id
     GROUP BY c.id
     ORDER BY c.name ASC`
  );
  res.json(result.rows);
});

router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = await db.query(
    'INSERT INTO categories (name, description) VALUES ($1,$2) RETURNING *',
    [name, description || null]
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { name, description } = req.body;
  const result = await db.query(
    `UPDATE categories SET name = COALESCE($1, name), description = $2
     WHERE id = $3 RETURNING *`,
    [name || null, description ?? null, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Category not found' });
  res.json(result.rows[0]);
});

router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const itemCount = await db.query('SELECT COUNT(*) FROM items WHERE category_id = $1', [req.params.id]);
  if (Number(itemCount.rows[0].count) > 0) return res.status(400).json({ error: 'Reassign category items first' });
  const result = await db.query('DELETE FROM categories WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Category not found' });
  res.json({ success: true });
});

module.exports = router;
