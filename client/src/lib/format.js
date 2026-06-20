export const money = (value) =>
  `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const LEBANON_TIME_ZONE = 'Asia/Beirut'

export const localDateInputValue = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LEBANON_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type) => parts.find(part => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

const dbTimestamp = (value) => {
  if (!value || typeof value !== 'string') return value
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return value
  return `${value}Z`
}

export const dateTime = (value) =>
  value
    ? new Date(dbTimestamp(value)).toLocaleString(undefined, {
        timeZone: LEBANON_TIME_ZONE,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-'

export const dateOnly = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        timeZone: LEBANON_TIME_ZONE,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '-'

export const dateInputValue = (value) => value ? String(value).slice(0, 10) : ''

export const qty = (value, unit = 'piece') => {
  const number = Number(value || 0)
  return `${number.toLocaleString(undefined, {
    minimumFractionDigits: unit === 'kg' ? 2 : 0,
    maximumFractionDigits: unit === 'kg' ? 2 : 0,
  })} ${unit === 'kg' ? 'kg' : 'pcs'}`
}

export const stockClasses = {
  red: 'bg-red-50 text-red-700 border-red-200',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  neutral: 'bg-slate-100 text-slate-500 border-slate-200',
}

export const expiryClasses = {
  none: 'bg-slate-100 text-slate-500 border-slate-200',
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
}
