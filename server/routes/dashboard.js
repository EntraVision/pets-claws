const router = require('express').Router();
const db = require('../db');
const { authenticate, requirePermission } = require('../middleware/auth');

const TZ = 'Asia/Beirut';
const PERIODS = {
  day: { trunc: 'day', label: 'Today' },
  week: { trunc: 'week', label: 'This Week' },
  month: { trunc: 'month', label: 'This Month' },
  '3month': { months: 3, label: '3 Months' },
  '6month': { months: 6, label: '6 Months' },
  '9month': { months: 9, label: '9 Months' },
  year: { trunc: 'year', label: 'This Year' },
};

function periodBounds(period) {
  const selected = PERIODS[period] ? period : 'month';
  return {
    selected,
    label: PERIODS[selected].label,
    trunc: PERIODS[selected].trunc,
    months: PERIODS[selected].months,
  };
}

function boundsSql(months) {
  if (months) {
    return `
      WITH bounds AS (
        SELECT
          (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE $1) - (($2::int - 1) || ' months')::interval)::timestamp AS start_at,
          (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE $1) + interval '1 month')::timestamp AS end_at
      )
    `;
  }
  return `
    WITH bounds AS (
      SELECT
        date_trunc($1, CURRENT_TIMESTAMP AT TIME ZONE $2)::timestamp AS start_at,
        (date_trunc($1, CURRENT_TIMESTAMP AT TIME ZONE $2) + ('1 ' || $1)::interval)::timestamp AS end_at
    )
  `;
}

function bucketSql(period, months) {
  if (period === 'day') return { step: '1 hour', format: 'HH12 AM' };
  if (period === 'week') return { step: '1 day', format: 'Dy' };
  if (months) return { step: '1 month', format: 'Mon YYYY' };
  if (period === 'year') return { step: '1 month', format: 'Mon' };
  return { step: '1 day', format: 'DD Mon' };
}

