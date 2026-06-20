import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Edit, Loader2, SlidersHorizontal, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import AddEditItemModal from '../components/AddEditItemModal'
import StatusBadge from '../components/StatusBadge'
import { useApi } from '../hooks/useApi'
import { dateOnly, dateTime, expiryClasses, money, qty, stockClasses } from '../lib/format'

function ExpiryStatus({ item }) {
  const labels = { none: 'No expiry', ok: 'OK', warning: 'Expiring soon', expired: 'Expired' }
  const state = item.expiry_state || 'none'
  return (
    <div className={`rounded-lg border p-3 ${expiryClasses[state]}`}>
      <p className="text-xs font-medium">Expiry</p>
      <p className="text-lg font-bold">{labels[state] || state}</p>
      <p className="text-xs mt-1">{item.expiry_date ? dateOnly(item.expiry_date) : '-'}</p>
    </div>
  )
}

export default function ItemDetailPage() {
  const { id } = useParams()
  const api = useApi()
  const navigate = useNavigate()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [adjustment, setAdjustment] = useState('')
  const [notes, setNotes] = useState('')

  const fetchItem = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/api/items/${id}`)
      setItem(res.data)
    } catch {
      toast.error('Item not found')
      navigate('/inventory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchItem() }, [id])

  const adjust = async () => {
    if (!Number(adjustment)) return toast.error('Enter a non-zero adjustment')
    try {
      await api.patch(`/api/items/${id}/quantity`, { adjustment: Number(adjustment), notes })
      toast.success('Stock adjusted')
      setAdjustment('')
      setNotes('')
      fetchItem()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Adjustment failed')
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete ${item.name}?`)) return
    await api.delete(`/api/items/${id}`)
    toast.success('Item deleted')
    navigate('/inventory')
  }

  if (loading) return <div className="py-24 text-center text-slate-400"><Loader2 className="animate-spin mx-auto" /></div>
  if (!item) return null

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <button onClick={() => navigate('/inventory')} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-700">
        <ArrowLeft size={16} /> Back to stock
      </button>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{item.name}</h1>
              <p className="text-sm text-slate-500">{item.category_name || 'No category'} - {item.supplier_name || 'No supplier'}</p>
            </div>
            <StatusBadge status={item.status} />
          </div>

          {item.has_unpaid_purchase && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 text-yellow-800 px-3 py-2 text-sm flex items-center gap-2">
              <AlertTriangle size={16} /> This item has stock from unpaid supplier purchases.
            </div>
          )}

          <div className="grid sm:grid-cols-5 gap-3">
            <div className={`rounded-lg border p-3 ${stockClasses[item.stock_state]}`}>
              <p className="text-xs font-medium">Stock state</p>
              <p className="text-lg font-bold capitalize">{item.stock_state}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Quantity</p>
              <p className="text-lg font-bold">{qty(item.quantity, item.unit_type)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Warning threshold</p>
              <p className="text-lg font-bold">{qty(item.reorder_warning_quantity, item.unit_type)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Barcode</p>
              <p className="text-lg font-bold font-mono">{item.barcode || '-'}</p>
            </div>
            <ExpiryStatus item={item} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <p><span className="text-slate-500">SKU:</span> {item.sku || '-'}</p>
            <p><span className="text-slate-500">Unit:</span> {item.unit_type}</p>
            <p><span className="text-slate-500">Cost:</span> {money(item.cost_price)}</p>
            <p><span className="text-slate-500">Sale:</span> {money(item.sale_price)}</p>
            <p><span className="text-slate-500">Location:</span> {item.location || '-'}</p>
            <p><span className="text-slate-500">Expiry warning:</span> {item.expiry_warning_months || 3} months</p>
          </div>
          {item.notes && <p className="text-sm text-slate-600 border-t border-slate-100 pt-3">{item.notes}</p>}

          <div className="flex gap-2">
            <button onClick={() => setShowEdit(true)} className="inline-flex items-center gap-2 rounded-md bg-emerald-700 text-white px-3 py-2 text-sm font-semibold hover:bg-emerald-800">
              <Edit size={15} /> Edit
            </button>
            <button onClick={remove} className="inline-flex items-center gap-2 rounded-md border border-red-200 text-red-600 px-3 py-2 text-sm font-semibold hover:bg-red-50">
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><SlidersHorizontal size={16} /> Adjust stock</h2>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="number" step="0.001" placeholder="Use negative to remove" value={adjustment} onChange={e => setAdjustment(e.target.value)} />
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
            <button onClick={adjust} className="w-full rounded-md bg-slate-900 text-white py-2 text-sm font-semibold hover:bg-slate-800">Apply adjustment</button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 font-semibold">History</div>
        <table className="w-full text-sm">
          <tbody>
            {(item.history || []).map(row => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{row.action}</td>
                <td className="px-4 py-3 text-slate-600">{row.notes || '-'}</td>
                <td className="px-4 py-3 text-slate-500">{row.user_name || '-'}</td>
                <td className="px-4 py-3 text-slate-500">{dateTime(row.created_at)}</td>
              </tr>
            ))}
            {!item.history?.length && <tr><td className="px-4 py-8 text-center text-slate-400">No history yet</td></tr>}
          </tbody>
        </table>
      </div>

      {showEdit && <AddEditItemModal item={item} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); fetchItem(); toast.success('Item saved') }} />}
    </div>
  )
}
