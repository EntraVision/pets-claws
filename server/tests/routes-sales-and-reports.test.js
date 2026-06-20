const assert = require('node:assert/strict');
const path = require('path');
const { test } = require('node:test');

const { loadWithMocks, invokeRoute, createAuthStub } = require('./helpers/router-test-utils');
const posRoutePath = path.join(__dirname, '..', 'routes', 'pos');
const purchasesRoutePath = path.join(__dirname, '..', 'routes', 'purchases');
const dashboardRoutePath = path.join(__dirname, '..', 'routes', 'dashboard');
const reportsRoutePath = path.join(__dirname, '..', 'routes', 'reports');

function createDbClient(handler) {
  return {
    async query(sql, params) {
      return handler(sql, params);
    },
    release() {},
  };
}

test('pos sales create requires at least one line', async () => {
  const router = loadWithMocks(posRoutePath, {
    '../db': { connect: async () => createDbClient(() => ({ rows: [] })) },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'post', '/sales', { body: { lines: [] } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Sale lines are required' });
});

test('pos sales create handles a custom item checkout', async () => {
  const operations = [];
  const router = loadWithMocks(posRoutePath, {
    '../db': {
      connect: async () => createDbClient(async (sql, params) => {
        operations.push(sql);
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.includes('INSERT INTO sales')) {
          return { rows: [{ id: 11, subtotal: 10, discount_total: 0, total: 10, paid_status: 'paid', created_by: 1 }] };
        }
        if (sql.includes('INSERT INTO sale_lines')) return { rows: [] };
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'post', '/sales', {
    body: {
      lines: [{ custom: true, item_name: 'Walk-in', quantity: 2, unit_price: 5, unit_type: 'piece' }],
    },
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, 11);
  assert.equal(operations.some(sql => sql.includes('INSERT INTO sales')), true);
  assert.equal(operations.some(sql => sql.includes('INSERT INTO sale_lines')), true);
});

test('purchases create requires purchase lines', async () => {
  const router = loadWithMocks(purchasesRoutePath, {
    '../db': { connect: async () => createDbClient(() => ({ rows: [] })) },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'post', '/', { body: { lines: [] } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Purchase lines are required' });
});

test('purchases payment patch validates status', async () => {
  const router = loadWithMocks(purchasesRoutePath, {
    '../db': { query: async () => ({ rows: [] }) },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'patch', '/:id/payment', { params: { id: '5' }, body: { paid_status: 'later' } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'paid_status must be paid or unpaid' });
});

test('dashboard summary filters recent sales by the selected period', async () => {
  const queries = [];
  const router = loadWithMocks(dashboardRoutePath, {
    '../db': {
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes('COUNT(*)::int AS total_items')) {
          return { rows: [{ total_items: 3, out_of_stock: 1, low_stock: 1 }] };
        }
        if (sql.includes('COUNT(*)::int AS count, COALESCE(SUM(total_cost),0)::numeric AS total FROM purchases WHERE paid_status=\'unpaid\'')) {
          return { rows: [{ count: 1, total: '18.00' }] };
        }
        if (sql.includes('LIMIT 6')) {
          return { rows: [{ id: 55, total: '9.00', lines: [] }] };
        }
        if (sql.includes('LIMIT 8')) return { rows: [] };
        if (sql.includes('ORDER BY buckets.bucket_at ASC')) return { rows: [] };
        return { rows: [{ total: '0' }] };
      },
    },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'get', '/summary', { query: { period: 'week' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.recent_sales, [{ id: 55, total: '9.00', lines: [] }]);

  const recentSalesQuery = queries.find(entry => entry.sql.includes('LIMIT 6'));
  assert.ok(recentSalesQuery.sql.includes('CROSS JOIN bounds'));
  assert.ok(recentSalesQuery.sql.includes('WHERE'));
  assert.deepEqual(recentSalesQuery.params, ['week', 'Asia/Beirut']);
});

test('reports summary computes pure cash from fetched totals', async () => {
  const router = loadWithMocks(reportsRoutePath, {
    '../db': {
      query: async (sql) => {
        if (sql.includes('start_at::date AS start_date')) return { rows: [{ start_date: '2026-06-13', end_date: '2026-06-13' }] };
        if (sql.includes('COUNT(s.id)::int AS count')) return { rows: [{ total: '25.50', count: 3 }] };
        if (sql.includes('COUNT(e.id)::int AS count')) return { rows: [{ total: '4.25', count: 1 }] };
        if (sql.includes('COUNT(p.id)::int AS count')) return { rows: [{ total: '6.00', count: 1 }] };
        if (sql.includes('gross_margin')) return { rows: [{ total: '5.00' }] };
        if (sql.includes('SUM(sl.quantity)')) return { rows: [{ total: '7.00' }] };
        if (sql.includes('LIMIT 10')) return { rows: [] };
        if (sql.includes('LIMIT 100')) return { rows: [] };
        return { rows: [{ total: '0' }] };
      },
    },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'get', '/summary', { query: { period: 'day', date: '2026-06-13' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.pure_cash, 15.25);
  assert.equal(res.body.sales_count, 3);
});

test('reports monthly returns daily rows and month totals', async () => {
  const router = loadWithMocks(reportsRoutePath, {
    '../db': {
      query: async (sql, params) => {
        assert.deepEqual(params, ['2026-06-01', 'Asia/Beirut']);
        if (sql.includes('SELECT start_date, (end_date - interval')) {
          return { rows: [{ start_date: '2026-06-01', end_date: '2026-06-30' }] };
        }
        if (sql.includes('ORDER BY days.day_date ASC')) {
          return {
            rows: [
              {
                date: '2026-06-01',
                day: 1,
                sales_total: '20.00',
                sales_count: 2,
                expenses_total: '5.00',
                expenses_count: 1,
                supplier_payments_total: '3.00',
                supplier_payments_count: 1,
                gross_margin_total: '8.00',
                stock_output_total: '4.00',
                pure_cash: '12.00',
              },
              {
                date: '2026-06-02',
                day: 2,
                sales_total: '0.00',
                sales_count: 0,
                expenses_total: '2.00',
                expenses_count: 1,
                supplier_payments_total: '0.00',
                supplier_payments_count: 0,
                gross_margin_total: '0.00',
                stock_output_total: '0.00',
                pure_cash: '-2.00',
              },
            ],
          };
        }
        if (sql.includes('LIMIT 10')) return { rows: [{ item_id: 1, item_name: 'Cat Tuna Can', quantity: '4.00', unit_type: 'piece', total: '20.00' }] };
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'get', '/monthly', { query: { month: '2026-06' } });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.start_date, '2026-06-01');
  assert.equal(res.body.end_date, '2026-06-30');
  assert.equal(res.body.days.length, 2);
  assert.equal(res.body.totals.sales_total, 20);
  assert.equal(res.body.totals.expenses_total, 7);
  assert.equal(res.body.totals.pure_cash, 10);
  assert.equal(res.body.top_sold[0].item_name, 'Cat Tuna Can');
});

test('reports monthly requires monthly report permission for staff', async () => {
  const router = loadWithMocks(reportsRoutePath, {
    '../db': { query: async () => { throw new Error('db should not be called'); } },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'get', '/monthly', {
    query: { month: '2026-06' },
    user: {
      id: 2,
      role: 'staff',
      permissions: { dashboard: true, monthly_report: false },
    },
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Insufficient permissions' });
});
