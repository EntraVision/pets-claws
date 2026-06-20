const assert = require('node:assert/strict');
const path = require('path');
const { test } = require('node:test');

const { loadWithMocks, invokeRoute, createAuthStub } = require('./helpers/router-test-utils');
const itemsRoutePath = path.join(__dirname, '..', 'routes', 'items');

test('items create requires a name', async () => {
  const router = loadWithMocks(itemsRoutePath, {
    '../db': { query: async () => ({ rows: [] }) },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'post', '/', { body: { sku: 'ABC' } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'name is required' });
});

test('items barcode lookup returns 404 for unknown barcode', async () => {
  const router = loadWithMocks(itemsRoutePath, {
    '../db': { query: async () => ({ rows: [] }) },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'get', '/barcode/:barcode', { params: { barcode: '404' } });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Item not found for this barcode' });
});

test('items barcode lookup trims scanned input and matches barcode or sku', async () => {
  const queries = [];
  const item = {
    id: 3,
    name: 'Cat Tuna Can',
    sku: 'CAT-CAN-001',
    barcode: '100000003',
    quantity: 48,
    reorder_warning_quantity: 20,
    unit_type: 'piece',
    sale_price: 1.35,
    status: 'active',
  };
  const router = loadWithMocks(itemsRoutePath, {
    '../db': {
      query: async (sql, params) => {
        queries.push({ sql, params });
        return { rows: [item] };
      },
    },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'get', '/barcode/:barcode', { params: { barcode: ' 100000003 ' } });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, item.id);
  assert.equal(queries[0].params[0], '100000003');
  assert.match(queries[0].sql, /trim\(i\.barcode\) = \$1 OR trim\(i\.sku\) = \$1/);
});

test('items quantity patch requires an adjustment value', async () => {
  const router = loadWithMocks(itemsRoutePath, {
    '../db': { query: async () => ({ rows: [] }) },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'patch', '/:id/quantity', { params: { id: '8' }, body: {} });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'adjustment is required' });
});
