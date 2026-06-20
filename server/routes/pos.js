const router = require('express').Router();
const db = require('../db');
const { authenticate, requirePermission } = require('../middleware/auth');
const { quantity: validQuantity } = require('../utils/quantity');

function money(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100) / 100);
}

function percent(value) {
  return Math.min(100, Math.max(0, Number(value || 0)));
}

router.get('/sales', authenticate, requirePermission('pos'), async (req, res) => {
  const { date } = req.query;
  const params = [];
  const where = [];
  if (date) {
    params.push(date);
    where.push(`(
      ((s.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Beirut')::date = $${params.length}::date
      OR s.created_at::date = $${params.length}::date
    )`);
  }

  const result = await db.query(
    `SELECT
       s.*,
       u.username AS created_by_name,
       COUNT(sl.id)::int AS line_count,
       COALESCE(json_agg(json_build_object(
         'id', sl.id,
         'item_id', sl.item_id,
         'item_name', sl.item_name,
         'quantity', sl.quantity,
         'unit_type', sl.unit_type,
         'unit_price', sl.unit_price,
         'discount', sl.discount,
         'line_total', sl.line_total
       ) ORDER BY sl.id) FILTER (WHERE sl.id IS NOT NULL), '[]') AS lines
     FROM sales s
     LEFT JOIN users u ON u.id = s.created_by
     LEFT JOIN sale_lines sl ON sl.sale_id = s.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY s.id, u.username
     ORDER BY s.created_at DESC
     LIMIT 100`,
    params
  );
  res.json(result.rows);
});

router.post('/sales', authenticate, requirePermission('pos'), async (req, res) => {
  const { lines = [], cart_discount = 0, cart_discount_percent, paid_status = 'paid' } = req.body;
  if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: 'Sale lines are required' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const prepared = [];

    for (const line of lines) {
      if (line.custom || !line.item_id) {
        const unitType = line.unit_type === 'kg' ? 'kg' : 'piece';
        const quantity = validQuantity(line.quantity, unitType);
        if (!quantity || quantity <= 0) throw new Error('Invalid quantity for custom item');

        const itemName = String(line.item_name || line.name || 'Other').trim() || 'Other';
        const unitPrice = money(line.unit_price);
        if (unitPrice <= 0) throw new Error(`Invalid unit price for ${itemName}`);

        const discountPercent = percent(line.discount_percent ?? line.discount ?? 0);
        const grossLineTotal = money(unitPrice * quantity);
        const discount = money(grossLineTotal * (discountPercent / 100));
        const lineTotal = money(grossLineTotal - discount);
        prepared.push({
          custom: true,
          item: {
            id: null,
            name: itemName,
            barcode: line.barcode || null,
            unit_type: unitType,
            cost_price: 0,
          },
          quantity,
          discount,
          discountPercent,
          unitPrice,
          lineTotal,
        });
        continue;
      }

      const itemResult = await client.query('SELECT * FROM items WHERE id = $1 FOR UPDATE', [line.item_id]);
      const item = itemResult.rows[0];
      if (!item || item.status !== 'active') throw new Error(`Item is unavailable: ${line.item_id}`);

      const quantity = validQuantity(line.quantity, item.unit_type);
      if (!quantity || quantity <= 0) throw new Error(`Invalid quantity for ${item.name}`);
      if (Number(item.quantity) < quantity) throw new Error(`Insufficient stock for ${item.name}`);

      const unitPrice = money(line.unit_price === undefined ? item.sale_price : line.unit_price);
      if (unitPrice <= 0) throw new Error(`Invalid unit price for ${item.name}`);

      const discountPercent = percent(line.discount_percent ?? line.discount ?? 0);
      const grossLineTotal = money(unitPrice * quantity);
      const discount = money(grossLineTotal * (discountPercent / 100));
      const lineTotal = money(grossLineTotal - discount);
      prepared.push({ item, quantity, discount, discountPercent, unitPrice, lineTotal });
    }

    const subtotal = money(prepared.reduce((sum, line) => sum + line.lineTotal, 0));
    const cartDiscountPercent = percent(cart_discount_percent ?? cart_discount ?? 0);
    const discountTotal = money(subtotal * (cartDiscountPercent / 100));
    const total = money(subtotal - discountTotal);

    const sale = await client.query(
      `INSERT INTO sales (subtotal, discount_total, total, paid_status, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [subtotal, discountTotal, total, paid_status, req.user.id]
    );

    for (const line of prepared) {
      await client.query(
        `INSERT INTO sale_lines
         (sale_id, item_id, item_name, barcode, quantity, unit_type, unit_price, unit_cost, discount, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [sale.rows[0].id, line.item.id, line.item.name, line.item.barcode, line.quantity,
          line.item.unit_type, line.unitPrice, line.item.cost_price, line.discount, line.lineTotal]
      );
      if (line.custom) continue;

      await client.query('UPDATE items SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2', [line.quantity, line.item.id]);
      await client.query(
        `INSERT INTO item_history (item_id, user_id, action, old_values, new_values, notes)
         VALUES ($1,$2,'pos_sale',$3,$4,$5)`,
        [line.item.id, req.user.id, JSON.stringify({ quantity: line.item.quantity }),
          JSON.stringify({ quantity: Number(line.item.quantity) - line.quantity }), `POS sale #${sale.rows[0].id}`]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(sale.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
