import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarDays,
  CreditCard,
  Plus,
  ReceiptText,
  FileText,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { dateOnly, money, qty } from '../lib/format'

const chartColors = ['#047857', '#0f766e', '#2563eb', '#ca8a04', '#dc2626', '#7c3aed', '#0891b2', '#be123c']

const number = (value) => Number(value || 0)

function saleDateOnly(sale) {
  if (sale?.created_at_display) return String(sale.created_at_display).split(', ').slice(0, 2).join(', ')
  return dateOnly(sale?.created_at)
}

function Metric({ icon: Icon, label, value, tone = 'emerald' }) {
  const colors = {
    emerald: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
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

function SaleItems({ lines = [] }) {
  if (!lines.length) return <span className="text-slate-400">No items</span>
  return (
    <div className="space-y-1">
      {lines.map(line => (
        <div key={line.id} className="flex items-center justify-between gap-3">
          <span className="font-medium text-slate-700">{line.item_name}</span>
          <span className="text-xs text-slate-500">{qty(line.quantity, line.unit_type)}</span>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, kicker, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {kicker && <p className="text-xs text-slate-500 mt-0.5">{kicker}</p>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function TrendChart({ data = [] }) {
  const points = data.length ? data : [{ label: '-', sales: 0, expenses: 0 }]
  const max = Math.max(1, ...points.flatMap(row => [number(row.sales), number(row.expenses)]))
  const width = 640
  const height = 220
  const pad = 28
  const x = (index) => points.length === 1 ? pad : pad + (index * (width - pad * 2)) / (points.length - 1)
  const y = (value) => height - pad - (number(value) / max) * (height - pad * 2)
  const pathFor = (key) => points.map((row, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(row[key])}`).join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56">
        {[0, 0.5, 1].map(level => (
          <line key={level} x1={pad} x2={width - pad} y1={pad + level * (height - pad * 2)} y2={pad + level * (height - pad * 2)} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        <path d={pathFor('expenses')} fill="none" stroke="#ca8a04" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathFor('sales')} fill="none" stroke="#047857" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((row, index) => (
          <g key={`${row.label}-${index}`}>
            <circle cx={x(index)} cy={y(row.sales)} r="4" fill="#047857" />
            <circle cx={x(index)} cy={y(row.expenses)} r="3.5" fill="#ca8a04" />
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>{points[0]?.label}</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-700" /> Sales</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-600" /> Expenses</span>
        </div>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  )
}

function BarComparison({ summary, periodLabel }) {
  const bars = [
    { label: 'Net Sales', value: number(summary?.sales_period), color: 'bg-emerald-700' },
    { label: 'Purchases', value: number(summary?.purchases_period), color: 'bg-yellow-500' },
    { label: 'Expenses', value: number(summary?.expenses_period), color: 'bg-slate-500' },
    { label: 'Margin', value: number(summary?.gross_margin_period), color: 'bg-teal-600' },
  ]
  const max = Math.max(1, ...bars.map(bar => bar.value))
  return (
    <div className="space-y-3">
      {bars.map(bar => (
        <div key={bar.label}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-medium text-slate-700">{bar.label}</span>
            <span className="text-slate-500">{money(bar.value)}</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${Math.max(4, (bar.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-400 pt-1">Financial weight for {periodLabel.toLowerCase()}.</p>
    </div>
  )
}

function DonutChart({ items = [] }) {
  const slices = items.filter(item => number(item.total) > 0).slice(0, 6)
  const total = slices.reduce((sum, item) => sum + number(item.total), 0)
  let offset = 25

  if (!total) {
    return <div className="h-56 grid place-items-center text-sm text-slate-400">No sales mix yet</div>
  }

  return (
    <div className="grid sm:grid-cols-[180px_1fr] gap-4 items-center">
      <svg viewBox="0 0 120 120" className="w-44 h-44 mx-auto -rotate-90">
        <circle cx="60" cy="60" r="42" fill="none" stroke="#e2e8f0" strokeWidth="18" />
        {slices.map((item, index) => {
          const dash = (number(item.total) / total) * 264
          const circle = <circle key={item.item_id} cx="60" cy="60" r="42" fill="none" stroke={chartColors[index]} strokeWidth="18" strokeDasharray={`${dash} ${264 - dash}`} strokeDashoffset={-offset} />
          offset += dash
          return circle
        })}
        <circle cx="60" cy="60" r="29" fill="white" />
      </svg>
      <div className="space-y-2">
        {slices.map((item, index) => (
          <div key={item.item_id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: chartColors[index] }} />
              <span className="truncate font-medium">{item.item_name}</span>
            </span>
            <span className="text-slate-500">{Math.round((number(item.total) / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const periodLabels = {
  day: 'Today',
  week: 'This Week',
  month: 'This Month',
  '3month': '3 Months',
  '6month': '6 Months',
  '9month': '9 Months',
  year: 'This Year',
}

export default function DashboardPage() {
  const api = useApi()
  const [summary, setSummary] = useState(null)
  const [period, setPeriod] = useState('day')

  useEffect(() => {
    api.get(`/api/dashboard/summary?period=${period}`).then(res => setSummary(res.data)).catch(() => {})
  }, [period])

  const quick = [
    { to: '/pos', label: 'Open POS', icon: CreditCard },
    { to: '/inventory', label: 'Add Item', icon: Plus },
    { to: '/purchases', label: 'New Purchase', icon: ShoppingBag },
    { to: '/expenses', label: 'Add Expense', icon: ReceiptText },
    { to: '/reports', label: 'View Daily Report', icon: FileText },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Pets&Claws Dashboard</h1>
          <p className="text-sm text-slate-500">Sales, stock movement, purchases, and expenses tracked in Lebanon time.</p>
          <p className="text-xs text-slate-400 mt-1">Current period: {summary?.period_label || periodLabels[period]} · Asia/Beirut</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {quick.map(({ to, label, icon: Icon }) => (
            <Link
              key={to + label}
              to={to}
              className="w-24 h-20 rounded-md bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 inline-flex flex-col items-center justify-center gap-2 text-center"
            >
              <Icon size={19} />
              <span className="leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 w-fit max-w-full flex-wrap">
        <CalendarDays size={16} className="text-slate-500 shrink-0" />
        {Object.entries(periodLabels).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${
              period === value ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Metric icon={CreditCard} label={`Net Sales ${periodLabels[period]}`} value={money(summary?.sales_period)} />
        <Metric icon={RotateCcw} label={`Returns ${periodLabels[period]}`} value={money(summary?.returns_period)} tone="red" />
        <Metric icon={ShoppingBag} label={`Purchases ${periodLabels[period]}`} value={money(summary?.purchases_period)} tone="yellow" />
        <Metric icon={ReceiptText} label={`Expenses ${periodLabels[period]}`} value={money(summary?.expenses_period)} tone="slate" />
        <Metric icon={TrendingUp} label={`Gross Margin ${periodLabels[period]}`} value={money(summary?.gross_margin_period)} />
        <Metric icon={ArrowDownToLine} label={`Stock Input ${periodLabels[period]}`} value={qty(summary?.stock_input_period)} />
        <Metric icon={ArrowUpFromLine} label={`Stock Output ${periodLabels[period]}`} value={qty(summary?.stock_output_period)} tone="slate" />
        <Metric icon={Boxes} label="Total Stock Items" value={summary?.total_items ?? 0} tone="slate" />
        <Metric icon={AlertTriangle} label="Low Stock" value={summary?.low_stock ?? 0} tone="yellow" />
        <Metric icon={AlertTriangle} label="Out of Stock" value={summary?.out_of_stock ?? 0} tone="red" />
        <Metric icon={ShoppingBag} label="Unpaid Purchases" value={money(summary?.unpaid_purchase_total)} tone="yellow" />
      </div>

      <div className="grid xl:grid-cols-[1.35fr_0.9fr] gap-4">
        <Panel title="Sales Pulse" kicker={`Revenue and expenses across ${periodLabels[period].toLowerCase()}`}>
          <TrendChart data={summary?.trend || []} />
        </Panel>
        <Panel title="Money Split" kicker="Sales, costs, expenses, and margin">
          <BarComparison summary={summary} periodLabel={periodLabels[period]} />
        </Panel>
      </div>

      <div className="grid xl:grid-cols-[0.95fr_1.05fr] gap-4">
        <Panel title="Product Mix" kicker={`Top sold items for ${periodLabels[period].toLowerCase()}`}>
          <DonutChart items={summary?.top_sold_period || []} />
        </Panel>
        <Panel title="Stock Rhythm" kicker="Input versus output movement">
          <div className="grid grid-cols-2 gap-4 h-full">
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4 flex flex-col justify-between min-h-44">
              <ArrowDownToLine className="text-emerald-700" size={24} />
              <div>
                <p className="text-3xl font-bold text-emerald-900">{qty(summary?.stock_input_period)}</p>
                <p className="text-sm text-emerald-700 mt-1">Stock received</p>
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 flex flex-col justify-between min-h-44">
              <ArrowUpFromLine className="text-slate-700" size={24} />
              <div>
                <p className="text-3xl font-bold text-slate-900">{qty(summary?.stock_output_period)}</p>
                <p className="text-sm text-slate-600 mt-1">Stock sold</p>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold">Recent POS Sales</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2">Sale</th>
                <th className="text-left px-4 py-2">Items Sold</th>
                <th className="text-left px-4 py-2">Total</th>
                <th className="text-left px-4 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.recent_sales || []).map(sale => (
                <tr key={sale.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">#{sale.id}</td>
                  <td className="px-4 py-3"><SaleItems lines={sale.lines} /></td>
                  <td className="px-4 py-3">{money(sale.total)}</td>
                  <td className="px-4 py-3 text-slate-500">{saleDateOnly(sale)}</td>
                </tr>
              ))}
              {!summary?.recent_sales?.length && (
                <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-400">No sales yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold">What Sold {periodLabels[period]}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2">Item</th>
                <th className="text-left px-4 py-2">Quantity</th>
                <th className="text-left px-4 py-2">Sales Total</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.top_sold_period || []).map(item => (
                <tr key={`${item.item_id}-${item.unit_type}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{item.item_name}</td>
                  <td className="px-4 py-3">{qty(item.quantity, item.unit_type)}</td>
                  <td className="px-4 py-3">{money(item.total)}</td>
                </tr>
              ))}
              {!summary?.top_sold_period?.length && (
                <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-400">No sold items in this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
