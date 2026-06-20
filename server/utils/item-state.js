function stockState(item) {
  if (item.status !== 'active') return 'neutral';
  const quantity = Number(item.quantity);
  const warning = Number(item.reorder_warning_quantity);
  if (quantity <= 0) return 'red';
  if (quantity <= warning) return 'yellow';
  return 'green';
}

function dateKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function addMonths(date, months) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

function expiryState(item) {
  const expiry = dateKey(item.expiry_date);
  if (!expiry) return 'none';
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Beirut',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const today = new Date(`${todayKey}T00:00:00Z`);
  const expiryDate = new Date(`${expiry}T00:00:00Z`);
  if (expiryDate < today) return 'expired';
  const warningDate = addMonths(today, Number(item.expiry_warning_months || 3));
  if (expiryDate <= warningDate) return 'warning';
  return 'ok';
}

function presentItem(item) {
  return {
    ...item,
    expiry_date: dateKey(item.expiry_date),
    stock_state: stockState(item),
    expiry_state: expiryState(item),
  };
}

module.exports = { stockState, dateKey, addMonths, expiryState, presentItem };
