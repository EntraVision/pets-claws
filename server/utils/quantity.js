function decimalPlaces(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text.includes('e')) return null;
  const decimal = text.split('.')[1];
  return decimal ? decimal.length : 0;
}

function quantity(value, unit = 'piece', label = 'quantity') {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid ${label}`);

  if (unit === 'kg') {
    const places = decimalPlaces(value);
    if (places !== null && places > 2) throw new Error(`${label} for kg can have at most 2 decimals`);
    return Math.round(number * 100) / 100;
  }

  if (!Number.isInteger(number)) throw new Error(`${label} for pieces must be a whole number`);
  return number;
}

module.exports = { quantity };
