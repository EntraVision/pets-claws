const styles = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  inactive: 'bg-slate-100 text-slate-600 border-slate-200',
  discontinued: 'bg-slate-100 text-slate-500 border-slate-200',
}

export default function StatusBadge({ status = 'active' }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${styles[status] || styles.inactive}`}>
      {status}
    </span>
  )
}
