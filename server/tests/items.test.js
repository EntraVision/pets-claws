const assert = require('node:assert/strict');
const { test } = require('node:test');

const { stockState, expiryState, presentItem } = require('../utils/item-state');
const { quantity } = require('../utils/quantity');

test('stockState reflects inactive, empty, warning, and healthy inventory', () => {
  assert.equal(stockState({ status: 'archived', quantity: 10, reorder_warning_quantity: 5 }), 'neutral');
  assert.equal(stockState({ status: 'active', quantity: 0, reorder_warning_quantity: 5 }), 'red');
  assert.equal(stockState({ status: 'active', quantity: 3, reorder_warning_quantity: 5 }), 'yellow');
  assert.equal(stockState({ status: 'active', quantity: 8, reorder_warning_quantity: 5 }), 'green');
});

test('expiryState reflects missing, expired, warning, and safe expiry windows', () => {
  assert.equal(expiryState({ expiry_date: null, expiry_warning_months: 3 }), 'none');
  assert.equal(expiryState({ expiry_date: '2020-01-01', expiry_warning_months: 3 }), 'expired');
  assert.equal(expiryState({ expiry_date: '2999-01-01', expiry_warning_months: 3 }), 'ok');
  assert.equal(expiryState({ expiry_date: '2999-01-01', expiry_warning_months: 12000 }), 'warning');
});

test('presentItem decorates raw items with normalized date and derived states', () => {
  const item = presentItem({
    id: 7,
    status: 'active',
    quantity: 2,
    reorder_warning_quantity: 5,
    expiry_date: '2999-01-01T10:45:00.000Z',
    expiry_warning_months: 12000,
  });

  assert.equal(item.expiry_date, '2999-01-01');
  assert.equal(item.stock_state, 'yellow');
  assert.equal(item.expiry_state, 'warning');
});

test('quantity validates precision by unit type', () => {
  assert.equal(quantity(2, 'piece'), 2);
  assert.throws(() => quantity(2.5, 'piece'), /whole number/);
  assert.equal(quantity(1.25, 'kg'), 1.25);
  assert.equal(quantity('1.50', 'kg'), 1.5);
  assert.throws(() => quantity('0.008', 'kg'), /at most 2 decimals/);
});
