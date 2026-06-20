import { useEffect, useState } from 'react'
import { AlertTriangle, Plus, ShoppingBag } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApi } from '../hooks/useApi'
import { dateOnly, money, qty } from '../lib/format'

export default function PurchasesPage() {
  const api = useApi()
  const [purchases, setPurchases] = useState([])
  const [items, setItems] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [form, setForm] = useState({ supplier_id: '', paid_status: 'unpaid', notes: '', item_id: '', quantity: 1, unit_cost: 0 })

  const fetch = async () => {
    const [p, i, s] = await Promise.all([api.get('/api/purchases'), api.get('/api/items?limit=500'), api.get('/api/suppliers')])
    setPurchases(p.data)
    setItems(i.data.items)
    setSuppliers(s.data)
  }

  useEffect(() => { fetch().catch(() => toast.error('Failed to load purchases')) }, [])

  const create = async (e) => {
    e.preventDefault()
    try {
      await api.post('/api/purchases', {
        supplier_id: form.supplier_id || null,
        paid_status: form.paid_status,
        notes: form.notes,
        lines: [{ item_id: Number(form.item_id), quantity: Number(form.quantity), unit_cost: Number(form.unit_cost) }],
      })
      toast.success('Purchase recorded and stock increased')
      setForm({ supplier_id: '', paid_status: 'unpaid', notes: '', item_id: '', quantity: 1, unit_cost: 0 })
      fetch()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Purchase failed')
    }
  }

  const markPaid = async (purchase, paid_status) => {
    await api.patch(`/api/purchases/${purchase.id}/payment`, { paid_status })
    toast.success(`Purchase marked ${paid_status}`)
    fetch()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Supplier Purchases</h1>
        <p className="text-sm text-slate-500">Receive stock and track whether the supplier was paid.</p>
      </div>

      <form onSubmit={create} className="bg-white border border-slate-200 rounded-lg p-4 grid md:grid-cols-6 gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Supplier</label>
          <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
            <option value="">No supplier</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">Item</label>
          <select required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.item_id} onChange={e => {
            const item = items.find(x => String(x.id) === e.target.value)
            setForm({ ...form, item_id: e.target.value, unit_cost: item?.cost_price || 0 })
          }}>
            <option value="">Select item</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Qty</label>
          <input required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="number" step="0.001" min="0.001" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Unit cost</label>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="number" step="0.01" min="0" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Payment</label>
          <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.paid_status} onChange={e => setForm({ ...form, paid_status: e.target.value })}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <div className="md:col-span-5">
          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button className="rounded-md bg-emerald-700 text-white px-3 py-2 text-sm font-semibold hover:bg-emerald-800 inline-flex items-center justify-center gap-2">
          <Plus size={15} /> Receive
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Purchase</th>
              <th className="text-left px-4 py-3">Supplier</th>
              <th className="text-left px-4 py-3">Lines</th>
              <th className="text-left px-4 py-3">Total</th>
              <th className="text-left px-4 py-3">Payment</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map(p => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-semibold">#{p.id}</td>
                <td className="px-4 py-3">{p.supplier_name || '-'}</td>
                <td className="px-4 py-3 text-xs">
                  {p.lines.map(line => <p key={line.id}>{line.item_name}: {qty(line.quantity)}</p>)}
                </td>
                <td className="px-4 py-3">{money(p.total_cost)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${p.paid_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-yellow-50 text-yellow-700'}`}>
                    {p.paid_status === 'unpaid' && <AlertTriangle size={12} />} {p.paid_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{dateOnly(p.purchased_at)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => markPaid(p, p.paid_status === 'paid' ? 'unpaid' : 'paid')} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                    Mark {p.paid_status === 'paid' ? 'unpaid' : 'paid'}
                  </button>
                </td>
              </tr>
            ))}
            {!purchases.length && <tr><td colSpan="7" className="py-12 text-center text-slate-400"><ShoppingBag className="mx-auto mb-2" />No purchases yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
