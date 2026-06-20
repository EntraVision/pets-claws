import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { dateInputValue } from '../lib/format'

const empty = {
  name: '', sku: '', barcode: '', description: '', category_id: '', supplier_id: '',
  quantity: 0, reorder_warning_quantity: 5, expiry_date: '', expiry_warning_months: 3, unit_type: 'piece',
  cost_price: 0, sale_price: 0, status: 'active', location: '', notes: '', image_url: '',
}

export default function AddEditItemModal({ item, onClose, onSaved }) {
  const api = useApi()
  const [form, setForm] = useState(item ? {
    ...empty,
    ...item,
    category_id: item.category_id || '',
    supplier_id: item.supplier_id || '',
    expiry_date: dateInputValue(item.expiry_date),
    expiry_warning_months: item.expiry_warning_months || 3,
  } : empty)
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.get('/api/categories'), api.get('/api/suppliers')])
      .then(([c, s]) => { setCategories(c.data); setSuppliers(s.data) })
      .catch(() => {})
  }, [])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const input = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'
  const label = 'block text-xs font-medium text-slate-600 mb-1'

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      ...form,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      quantity: Number(form.quantity),
      reorder_warning_quantity: Number(form.reorder_warning_quantity),
      expiry_date: form.expiry_date || null,
      expiry_warning_months: Number(form.expiry_warning_months || 3),
      cost_price: Number(form.cost_price || 0),
      sale_price: Number(form.sale_price || 0),
    }
    try {
      if (item) await api.put(`/api/items/${item.id}`, payload)
      else await api.post('/api/items', payload)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold">{item ? 'Edit Stock Item' : 'Add Stock Item'}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 overflow-y-auto space-y-4">
          {error && <div className="rounded-md border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className={label}>Item name</label>
              <input className={input} value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div>
              <label className={label}>Barcode</label>
              <input className={input} value={form.barcode || ''} onChange={e => set('barcode', e.target.value)} />
            </div>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <label className={label}>SKU</label>
              <input className={input} value={form.sku || ''} onChange={e => set('sku', e.target.value)} />
            </div>
            <div>
              <label className={label}>Unit</label>
              <select className={input} value={form.unit_type} onChange={e => set('unit_type', e.target.value)}>
                <option value="piece">Pieces</option>
                <option value="kg">Kg</option>
              </select>
            </div>
            <div>
              <label className={label}>Quantity</label>
              <input className={input} type="number" step="0.001" min="0" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
            <div>
              <label className={label}>Warn under</label>
              <input className={input} type="number" step="0.001" min="0" value={form.reorder_warning_quantity} onChange={e => set('reorder_warning_quantity', e.target.value)} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={label}>Expiry date</label>
              <input className={input} type="date" value={form.expiry_date || ''} onChange={e => set('expiry_date', e.target.value)} />
            </div>
            <div>
              <label className={label}>Expiry warning months</label>
              <input className={input} type="number" step="1" min="0" value={form.expiry_warning_months} onChange={e => set('expiry_warning_months', e.target.value)} />
            </div>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <label className={label}>Cost price</label>
              <input className={input} type="number" step="0.01" min="0" value={form.cost_price} onChange={e => set('cost_price', e.target.value)} />
            </div>
            <div>
              <label className={label}>Sale price</label>
              <input className={input} type="number" step="0.01" min="0" value={form.sale_price} onChange={e => set('sale_price', e.target.value)} />
            </div>
            <div>
              <label className={label}>Category</label>
              <select className={input} value={form.category_id || ''} onChange={e => set('category_id', e.target.value)}>
                <option value="">None</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Supplier</label>
              <select className={input} value={form.supplier_id || ''} onChange={e => set('supplier_id', e.target.value)}>
                <option value="">None</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className={label}>Status</label>
              <select className={input} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="discontinued">Discontinued</option>
              </select>
            </div>
            <div>
              <label className={label}>Location</label>
              <input className={input} value={form.location || ''} onChange={e => set('location', e.target.value)} />
            </div>
            <div>
              <label className={label}>Image URL</label>
              <input className={input} value={form.image_url || ''} onChange={e => set('image_url', e.target.value)} />
            </div>
          </div>
          <div>
            <label className={label}>Notes</label>
            <textarea className={input} rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
        </form>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-md bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-60 flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} Save Item
          </button>
        </div>
      </div>
    </div>
  )
}
