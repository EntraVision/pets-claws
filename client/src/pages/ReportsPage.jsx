/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, ReceiptText, RotateCcw, ShoppingBag, TrendingUp, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApi } from '../hooks/useApi'
import { dateOnly, localDateInputValue, money, qty } from '../lib/format'

const number = (value) => Number(value || 0)

function monthInputValue(date = new Date()) {
  return localDateInputValue(date).slice(0, 7)
}

function Metric({ icon: Icon, label, value, tone = 'emerald' }) {
  const colors = {
    emerald: 'bg-emerald-100 text-emerald-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
  }
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-md grid place-items-center shrink-0 ${colors[tone]}`}><Icon size={20} /></div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-slate-900 truncate">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

function comparisonState(difference) {
  if (difference === null) return { label: 'Enter drawer cash', tone: 'slate', icon: Wallet }
  if (Math.abs(difference) < 0.01) return { label: 'Drawer matches', tone: 'emerald', icon: CheckCircle2 }
  if (difference > 0) return { label: 'Drawer over', tone: 'yellow', icon: AlertTriangle }
  return { label: 'Drawer short', tone: 'red', icon: AlertTriangle }
}

export default function ReportsPage() {
  const api = useApi()
  const [period, setPeriod] = useState('day')
  const [date, setDate] = useState(localDateInputValue())
  const [month, setMonth] = useState(monthInputValue())
  const [cashDrawer, setCashDrawer] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  const reportDate = period === 'month' ? `${month}-01` : date

  useEffect(() => {
    setLoading(true)
    api.get(`/api/reports/summary?period=${period}&date=${reportDate}`)
      .then(res => setReport(res.data))
      .catch(() => toast.error('Failed to load report'))
      .finally(() => setLoading(false))
  }, [api, period, reportDate])

  const drawerValue = cashDrawer === '' ? null : Number(cashDrawer)
  const expectedCash = number(report?.pure_cash)
  const difference = drawerValue === null || Number.isNaN(drawerValue) ? null : drawerValue - expectedCash
  const state = comparisonState(difference)
  const StateIcon = state.icon

  const periodLabel = useMemo(() => {
    if (!report) return period === 'day' ? dateOnly(reportDate) : month
    if (period === 'day') return dateOnly(report.start_date)
    return `${dateOnly(report.start_date)} to ${dateOnly(report.end_date)}`
  }, [period, report, reportDate, month])
  const activityRows = useMemo(
    () => [
      ...(report?.sales || []).map(sale => ({ ...sale, activity_type: 'sale' })),
      ...(report?.returns || []).map(returned => ({ ...returned, activity_type: 'return' })),
    ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
    [report]
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-slate-500">Daily and monthly sales, expenses, supplier payments, and cash drawer checks.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
          <CalendarDays size={16} className="text-slate-500" />
          <button onClick={() => setPeriod('day')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${period === 'day' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Daily</button>
          <button onClick={() => setPeriod('month')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${period === 'month' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Monthly</button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 grid md:grid-cols-[220px_220px_1fr] gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{period === 'day' ? 'Report date' : 'Report month'}</label>
          {period === 'day' ? (
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          ) : (
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Cash in drawer</label>
          <input type="number" step="0.01" min="0" value={cashDrawer} onChange={e => setCashDrawer(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Optional" />
        </div>
        <div className={`rounded-md border p-3 ${state.tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : state.tone === 'yellow' ? 'border-yellow-200 bg-yellow-50 text-yellow-800' : state.tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
          <div className="flex items-center gap-2 font-semibold"><StateIcon size={17} /> {state.label}</div>
          <p className="text-sm mt-1">Expected cash: {money(expectedCash)}{difference !== null ? ` · Difference: ${money(difference)}` : ''}</p>
        </div>
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-2">Report period: {periodLabel} · Asia/Beirut</p>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Metric icon={Wallet} label="Pure Cash" value={money(report?.pure_cash)} />
          <Metric icon={ReceiptText} label="Net Sales Revenue" value={money(report?.sales_total)} />
          <Metric icon={RotateCcw} label="Returns" value={money(report?.returns_total)} tone="red" />
          <Metric icon={ReceiptText} label="Expenses" value={money(report?.expenses_total)} tone="slate" />
          <Metric icon={ShoppingBag} label="Paid Suppliers" value={money(report?.supplier_payments_total)} tone="yellow" />
          <Metric icon={TrendingUp} label="Gross Margin" value={money(report?.gross_margin_total)} />
          <Metric icon={ShoppingBag} label="Items Sold" value={qty(report?.stock_output_total)} tone="slate" />
          <Metric icon={RotateCcw} label="Items Returned" value={qty(report?.stock_return_total)} tone="red" />
          <Metric icon={ReceiptText} label="Sales Count" value={report?.sales_count ?? 0} tone="slate" />
          <Metric icon={RotateCcw} label="Return Count" value={report?.returns_count ?? 0} tone="slate" />
          <Metric icon={ReceiptText} label="Expense Count" value={report?.expenses_count ?? 0} tone="slate" />
        </div>
      </div>

      <div className="grid xl:grid-cols-[0.9fr_1.1fr] gap-4">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold">Top Sold Items</h2>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {(report?.top_sold || []).map(item => (
                <tr key={`${item.item_id}-${item.unit_type}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{item.item_name}</td>
                  <td className="px-4 py-3 text-slate-500">{qty(item.quantity, item.unit_type)}</td>
                  <td className="px-4 py-3 text-right">{money(item.total)}</td>
                </tr>
              ))}
              {!loading && !report?.top_sold?.length && <tr><td className="px-4 py-10 text-center text-slate-400" colSpan="3">No sold items in this period</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold">Sales</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Sale</th>
                  <th className="text-left px-4 py-2">Items</th>
                  <th className="text-left px-4 py-2">Total</th>
                  <th className="text-left px-4 py-2">Cashier</th>
                </tr>
              </thead>
              <tbody>
                {activityRows.map(row => (
                  <tr key={`${row.activity_type}-${row.id}`} className={`border-t border-slate-100 align-top ${row.activity_type === 'return' ? 'bg-red-50/35' : ''}`}>
                    <td className={`px-4 py-3 font-semibold ${row.activity_type === 'return' ? 'text-red-700' : ''}`}>
                      {row.activity_type === 'return' ? `Return #${row.id}` : `#${row.id}`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {(row.lines || []).map(line => (
                          <div key={line.id} className="flex justify-between gap-3">
                            <span className="font-medium">{line.item_name}</span>
                            <span className={`text-xs ${row.activity_type === 'return' ? 'text-red-600' : 'text-slate-500'}`}>
                              {row.activity_type === 'return' ? '-' : ''}{qty(line.quantity, line.unit_type)} - {row.activity_type === 'return' ? '-' : ''}{money(line.line_total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className={`px-4 py-3 font-semibold ${row.activity_type === 'return' ? 'text-red-700' : ''}`}>
                      {row.activity_type === 'return' ? '-' : ''}{money(row.total)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{row.created_by_name || '-'}</td>
                  </tr>
                ))}
                {!loading && !activityRows.length && <tr><td className="px-4 py-10 text-center text-slate-400" colSpan="4">No sales or returns in this period</td></tr>}
                {loading && <tr><td className="px-4 py-10 text-center text-slate-400" colSpan="4">Loading report...</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
