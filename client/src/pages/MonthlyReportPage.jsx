/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpFromLine, CalendarDays, ReceiptText, ShoppingBag, TrendingUp, Wallet } from 'lucide-react'
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
    slate: 'bg-slate-100 text-slate-700',
    teal: 'bg-teal-100 text-teal-700',
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

export default function MonthlyReportPage() {
  const api = useApi()
  const [month, setMonth] = useState(monthInputValue())
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/api/reports/monthly?month=${month}`)
      .then(res => setReport(res.data))
      .catch(() => toast.error('Failed to load monthly report'))
      .finally(() => setLoading(false))
  }, [api, month])

  const totals = report?.totals || {}
  const activeDays = useMemo(
    () => (report?.days || []).filter(day =>
      number(day.sales_total) || number(day.expenses_total) || number(day.supplier_payments_total)
    ).length,
    [report]
  )
  const averageDailySales = activeDays ? number(totals.sales_total) / activeDays : 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Monthly Report</h1>
          <p className="text-sm text-slate-500">Full month view from day 1 through the final day of the selected month.</p>
          <p className="text-xs text-slate-400 mt-1">
            {report ? `${dateOnly(report.start_date)} to ${dateOnly(report.end_date)}` : 'Loading period'} - Asia/Beirut
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
          <CalendarDays size={16} className="text-slate-500" />
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Metric icon={Wallet} label="Pure Cash" value={money(totals.pure_cash)} />
        <Metric icon={ReceiptText} label="Sales Revenue" value={money(totals.sales_total)} />
        <Metric icon={ReceiptText} label="Expenses" value={money(totals.expenses_total)} tone="slate" />
        <Metric icon={ShoppingBag} label="Paid Suppliers" value={money(totals.supplier_payments_total)} tone="yellow" />
        <Metric icon={TrendingUp} label="Gross Margin" value={money(totals.gross_margin_total)} tone="teal" />
        <Metric icon={ArrowUpFromLine} label="Items Sold" value={qty(totals.stock_output_total)} tone="slate" />
        <Metric icon={CalendarDays} label="Active Sales Days" value={activeDays} tone="slate" />
        <Metric icon={TrendingUp} label="Avg Active-Day Sales" value={money(averageDailySales)} tone="teal" />
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold">Top Sold Items</h2>
            <p className="text-xs text-slate-500 mt-0.5">Ranked by sales total for the selected month.</p>
          </div>
          <div className="overflow-hidden">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Item</th>
                  <th className="text-left px-4 py-2 w-36">Quantity</th>
                  <th className="text-right px-4 py-2 w-32">Total</th>
                </tr>
              </thead>
              <tbody>
                {(report?.top_sold || []).map(item => (
                  <tr key={`${item.item_id}-${item.unit_type}`} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium truncate">{item.item_name}</td>
                    <td className="px-4 py-3 text-slate-500">{qty(item.quantity, item.unit_type)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(item.total)}</td>
                  </tr>
                ))}
                {!loading && !report?.top_sold?.length && (
                  <tr><td colSpan="3" className="px-4 py-10 text-center text-slate-400">No sold items in this month</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold">Daily Month Breakdown</h2>
            <p className="text-xs text-slate-500 mt-0.5">Every calendar day is listed, including days with no movement.</p>
          </div>
          <div className="overflow-hidden">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2 w-14">Day</th>
                  <th className="text-left px-3 py-2 w-28">Date</th>
                  <th className="text-left px-3 py-2">Sales</th>
                  <th className="text-left px-3 py-2">Expenses</th>
                  <th className="text-left px-3 py-2">Supplier</th>
                  <th className="text-left px-3 py-2">Margin</th>
                  <th className="text-left px-3 py-2">Sold</th>
                  <th className="text-left px-3 py-2">Cash</th>
                </tr>
              </thead>
              <tbody>
                {(report?.days || []).map(day => (
                  <tr key={day.date} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-semibold">{day.day}</td>
                    <td className="px-3 py-3 text-slate-500">{dateOnly(day.date)}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium">{money(day.sales_total)}</p>
                      <p className="text-xs text-slate-400">{day.sales_count} sales</p>
                    </td>
                    <td className="px-3 py-3">
                      <p>{money(day.expenses_total)}</p>
                      <p className="text-xs text-slate-400">{day.expenses_count} expenses</p>
                    </td>
                    <td className="px-3 py-3">{money(day.supplier_payments_total)}</td>
                    <td className="px-3 py-3">{money(day.gross_margin_total)}</td>
                    <td className="px-3 py-3">{qty(day.stock_output_total)}</td>
                    <td className={`px-3 py-3 font-semibold ${number(day.pure_cash) < 0 ? 'text-red-600' : 'text-slate-900'}`}>{money(day.pure_cash)}</td>
                  </tr>
                ))}
                {loading && <tr><td colSpan="8" className="px-4 py-10 text-center text-slate-400">Loading monthly report...</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
