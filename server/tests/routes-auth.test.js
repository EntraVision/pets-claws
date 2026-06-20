const assert = require('node:assert/strict');
const path = require('path');
const { test } = require('node:test');

const { loadWithMocks, invokeRoute } = require('./helpers/router-test-utils');
const authRoutePath = path.join(__dirname, '..', 'routes', 'auth');
const { verifyPassword } = require('../middleware/auth');

test('verifyPassword accepts simple stored passwords', () => {
  assert.equal(verifyPassword('12345', '12345'), true);
  assert.equal(verifyPassword('wrong', '12345'), false);
});

test('auth login rejects missing credentials', async () => {
  const router = loadWithMocks(authRoutePath, {
    '../db': { query: async () => { throw new Error('db should not be called'); } },
    '../middleware/auth': {
      authenticate: (req, res, next) => next(),
      createToken: () => 'token',
      verifyPassword: () => true,
      normalizePermissions: value => value,
    },
  });

  const res = await invokeRoute(router, 'post', '/login', { body: { username: '', password: '' } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'username and password are required' });
});

test('auth login lowercases username and returns token', async () => {
  const calls = [];
  const router = loadWithMocks(authRoutePath, {
    '../db': {
      query: async (...args) => {
        calls.push(args);
        return { rows: [{ id: 7, username: 'admin', password_hash: 'hash', role: 'staff', permissions: { pos: true }, active: true }] };
      },
    },
    '../middleware/auth': {
      authenticate: (req, res, next) => next(),
      createToken: () => 'signed-token',
      verifyPassword: () => true,
      normalizePermissions: (_role, permissions) => ({ pos: true, ...permissions }),
    },
  });

  const res = await invokeRoute(router, 'post', '/login', { body: { username: '  AdMiN ', password: 'secret' } });
  assert.equal(res.statusCode, 200);
  assert.equal(calls[0][1][0], 'admin');
  assert.equal(res.body.token, 'signed-token');
  assert.equal(res.body.user.username, 'admin');
});

test('auth me returns authenticated user', async () => {
  const user = { id: 3, username: 'cashier', role: 'staff', permissions: { pos: true } };
  const router = loadWithMocks(authRoutePath, {
    '../db': { query: async () => ({ rows: [] }) },
    '../middleware/auth': {
      authenticate: (req, res, next) => {
        req.user = user;
        next();
      },
      createToken: () => 'token',
      verifyPassword: () => true,
      normalizePermissions: value => value,
    },
  });

  const res = await invokeRoute(router, 'get', '/me', { user: null });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { user });
});
