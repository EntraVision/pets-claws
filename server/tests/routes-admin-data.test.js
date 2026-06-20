const assert = require('node:assert/strict');
const path = require('path');
const { test } = require('node:test');

const { loadWithMocks, invokeRoute, createAuthStub } = require('./helpers/router-test-utils');
const categoriesRoutePath = path.join(__dirname, '..', 'routes', 'categories');
const suppliersRoutePath = path.join(__dirname, '..', 'routes', 'suppliers');
const expensesRoutePath = path.join(__dirname, '..', 'routes', 'expenses');
const usersRoutePath = path.join(__dirname, '..', 'routes', 'users');

test('categories delete blocks removal when items still use the category', async () => {
  const router = loadWithMocks(categoriesRoutePath, {
    '../db': {
      query: async (sql) => {
        if (sql.includes('SELECT COUNT(*) FROM items')) return { rows: [{ count: '2' }] };
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'delete', '/:id', { params: { id: '4' } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Reassign category items first' });
});

test('suppliers update returns 404 for a missing supplier', async () => {
  const router = loadWithMocks(suppliersRoutePath, {
    '../db': { query: async () => ({ rows: [] }) },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'put', '/:id', { params: { id: '9' }, body: { name: 'Missing' } });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Supplier not found' });
});

test('expenses create requires amount', async () => {
  const router = loadWithMocks(expensesRoutePath, {
    '../db': { query: async () => ({ rows: [] }) },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'post', '/', { body: { vendor: 'Rent' } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'amount is required' });
});

test('expenses delete returns 404 when record does not exist', async () => {
  const router = loadWithMocks(expensesRoutePath, {
    '../db': { query: async () => ({ rows: [] }) },
    '../middleware/auth': createAuthStub(),
  });

  const res = await invokeRoute(router, 'delete', '/:id', { params: { id: '99' } });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Expense not found' });
});

test('users create requires a username', async () => {
  const router = loadWithMocks(usersRoutePath, {
    '../db': { query: async () => ({ rows: [] }) },
    '../middleware/auth': {
      ...createAuthStub(),
      hashPassword: () => 'hashed',
      normalizePermissions: (role, permissions) => ({ role, ...permissions }),
      DEFAULT_STAFF_PERMISSIONS: { pos: true, stock: false, purchases: false, expenses: false, dashboard: false, monthly_report: false, admin: false },
    },
  });

  const res = await invokeRoute(router, 'post', '/', { body: {} });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'username is required' });
});

test('users list allows staff with admin service permission', async () => {
  const router = loadWithMocks(usersRoutePath, {
    '../db': {
      query: async () => ({
        rows: [{ id: 4, username: 'cashier', role: 'staff', permissions: { pos: true, admin: true }, active: true }],
      }),
    },
    '../middleware/auth': {
      ...createAuthStub(),
      hashPassword: () => 'hashed',
      normalizePermissions: (role, permissions) => ({ role, ...permissions }),
      DEFAULT_STAFF_PERMISSIONS: { pos: true, stock: false, purchases: false, expenses: false, dashboard: false, monthly_report: false, admin: false },
    },
  });

  const res = await invokeRoute(router, 'get', '/', {
    user: { id: 2, role: 'staff', permissions: { admin: true } },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].username, 'cashier');
});

test('users patch updates username', async () => {
  const calls = [];
  const router = loadWithMocks(usersRoutePath, {
    '../db': {
      query: async (...args) => {
        calls.push(args);
        if (args[0].includes('SELECT * FROM users')) {
          return { rows: [{ id: 6, username: 'old', role: 'staff', permissions: { pos: true }, active: true }] };
        }
        if (args[0].includes('UPDATE users SET')) {
          return { rows: [{ id: 6, username: args[1][0], role: args[1][3], permissions: JSON.parse(args[1][4]), active: true }] };
        }
        throw new Error(`Unexpected SQL: ${args[0]}`);
      },
    },
    '../middleware/auth': {
      ...createAuthStub(),
      hashPassword: password => `hashed-${password}`,
      normalizePermissions: (role, permissions) => ({ role, ...permissions }),
      DEFAULT_STAFF_PERMISSIONS: { pos: true, stock: false, purchases: false, expenses: false, dashboard: false, monthly_report: false, admin: false },
    },
  });

  const res = await invokeRoute(router, 'patch', '/:id', {
    params: { id: '6' },
    body: { username: '  NewName  ' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.username, 'newname');
  assert.equal(calls[1][1][0], 'newname');
  assert.equal(calls[1][1][2], null);
});

test('users patch allows password change only for the current user', async () => {
  const calls = [];
  const router = loadWithMocks(usersRoutePath, {
    '../db': {
      query: async (...args) => {
        calls.push(args);
        if (args[0].includes('SELECT * FROM users')) {
          return { rows: [{ id: 6, username: 'labib', role: 'admin', permissions: {}, active: true }] };
        }
        if (args[0].includes('UPDATE users SET')) {
          return { rows: [{ id: 6, username: args[1][0], role: args[1][3], permissions: JSON.parse(args[1][4]), active: true }] };
        }
        throw new Error(`Unexpected SQL: ${args[0]}`);
      },
    },
    '../middleware/auth': {
      ...createAuthStub(),
      hashPassword: password => `hashed-${password}`,
      normalizePermissions: (role, permissions) => ({ role, ...permissions }),
      DEFAULT_STAFF_PERMISSIONS: { pos: true, stock: false, purchases: false, expenses: false, dashboard: false, monthly_report: false, admin: false },
    },
  });

  const denied = await invokeRoute(router, 'patch', '/:id', {
    params: { id: '6' },
    user: { id: 7, role: 'admin', permissions: { admin: true } },
    body: { password: '5678' },
  });
  assert.equal(denied.statusCode, 403);

  const allowed = await invokeRoute(router, 'patch', '/:id', {
    params: { id: '6' },
    user: { id: 6, role: 'admin', permissions: { admin: true } },
    body: { password: '5678' },
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(calls.at(-1)[1][2], 'hashed-5678');
});

test('users patch returns 404 when the user does not exist', async () => {
  const calls = [];
  const router = loadWithMocks(usersRoutePath, {
    '../db': {
      query: async (...args) => {
        calls.push(args);
        return { rows: [] };
      },
    },
    '../middleware/auth': {
      ...createAuthStub(),
      hashPassword: () => 'hashed',
      normalizePermissions: (role, permissions) => ({ role, ...permissions }),
      DEFAULT_STAFF_PERMISSIONS: { pos: true, stock: false, purchases: false, expenses: false, dashboard: false, monthly_report: false, admin: false },
    },
  });

  const res = await invokeRoute(router, 'patch', '/:id', { params: { id: '6' }, body: { role: 'staff' } });
  assert.equal(res.statusCode, 404);
  assert.equal(calls.length, 1);
  assert.deepEqual(res.body, { error: 'User not found' });
});
