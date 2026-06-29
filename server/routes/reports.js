const router = require('express').Router();
const db = require('../db');
const { authenticate, requirePermission } = require('../middleware/auth');

const TZ = 'Asia/Beirut';
const PERIODS = new Set(['day', 'month']);

function selectedPeriod(value) {
  return PERIODS.has(value) ? value : 'day';
}

function selectedDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : null;
}

function selectedMonth(value) {
  return /^\d{4}-\d{2}$/.test(value || '') ? `${value}-01` : null;
}

router.get('/monthly', authenticate, requirePermission('monthly_report'), async (req, res) => {
  const monthDate = selectedMonth(req.query.month);
  const saleLocalDate = `((s.created_at AT TIME ZONE 'UTC') AT TIME ZONE $2)::date`;
  const returnLocalDate = `((r.created_at AT TIME ZONE 'UTC') AT TIME ZONE $2)::date`;
  const purchasePaidLocalDate = `((p.paid_at AT TIME ZONE 'UTC') AT TIME ZONE $2)::date`;
  const bounds = `
    WITH input AS (
      SELECT COALESCE($1::date, date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE $2)::date)::date) AS selected_date
    ),
    bounds AS (
      SELECT
        date_trunc('month', selected_date)::date AS start_date,
        (date_trunc('month', selected_date) + interval '1 month')::date AS end_date
      FROM input
    ),
    days AS (
      SELECT generate_series(bounds.start_date, bounds.end_date - interval '1 day', interval '1 day')::date AS day_date
      FROM bounds
    ),
    sales_daily AS (
      SELECT
        ${saleLocalDate} AS day_date,
        COALESCE(SUM(s.total),0)::numeric AS sales_total,
        COUNT(s.id)::int AS sales_count
      FROM sales s
      CROSS JOIN bounds
      WHERE ${saleLocalDate} >= bounds.start_date AND ${saleLocalDate} < bounds.end_date
      GROUP BY ${saleLocalDate}
    ),
    returns_daily AS (
      SELECT
        ${returnLocalDate} AS day_date,
        COALESCE(SUM(r.total),0)::numeric AS returns_total,
        COUNT(r.id)::int AS returns_count
      FROM returns r
      CROSS JOIN bounds
      WHERE ${returnLocalDate} >= bounds.start_date AND ${returnLocalDate} < bounds.end_date
      GROUP BY ${returnLocalDate}
    ),
    expenses_daily AS (
      SELECT
        e.expense_date::date AS day_date,
        COALESCE(SUM(e.amount),0)::numeric AS expenses_total,
        COUNT(e.id)::int AS expenses_count
      FROM expenses e
      CROSS JOIN bounds
      WHERE e.expense_date >= bounds.start_date AND e.expense_date < bounds.end_date
      GROUP BY e.expense_date::date
    ),
    suppliers_daily AS (
      SELECT
        ${purchasePaidLocalDate} AS day_date,
        COALESCE(SUM(p.total_cost),0)::numeric AS supplier_payments_total,
        COUNT(p.id)::int AS supplier_payments_count
      FROM purchases p
      CROSS JOIN bounds
      WHERE p.paid_status = 'paid'
        AND p.paid_at IS NOT NULL
        AND ${purchasePaidLocalDate} >= bounds.start_date
        AND ${purchasePaidLocalDate} < bounds.end_date
      GROUP BY ${purchasePaidLocalDate}
    ),
    margin_daily AS (
      SELECT
        ${saleLocalDate} AS day_date,
        COALESCE(SUM(
          (sl.unit_price - sl.unit_cost) * sl.quantity
          - sl.discount
          - CASE
              WHEN s.subtotal > 0 THEN s.discount_total * (sl.line_total / s.subtotal)
              ELSE 0
            END
        ),0)::numeric AS gross_margin_total
      FROM sale_lines sl
      JOIN sales s ON s.id = sl.sale_id
      CROSS JOIN bounds
      WHERE ${saleLocalDate} >= bounds.start_date AND ${saleLocalDate} < bounds.end_date
      GROUP BY ${saleLocalDate}
    ),
    stock_daily AS (
      SELECT
        ${saleLocalDate} AS day_date,
        COALESCE(SUM(sl.quantity),0)::numeric AS stock_output_total
      FROM sale_lines sl
      JOIN sales s ON s.id = sl.sale_id
      CROSS JOIN bounds
      WHERE ${saleLocalDate} >= bounds.start_date AND ${saleLocalDate} < bounds.end_date
      GROUP BY ${saleLocalDate}
    ),
    return_margin_daily AS (
      SELECT
        ${returnLocalDate} AS day_date,
        COALESCE(SUM((rl.unit_price - rl.unit_cost) * rl.quantity),0)::numeric AS return_margin_total
      FROM return_lines rl
      JOIN returns r ON r.id = rl.return_id
      CROSS JOIN bounds
      WHERE ${returnLocalDate} >= bounds.start_date AND ${returnLocalDate} < bounds.end_date
      GROUP BY ${returnLocalDate}
    ),
    stock_return_daily AS (
      SELECT
        ${returnLocalDate} AS day_date,
        COALESCE(SUM(rl.quantity),0)::numeric AS stock_return_total
      FROM return_lines rl
      JOIN returns r ON r.id = rl.return_id
      CROSS JOIN bounds
      WHERE ${returnLocalDate} >= bounds.start_date AND ${returnLocalDate} < bounds.end_date
      GROUP BY ${returnLocalDate}
    )
  `;
  const params = [monthDate, TZ];
  const [periodInfo, dailyRows, topSold] = await Promise.all([
    db.query(`${bounds} SELECT start_date, (end_date - interval '1 day')::date AS end_date FROM bounds`, params),
    db.query(
      `${bounds}
       SELECT
         days.day_date AS date,
         EXTRACT(DAY FROM days.day_date)::int AS day,
         (COALESCE(sales_daily.sales_total,0) - COALESCE(returns_daily.returns_total,0))::numeric AS sales_total,
         COALESCE(sales_daily.sales_count,0)::int AS sales_count,
         COALESCE(returns_daily.returns_total,0)::numeric AS returns_total,
         COALESCE(returns_daily.returns_count,0)::int AS returns_count,
         COALESCE(expenses_daily.expenses_total,0)::numeric AS expenses_total,
         COALESCE(expenses_daily.expenses_count,0)::int AS expenses_count,
         COALESCE(suppliers_daily.supplier_payments_total,0)::numeric AS supplier_payments_total,
         COALESCE(suppliers_daily.supplier_payments_count,0)::int AS supplier_payments_count,
         (COALESCE(margin_daily.gross_margin_total,0) - COALESCE(return_margin_daily.return_margin_total,0))::numeric AS gross_margin_total,
         (COALESCE(stock_daily.stock_output_total,0) - COALESCE(stock_return_daily.stock_return_total,0))::numeric AS stock_output_total,
         COALESCE(stock_return_daily.stock_return_total,0)::numeric AS stock_return_total,
         (
           COALESCE(sales_daily.sales_total,0)
           - COALESCE(returns_daily.returns_total,0)
           - COALESCE(expenses_daily.expenses_total,0)
           - COALESCE(suppliers_daily.supplier_payments_total,0)
         )::numeric AS pure_cash
       FROM days
       LEFT JOIN sales_daily ON sales_daily.day_date = days.day_date
       LEFT JOIN returns_daily ON returns_daily.day_date = days.day_date
       LEFT JOIN expenses_daily ON expenses_daily.day_date = days.day_date
       LEFT JOIN suppliers_daily ON suppliers_daily.day_date = days.day_date
       LEFT JOIN margin_daily ON margin_daily.day_date = days.day_date
       LEFT JOIN stock_daily ON stock_daily.day_date = days.day_date
       LEFT JOIN return_margin_daily ON return_margin_daily.day_date = days.day_date
       LEFT JOIN stock_return_daily ON stock_return_daily.day_date = days.day_date
       ORDER BY days.day_date ASC`,
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
         WHERE ${saleLocalDate} >= bounds.start_date AND ${saleLocalDate} < bounds.end_date
         UNION ALL
         SELECT rl.item_id, rl.item_name, rl.unit_type, -rl.quantity AS quantity, -rl.line_total AS total
         FROM return_lines rl
         JOIN returns r ON r.id = rl.return_id
         CROSS JOIN bounds
         WHERE ${returnLocalDate} >= bounds.start_date AND ${returnLocalDate} < bounds.end_date
       ) movement
       GROUP BY movement.item_id, movement.item_name, movement.unit_type
       HAVING SUM(movement.quantity) > 0 OR SUM(movement.total) > 0
       ORDER BY total DESC, quantity DESC
       LIMIT 10`,
      params
    ),
  ]);

  const totals = dailyRows.rows.reduce((sum, row) => ({
    sales_total: sum.sales_total + Number(row.sales_total || 0),
    sales_count: sum.sales_count + Number(row.sales_count || 0),
    returns_total: sum.returns_total + Number(row.returns_total || 0),
    returns_count: sum.returns_count + Number(row.returns_count || 0),
    expenses_total: sum.expenses_total + Number(row.expenses_total || 0),
    expenses_count: sum.expenses_count + Number(row.expenses_count || 0),
    supplier_payments_total: sum.supplier_payments_total + Number(row.supplier_payments_total || 0),
    supplier_payments_count: sum.supplier_payments_count + Number(row.supplier_payments_count || 0),
    gross_margin_total: sum.gross_margin_total + Number(row.gross_margin_total || 0),
    stock_output_total: sum.stock_output_total + Number(row.stock_output_total || 0),
    stock_return_total: sum.stock_return_total + Number(row.stock_return_total || 0),
    pure_cash: sum.pure_cash + Number(row.pure_cash || 0),
  }), {
    sales_total: 0,
    sales_count: 0,
    returns_total: 0,
    returns_count: 0,
    expenses_total: 0,
    expenses_count: 0,
    supplier_payments_total: 0,
    supplier_payments_count: 0,
    gross_margin_total: 0,
    stock_output_total: 0,
    stock_return_total: 0,
    pure_cash: 0,
  });

  res.json({
    period: 'month',
    timezone: TZ,
    start_date: periodInfo.rows[0].start_date,
    end_date: periodInfo.rows[0].end_date,
    totals,
    days: dailyRows.rows,
    top_sold: topSold.rows,
  });
});

router.get('/summary', authenticate, requirePermission('dashboard'), async (req, res) => {
  const period = selectedPeriod(req.query.period);
  const date = selectedDate(req.query.date);
  const trunc = period;
  const bounds = `
    WITH input AS (
      SELECT COALESCE($2::date, (CURRENT_TIMESTAMP AT TIME ZONE $3)::date) AS selected_date
    ),
    bounds AS (
      SELECT
        date_trunc($1, input.selected_date::timestamp)::timestamp AS start_at,
        (date_trunc($1, input.selected_date::timestamp) + ('1 ' || $1)::interval)::timestamp AS end_at
      FROM input
    )
  `;
  const saleLocalTime = `((s.created_at AT TIME ZONE 'UTC') AT TIME ZONE $3)`;
  const returnLocalTime = `((r.created_at AT TIME ZONE 'UTC') AT TIME ZONE $3)`;
  const purchasePaidLocalTime = `((p.paid_at AT TIME ZONE 'UTC') AT TIME ZONE $3)`;
  const saleInPeriod = `((${saleLocalTime} >= bounds.start_at AND ${saleLocalTime} < bounds.end_at) OR (s.created_at >= bounds.start_at AND s.created_at < bounds.end_at))`;
  const returnInPeriod = `((${returnLocalTime} >= bounds.start_at AND ${returnLocalTime} < bounds.end_at) OR (r.created_at >= bounds.start_at AND r.created_at < bounds.end_at))`;
  const purchaseInPeriod = `(p.paid_at IS NOT NULL AND ((${purchasePaidLocalTime} >= bounds.start_at AND ${purchasePaidLocalTime} < bounds.end_at) OR (p.paid_at >= bounds.start_at AND p.paid_at < bounds.end_at)))`;

  const params = [trunc, date, TZ];
  const [
    periodInfo,
    sales,
    returns,
    expenses,
    supplierPayments,
    grossMargin,
    returnMargin,
    stockOutput,
    stockReturn,
    topSold,
    salesList,
    returnsList,
  ] = await Promise.all([
    db.query(`${bounds} SELECT start_at::date AS start_date, (end_at - interval '1 day')::date AS end_date FROM bounds`, params),
    db.query(`${bounds} SELECT COALESCE(SUM(s.total),0)::numeric AS total, COUNT(s.id)::int AS count FROM sales s, bounds WHERE ${saleInPeriod}`, params),
    db.query(`${bounds} SELECT COALESCE(SUM(r.total),0)::numeric AS total, COUNT(r.id)::int AS count FROM returns r, bounds WHERE ${returnInPeriod}`, params),
    db.query(
      `${bounds}
       SELECT COALESCE(SUM(e.amount),0)::numeric AS total, COUNT(e.id)::int AS count
       FROM expenses e, bounds
       WHERE e.expense_date >= bounds.start_at::date AND e.expense_date < bounds.end_at::date`,
      params
    ),
    db.query(`${bounds} SELECT COALESCE(SUM(p.total_cost),0)::numeric AS total, COUNT(p.id)::int AS count FROM purchases p, bounds WHERE p.paid_status='paid' AND ${purchaseInPeriod}`, params),
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
       ORDER BY total DESC, quantity DESC
       LIMIT 10`,
      params
    ),
    db.query(
      `${bounds}
       SELECT
         s.id,
         s.subtotal,
         s.discount_total,
         s.total,
         s.created_at,
         u.username AS created_by_name,
         COALESCE(json_agg(json_build_object(
           'id', sl.id,
           'item_id', sl.item_id,
           'item_name', sl.item_name,
           'quantity', sl.quantity,
           'unit_type', sl.unit_type,
           'line_total', sl.line_total
         ) ORDER BY sl.id) FILTER (WHERE sl.id IS NOT NULL), '[]') AS lines
       FROM sales s
       LEFT JOIN users u ON u.id = s.created_by
       LEFT JOIN sale_lines sl ON sl.sale_id = s.id
       CROSS JOIN bounds
       WHERE ${saleInPeriod}
       GROUP BY s.id, u.username
       ORDER BY s.created_at DESC
       LIMIT 100`,
      params
    ),
    db.query(
      `${bounds}
       SELECT
         r.id,
         r.subtotal,
         r.total,
         r.created_at,
         u.username AS created_by_name,
         COALESCE(json_agg(json_build_object(
           'id', rl.id,
           'item_id', rl.item_id,
           'item_name', rl.item_name,
           'quantity', rl.quantity,
           'unit_type', rl.unit_type,
           'line_total', rl.line_total
         ) ORDER BY rl.id) FILTER (WHERE rl.id IS NOT NULL), '[]') AS lines
       FROM returns r
       LEFT JOIN users u ON u.id = r.created_by
       LEFT JOIN return_lines rl ON rl.return_id = r.id
       CROSS JOIN bounds
       WHERE ${returnInPeriod}
       GROUP BY r.id, u.username
       ORDER BY r.created_at DESC
       LIMIT 100`,
      params
    ),
  ]);

  const salesTotal = Number(sales.rows[0].total || 0);
  const returnsTotal = Number(returns.rows[0].total || 0);
  const expensesTotal = Number(expenses.rows[0].total || 0);
  const supplierPaymentTotal = Number(supplierPayments.rows[0].total || 0);
  const grossMarginTotal = Number(grossMargin.rows[0].total || 0);
  const returnMarginTotal = Number(returnMargin.rows[0].total || 0);
  const stockOutputTotal = Number(stockOutput.rows[0].total || 0);
  const stockReturnTotal = Number(stockReturn.rows[0].total || 0);

  res.json({
    period,
    timezone: TZ,
    start_date: periodInfo.rows[0].start_date,
    end_date: periodInfo.rows[0].end_date,
    sales_total: salesTotal - returnsTotal,
    sales_count: sales.rows[0].count,
    returns_total: returns.rows[0].total,
    returns_count: returns.rows[0].count,
    expenses_total: expenses.rows[0].total,
    expenses_count: expenses.rows[0].count,
    supplier_payments_total: supplierPayments.rows[0].total,
    supplier_payments_count: supplierPayments.rows[0].count,
    gross_margin_total: grossMarginTotal - returnMarginTotal,
    stock_output_total: stockOutputTotal - stockReturnTotal,
    stock_return_total: stockReturn.rows[0].total,
    pure_cash: salesTotal - returnsTotal - expensesTotal - supplierPaymentTotal,
    top_sold: topSold.rows,
    sales: salesList.rows,
    returns: returnsList.rows,
  });
});

module.exports = router;
