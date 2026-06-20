export const quantityStep = (unit) => unit === 'kg' ? '0.01' : '1'

export const normalizeQuantity = (value, unit) => {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return 0
  return unit === 'kg' ? Math.round(number * 100) / 100 : Math.round(number)
}

export const sanitizeQuantityInput = (value, unit, { allowNegative = false } = {}) => {
  const sign = allowNegative ? '-?' : ''
  const pattern = unit === 'kg'
    ? new RegExp(`^${sign}\\d*(\\.\\d{0,2})?$`)
    : new RegExp(`^${sign}\\d*$`)
  return pattern.test(value) ? value : null
}

export const quantityInputProps = (unit, min = 0) => ({
  type: 'number',
  step: quantityStep(unit),
  min,
})
