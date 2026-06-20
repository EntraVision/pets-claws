const router = require('express').Router();
const db = require('../db');
const { authenticate, requirePermission } = require('../middleware/auth');
const { quantity: validQuantity } = require('../utils/quantity');

function money(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100) / 100);
}

router.get('/', authenticate, requirePermission('purchases'), async (req, res) => {
  const result = await db.query(
    `SELECT p.*, s.name AS supplier_name, u.username AS created_by_name,
            COALESCE(json_agg(json_build_object(
              'id', pl.id, 'item_id', pl.item_id, 'item_name', i.name, 'unit_type', i.unit_type,
              'quantity', pl.quantity, 'unit_cost', pl.unit_cost, 'line_total', pl.line_total
            ) ORDER BY pl.id) FILTER (WHERE pl.id IS NOT NULL), '[]') AS lines
     FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN users u ON u.id = p.created_by
     LEFT JOIN purchase_lines pl ON pl.purchase_id = p.id
     LEFT JOIN items i ON i.id = pl.item_id
     GROUP BY p.id, s.name, u.username
     ORDER BY p.purchased_at DESC
     LIMIT 100`
  );
  res.json(result.rows);
});

router.post('/', authenticate, requirePermission('purchases'), async (req, res) => {
  const { supplier_id, paid_status = 'unpaid', purchased_at, notes, lines = [] } = req.body;
  if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: 'Purchase lines are required' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const prepared = [];
    for (const line of lines) {
      const item = await client.query('SELECT * FROM items WHERE id = $1 FOR UPDATE', [line.item_id]);
      if (!item.rows[0]) throw new Error(`Item not found: ${line.item_id}`);
      const quantity = validQuantity(line.quantity, item.rows[0].unit_type);
      if (!quantity || quantity <= 0) throw new Error(`Invalid purchase quantity for ${item.rows[0].name}`);
      const unitCost = money(line.unit_cost);
      prepared.push({ item: item.rows[0], quantity, unitCost, lineTotal: money(quantity * unitCost) });
    }

    const total = money(prepared.reduce((sum, line) => sum + line.lineTotal, 0));
    const purchase = await client.query(
      `INSERT INTO purchases (supplier_id, paid_status, total_cost, purchased_at, paid_at, notes, created_by)
       VALUES ($1,$2::varchar,$3,COALESCE($4::timestamp,NOW()),CASE WHEN $2::varchar='paid' THEN NOW() ELSE NULL END,$5,$6)
       RETURNING *`,
      [supplier_id || null, paid_status, total, purchased_at || null, notes || null, req.user.id]
    );

    for (const line of prepared) {
      await client.query(
        `INSERT INTO purchase_lines (purchase_id, item_id, quantity, unit_cost, line_total)
         VALUES ($1,$2,$3,$4,$5)`,
        [purchase.rows[0].id, line.item.id, line.quantity, line.unitCost, line.lineTotal]
      );
      await client.query(
        `UPDATE items SET quantity = quantity + $1, cost_price = $2, updated_at = NOW()
         WHERE id = $3`,
        [line.quantity, line.unitCost, line.item.id]
      );
      await client.query(
        `INSERT INTO item_history (item_id, user_id, action, old_values, new_values, notes)
         VALUES ($1,$2,'purchase_received',$3,$4,$5)`,
        [line.item.id, req.user.id, JSON.stringify({ quantity: line.item.quantity, cost_price: line.item.cost_price }),
          JSON.stringify({ quantity: Number(line.item.quantity) + line.quantity, cost_price: line.unitCost }),
          `Purchase #${purchase.rows[0].id} received (${paid_status})`]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(purchase.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.patch('/:id/payment', authenticate, requirePermission('purchases'), async (req, res) => {
  const { paid_status } = req.body;
  if (!['paid', 'unpaid'].includes(paid_status)) return res.status(400).json({ error: 'paid_status must be paid or unpaid' });
  const result = await db.query(
    `UPDATE purchases SET paid_status=$1::varchar, paid_at=CASE WHEN $1::varchar='paid' THEN NOW() ELSE NULL END
     WHERE id=$2 RETURNING *`,
    [paid_status, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Purchase not found' });
  res.json(result.rows[0]);
});

module.exports = router;