router.get('/summary', authenticate, requirePermission('dashboard'), async (req, res) => {
  const { selected, label, trunc, months } = periodBounds(req.query.period);
  const bucket = bucketSql(selected, months);
  const bounds = boundsSql(months);
  const params = months ? [TZ, months] : [trunc, TZ];
  const tzParam = months ? '$1' : '$2';
  const saleLocalTime = `((s.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tzParam})`;
  const returnLocalTime = `((r.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tzParam})`;
  const saleDisplayTime = `((s.created_at AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}')`;
  const purchaseLocalTime = `((p.purchased_at AT TIME ZONE 'UTC') AT TIME ZONE ${tzParam})`;
  const saleInPeriod = `((${saleLocalTime} >= bounds.start_at AND ${saleLocalTime} < bounds.end_at) OR (s.created_at >= bounds.start_at AND s.created_at < bounds.end_at))`;
  const returnInPeriod = `((${returnLocalTime} >= bounds.start_at AND ${returnLocalTime} < bounds.end_at) OR (r.created_at >= bounds.start_at AND r.created_at < bounds.end_at))`;
  const purchaseInPeriod = `((${purchaseLocalTime} >= bounds.start_at AND ${purchaseLocalTime} < bounds.end_at) OR (p.purchased_at >= bounds.start_at AND p.purchased_at < bounds.end_at))`;
  const bucketTrunc = months || selected === 'year' ? 'month' : selected === 'day' ? 'hour' : 'day';

  const [
    salesPeriod,
    returnsPeriod,
    purchasesPeriod,
    expensesPeriod,
    stockCounts,
    unpaidPurchases,
    grossMargin,
    returnMargin,
    stockInput,
    stockOutput,
    stockReturn,
    topSold,
    trend,
    recentSales,
  ] = await Promise.all([
    db.query(`${bounds} SELECT COALESCE(SUM(s.total),0)::numeric AS total FROM sales s, bounds WHERE ${saleInPeriod}`, params),
    db.query(`${bounds} SELECT COALESCE(SUM(r.total),0)::numeric AS total, COUNT(r.id)::int AS count FROM returns r, bounds WHERE ${returnInPeriod}`, params),
    db.query(`${bounds} SELECT COALESCE(SUM(p.total_cost),0)::numeric AS total FROM purchases p, bounds WHERE ${purchaseInPeriod}`, params),
    db.query(
      `${bounds}
       SELECT COALESCE(SUM(amount),0)::numeric AS total
       FROM expenses, bounds
       WHERE expense_date >= bounds.start_at::date AND expense_date < bounds.end_at::date`,
      params
    ),
    db.query(
      `SELECT
        COUNT(*)::int AS total_items,
        COUNT(*) FILTER (WHERE status='active' AND quantity <= 0)::int AS out_of_stock,
        COUNT(*) FILTER (WHERE status='active' AND quantity > 0 AND quantity <= reorder_warning_quantity)::int AS low_stock
       FROM items`
    ),
    db.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(total_cost),0)::numeric AS total FROM purchases WHERE paid_status='unpaid'`),
    db.query(
      `${bounds}
       SELECT COALESCE(SUM(
         (sl.unit_price - sl.unit_cost) * sl.quantity
         - sl.discount
         - CASE
             WHEN s.subtotal > 0 THEN s.discount_total * (sl.line_total / s.subtotal)
             ELSE 0
           END
       ),0)::numeric AS total
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       CROSS JOIN bounds
       WHERE ${saleInPeriod}`,
      params
    ),
    db.query(
      `${bounds}
       SELECT COALESCE(SUM((rl.unit_price - rl.unit_cost) * rl.quantity),0)::numeric AS total
       FROM return_lines rl
       JOIN returns r ON r.id = rl.return_id
       CROSS JOIN bounds
       WHERE ${returnInPeriod}`,
      params
    ),
    db.query(
      `${bounds}
       SELECT COALESCE(SUM(pl.quantity),0)::numeric AS total
       FROM purchase_lines pl
       JOIN purchases p ON p.id = pl.purchase_id
       CROSS JOIN bounds
       WHERE ${purchaseInPeriod}`,
      params
    ),
    db.query(
      `${bounds}
       SELECT COALESCE(SUM(sl.quantity),0)::numeric AS total
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       CROSS JOIN bounds
       WHERE ${saleInPeriod}`,
      params
    ),
    db.query(
      `${bounds}
       SELECT COALESCE(SUM(rl.quantity),0)::numeric AS total
       FROM return_lines rl
       JOIN returns r ON r.id = rl.return_id
       CROSS JOIN bounds
       WHERE ${returnInPeriod}`,
      params
    ),
    db.query(
      `${bounds}
       SELECT
         movement.item_id,
         movement.item_name,
         movement.unit_type,
         SUM(movement.quantity)::numeric AS quantity,
         SUM(movement.total)::numeric AS total
       FROM (
         SELECT sl.item_id, sl.item_name, sl.unit_type, sl.quantity, sl.line_total AS total
         FROM sale_lines sl
         JOIN sales s ON s.id = sl.sale_id
         CROSS JOIN bounds
         WHERE ${saleInPeriod}
         UNION ALL
         SELECT rl.item_id, rl.item_name, rl.unit_type, -rl.quantity AS quantity, -rl.line_total AS total
         FROM return_lines rl
         JOIN returns r ON r.id = rl.return_id
         CROSS JOIN bounds
         WHERE ${returnInPeriod}
       ) movement
       GROUP BY movement.item_id, movement.item_name, movement.unit_type
       HAVING SUM(movement.quantity) > 0 OR SUM(movement.total) > 0
       ORDER BY quantity DESC, total DESC
       LIMIT 8`,
      params
    ),
    db.query(
      `${bounds},
       buckets AS (
         SELECT generate_series(bounds.start_at, bounds.end_at - $3::interval, $3::interval) AS bucket_at
         FROM bounds
       ),
       sales_by_bucket AS (
         SELECT date_trunc($4, ${saleLocalTime}) AS bucket_at, SUM(s.total)::numeric AS sales
         FROM sales s
         CROSS JOIN bounds
         WHERE ${saleInPeriod}
         GROUP BY 1
       ),
       returns_by_bucket AS (
         SELECT date_trunc($4, ${returnLocalTime}) AS bucket_at, SUM(r.total)::numeric AS returns
         FROM returns r
         CROSS JOIN bounds
         WHERE ${returnInPeriod}
         GROUP BY 1
       ),
       expenses_by_bucket AS (
         SELECT date_trunc($4, e.expense_date::timestamp) AS bucket_at, SUM(e.amount)::numeric AS expenses
         FROM expenses e
         CROSS JOIN bounds
         WHERE e.expense_date >= bounds.start_at::date AND e.expense_date < bounds.end_at::date
         GROUP BY 1
       )
       SELECT
         to_char(buckets.bucket_at, $5) AS label,
         (COALESCE(sales_by_bucket.sales, 0) - COALESCE(returns_by_bucket.returns, 0))::numeric AS sales,
         COALESCE(expenses_by_bucket.expenses, 0)::numeric AS expenses
       FROM buckets
       LEFT JOIN sales_by_bucket ON sales_by_bucket.bucket_at = buckets.bucket_at
       LEFT JOIN returns_by_bucket ON returns_by_bucket.bucket_at = buckets.bucket_at
       LEFT JOIN expenses_by_bucket ON expenses_by_bucket.bucket_at = buckets.bucket_at
       ORDER BY buckets.bucket_at ASC`,
      [...params, bucket.step, bucketTrunc, bucket.format]
    ),
    db.query(
      `${bounds}
       SELECT
         s.*,
         to_char(${saleDisplayTime}, 'Mon DD, YYYY') AS created_at_display,
         COUNT(sl.id)::int AS line_count,
         COALESCE(json_agg(json_build_object(
           'id', sl.id,
           'item_id', sl.item_id,
           'item_name', sl.item_name,
           'quantity', sl.quantity,
           'unit_type', sl.unit_type,
           'line_total', sl.line_total
         ) ORDER BY sl.id) FILTER (WHERE sl.id IS NOT NULL), '[]') AS lines
       FROM sales s
       LEFT JOIN sale_lines sl ON sl.sale_id = s.id
       CROSS JOIN bounds
       WHERE ${saleInPeriod}
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT 6`,
      params
    ),
  ]);

  res.json({
    period: selected,
    period_label: label,
    timezone: TZ,
    sales_period: Number(salesPeriod.rows[0].total || 0) - Number(returnsPeriod.rows[0].total || 0),
    returns_period: returnsPeriod.rows[0].total,
    returns_count_period: returnsPeriod.rows[0].count,
    purchases_period: purchasesPeriod.rows[0].total,
    expenses_period: expensesPeriod.rows[0].total,
    gross_margin_period: Number(grossMargin.rows[0].total || 0) - Number(returnMargin.rows[0].total || 0),
    stock_input_period: stockInput.rows[0].total,
    stock_output_period: Number(stockOutput.rows[0].total || 0) - Number(stockReturn.rows[0].total || 0),
    stock_return_period: stockReturn.rows[0].total,
    top_sold_period: topSold.rows,
    trend: trend.rows,
    total_items: stockCounts.rows[0].total_items,
    low_stock: stockCounts.rows[0].low_stock,
    out_of_stock: stockCounts.rows[0].out_of_stock,
    unpaid_purchase_count: unpaidPurchases.rows[0].count,
    unpaid_purchase_total: unpaidPurchases.rows[0].total,
    recent_sales: recentSales.rows,
  });
});

module.exports = router;
