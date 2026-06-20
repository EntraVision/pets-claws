const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
require('dotenv').config();

const app = require('../index');
const db = require('../db');
const { hashPassword } = require('../middleware/auth');

const RUN_ID = `e2e_${Date.now()}`;
const USERNAME = `${RUN_ID}_admin`;
const PASSWORD = '1234';

let server;
let baseUrl;
let token;
let created = {};
let adminToken;

function beirutDateInput(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Beirut',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find(value => value.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function beirutDatePlusMonths(months) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + months);
  return beirutDateInput(date);
}

function beirutDatePlusDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return beirutDateInput(date);
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed with ${response.status}: ${text}`);
  }
  return body;
}

async function cleanup() {
  const users = await db.query('SELECT id FROM users WHERE username LIKE $1', [`${RUN_ID}%`]);
  const userIds = users.rows.map(row => row.id);
  const items = await db.query('SELECT id FROM items WHERE sku LIKE $1 OR barcode LIKE $1', [`${RUN_ID}%`]);
  const itemIds = items.rows.map(row => row.id);

  if (userIds.length) {
    await db.query('DELETE FROM expenses WHERE created_by = ANY($1::int[])', [userIds]);
    await db.query('DELETE FROM purchases WHERE created_by = ANY($1::int[])', [userIds]);
    await db.query('DELETE FROM sales WHERE created_by = ANY($1::int[])', [userIds]);
    await db.query('DELETE FROM item_history WHERE user_id = ANY($1::int[])', [userIds]);
  }

  if (itemIds.length) {
    await db.query('DELETE FROM item_history WHERE item_id = ANY($1::int[])', [itemIds]);
    await db.query('DELETE FROM items WHERE id = ANY($1::int[])', [itemIds]);
  }

  await db.query('DELETE FROM expense_categories WHERE name LIKE $1', [`${RUN_ID}%`]);
  await db.query('DELETE FROM categories WHERE name LIKE $1', [`${RUN_ID}%`]);
  await db.query('DELETE FROM suppliers WHERE name LIKE $1', [`${RUN_ID}%`]);
  await db.query('DELETE FROM users WHERE username LIKE $1', [`${RUN_ID}%`]);
}

async function createAdminUser() {
  const result = await db.query(
    `INSERT INTO users (username, password_hash, role, active)
     VALUES ($1,$2,'admin',true)
     RETURNING id, username, role`,
    [USERNAME, hashPassword(PASSWORD)]
  );
  return result.rows[0];
}

function number(value) {
  return Number(value || 0);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(number(value) * factor) / factor;
}

before(async () => {
  await cleanup();
  await createAdminUser();
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await cleanup();
  await db.end();
  if (server) await new Promise(resolve => server.close(resolve));
});

test('core inventory, POS, purchase, expense, and dashboard calculations work end-to-end', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { username: USERNAME, password: PASSWORD },
    headers: {},
  });
  token = login.token;
  adminToken = login.token;
  assert.equal(login.user.username, USERNAME);

  const category = await request('/api/categories', {
    method: 'POST',
    body: { name: `${RUN_ID} Dog Food`, description: 'Integration category' },
  });
  created.categoryId = category.id;

  const supplier = await request('/api/suppliers', {
    method: 'POST',
    body: {
      name: `${RUN_ID} Happy Paws Wholesale`,
      email: `${RUN_ID}@example.test`,
      phone: '+961000000',
      address: 'Beirut',
    },
  });
  created.supplierId = supplier.id;

  const expenseCategory = await request('/api/expenses/categories', {
    method: 'POST',
    body: { name: `${RUN_ID} Utilities` },
  });
  created.expenseCategoryId = expenseCategory.id;

  const item = await request('/api/items', {
    method: 'POST',
    body: {
      name: `${RUN_ID} Puppy Chicken Cans 24 Pack`,
      sku: `${RUN_ID}-DOG-CAN-024`,
      barcode: `${RUN_ID}-100000002`,
      description: 'Integration item',
      category_id: category.id,
      supplier_id: supplier.id,
      quantity: 24,
      reorder_warning_quantity: 12,
      expiry_date: beirutDatePlusMonths(2),
      expiry_warning_months: 3,
      unit_type: 'piece',
      cost_price: 1.10,
      sale_price: 1.75,
      status: 'active',
      location: 'Main store',
    },
  });
  created.itemId = item.id;
  assert.equal(Number(item.quantity), 24);
  assert.equal(item.stock_state, 'green');
  assert.equal(item.expiry_state, 'warning');
  assert.equal(item.expiry_warning_months, 3);

  const barcodeLookup = await request(`/api/items/barcode/${encodeURIComponent(`${RUN_ID}-100000002`)}`);
  assert.equal(barcodeLookup.id, item.id);
  assert.equal(barcodeLookup.expiry_state, 'warning');
  assert.equal(barcodeLookup.expiry_date, item.expiry_date);

  const baselineDashboard = await request('/api/dashboard/summary?period=day');
  const baselineReport = await request(`/api/reports/summary?period=day&date=${beirutDateInput()}`);

  const sale = await request('/api/pos/sales', {
    method: 'POST',
    body: {
      paid_status: 'paid',
      cart_discount_percent: 10,
      lines: [{ item_id: item.id, quantity: 2, unit_price: 2, discount_percent: 25 }],
    },
  });
  assert.equal(Number(sale.subtotal), 3);
  assert.equal(Number(sale.discount_total), 0.3);
  assert.equal(Number(sale.total), 2.7);

  let itemDetail = await request(`/api/items/${item.id}`);
  assert.equal(Number(itemDetail.quantity), 22);
  assert.equal(itemDetail.history.some(row => row.action === 'pos_sale' && row.notes === `POS sale #${sale.id}`), true);

  const purchase = await request('/api/purchases', {
    method: 'POST',
    body: {
      supplier_id: supplier.id,
      paid_status: 'unpaid',
      notes: `${RUN_ID} purchase`,
      lines: [{ item_id: item.id, quantity: 5, unit_cost: 1.20 }],
    },
  });
  assert.equal(Number(purchase.total_cost), 6);

  itemDetail = await request(`/api/items/${item.id}`);
  assert.equal(Number(itemDetail.quantity), 27);
  assert.equal(Number(itemDetail.cost_price), 1.2);
  assert.equal(itemDetail.has_unpaid_purchase, true);

  const paidPurchase = await request(`/api/purchases/${purchase.id}/payment`, {
    method: 'PATCH',
    body: { paid_status: 'paid' },
  });
  assert.equal(paidPurchase.paid_status, 'paid');

  await request('/api/expenses', {
    method: 'POST',
    body: {
      category_id: expenseCategory.id,
      amount: 4.25,
      expense_date: beirutDateInput(),
      vendor: `${RUN_ID} Electric`,
      notes: 'Integration expense',
    },
  });

  const adjusted = await request(`/api/items/${item.id}/quantity`, {
    method: 'PATCH',
    body: { adjustment: -3, notes: `${RUN_ID} damaged stock` },
  });
  assert.equal(Number(adjusted.quantity), 24);

  itemDetail = await request(`/api/items/${item.id}`);
  assert.equal(itemDetail.history.some(row => row.action === 'quantity_changed' && row.notes === `${RUN_ID} damaged stock`), true);

  const expiredItem = await request(`/api/items/${item.id}`, {
    method: 'PUT',
    body: {
      ...itemDetail,
      expiry_date: beirutDatePlusDays(-1),
      expiry_warning_months: 5,
    },
  });
  assert.equal(expiredItem.expiry_state, 'expired');
  assert.equal(expiredItem.expiry_warning_months, 5);

  const dashboard = await request('/api/dashboard/summary?period=day');
  assert.equal(round(number(dashboard.sales_period) - number(baselineDashboard.sales_period)), 2.7);
  assert.equal(round(number(dashboard.purchases_period) - number(baselineDashboard.purchases_period)), 6);
  assert.equal(round(number(dashboard.expenses_period) - number(baselineDashboard.expenses_period)), 4.25);
  assert.equal(round(number(dashboard.gross_margin_period) - number(baselineDashboard.gross_margin_period)), 0.5);
  assert.equal(round(number(dashboard.stock_input_period) - number(baselineDashboard.stock_input_period), 3), 5);
  assert.equal(round(number(dashboard.stock_output_period) - number(baselineDashboard.stock_output_period), 3), 2);
  assert.equal(number(dashboard.unpaid_purchase_total), number(baselineDashboard.unpaid_purchase_total));
  assert.equal(Array.isArray(dashboard.trend), true);
  assert.ok(dashboard.trend.length > 0, 'dashboard trend should include chart buckets');
  assert.ok(dashboard.trend.some(row => number(row.sales) > 0), 'dashboard trend should include sales activity');

  const recentSale = dashboard.recent_sales.find(row => row.id === sale.id);
  assert.ok(recentSale, 'recent sales should include the POS sale');
  assert.equal(Number(recentSale.total), 2.7);
  assert.match(recentSale.created_at_display, /^[A-Z][a-z]{2} \d{2}, \d{4}$/);
  assert.equal(recentSale.lines[0].item_name, `${RUN_ID} Puppy Chicken Cans 24 Pack`);
  assert.equal(Number(recentSale.lines[0].quantity), 2);
  assert.equal(Number(recentSale.lines[0].line_total), 3);

  const topSold = dashboard.top_sold_period.find(row => row.item_id === item.id);
  assert.ok(topSold, 'top sold should include the sold item');
  assert.equal(topSold.item_name, `${RUN_ID} Puppy Chicken Cans 24 Pack`);
  assert.equal(Number(topSold.quantity), 2);
  assert.equal(Number(topSold.total), 3);

  const dailyReport = await request(`/api/reports/summary?period=day&date=${beirutDateInput()}`);
  assert.equal(round(number(dailyReport.sales_total) - number(baselineReport.sales_total)), 2.7);
  assert.equal(round(number(dailyReport.expenses_total) - number(baselineReport.expenses_total)), 4.25);
  assert.equal(round(number(dailyReport.supplier_payments_total) - number(baselineReport.supplier_payments_total)), 6);
  assert.equal(round(number(dailyReport.pure_cash) - number(baselineReport.pure_cash)), -7.55);
  assert.equal(dailyReport.top_sold.some(row => row.item_id === item.id), true);

  const monthlyReport = await request(`/api/reports/summary?period=month&date=${beirutDateInput()}`);
  assert.ok(number(monthlyReport.sales_total) >= number(dailyReport.sales_total));
  assert.ok(number(monthlyReport.expenses_total) >= number(dailyReport.expenses_total));
  assert.ok(number(monthlyReport.supplier_payments_total) >= number(dailyReport.supplier_payments_total));
  assert.equal(monthlyReport.period, 'month');

  const sales = await request('/api/pos/sales');
  assert.equal(sales.some(row => row.id === sale.id && Number(row.total) === 2.7), true);

  const dailySales = await request(`/api/pos/sales?date=${beirutDateInput()}`);
  const dailySale = dailySales.find(row => row.id === sale.id);
  assert.ok(dailySale, 'daily POS history should include the sale');
  assert.equal(dailySale.lines[0].item_name, `${RUN_ID} Puppy Chicken Cans 24 Pack`);
  assert.equal(Number(dailySale.lines[0].quantity), 2);

  const beforeCustomItem = await request(`/api/items/${item.id}`);
  const customSale = await request('/api/pos/sales', {
    method: 'POST',
    body: {
      lines: [{
        custom: true,
        item_id: null,
        item_name: `${RUN_ID} Other Walk-in Item`,
        barcode: `${RUN_ID}-OTHER-001`,
        quantity: 1,
        unit_type: 'piece',
        unit_price: 7.5,
      }],
    },
  });
  assert.equal(Number(customSale.total), 7.5);

  const afterCustomItem = await request(`/api/items/${item.id}`);
  assert.equal(Number(afterCustomItem.quantity), Number(beforeCustomItem.quantity));

  const customDailySales = await request(`/api/pos/sales?date=${beirutDateInput()}`);
  const customDailySale = customDailySales.find(row => row.id === customSale.id);
  assert.ok(customDailySale, 'daily POS history should include the custom sale');
  assert.equal(customDailySale.lines[0].item_id, null);
  assert.equal(customDailySale.lines[0].item_name, `${RUN_ID} Other Walk-in Item`);
  assert.equal(Number(customDailySale.lines[0].line_total), 7.5);

  const items = await request(`/api/items?q=${encodeURIComponent(RUN_ID)}&limit=10`);
  assert.equal(items.items.some(row => row.id === item.id), true);

  const staff = await request('/api/users', {
    method: 'POST',
    body: { username: `${RUN_ID}_staff`, password: PASSWORD, role: 'staff' },
  });
  assert.equal(staff.role, 'staff');
  assert.equal(staff.permissions.pos, true);
  assert.equal(staff.permissions.dashboard, false);

  const staffLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: `${RUN_ID}_staff`, password: PASSWORD },
  });
  token = staffLogin.token;
  assert.equal(staffLogin.user.role, 'staff');
  assert.equal(staffLogin.user.permissions.pos, true);

  await request('/api/pos/sales');
  await assert.rejects(() => request('/api/dashboard/summary?period=day'), /403/);
  await assert.rejects(() => request('/api/purchases'), /403/);

  token = adminToken;
  const updatedStaff = await request(`/api/users/${staff.id}`, {
    method: 'PATCH',
    body: { permissions: { ...staff.permissions, dashboard: true, purchases: true } },
  });
  assert.equal(updatedStaff.permissions.dashboard, true);
  assert.equal(updatedStaff.permissions.purchases, true);

  const staffLoginAfterUpdate = await request('/api/auth/login', {
    method: 'POST',
    body: { username: `${RUN_ID}_staff`, password: PASSWORD },
  });
  token = staffLoginAfterUpdate.token;
  await request('/api/dashboard/summary?period=day');
  await request('/api/purchases');
});
