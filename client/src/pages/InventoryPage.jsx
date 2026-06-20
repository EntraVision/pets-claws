import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Edit, Eye, Plus, Search, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import AddEditItemModal from '../components/AddEditItemModal'
import StatusBadge from '../components/StatusBadge'
import { useApi } from '../hooks/useApi'
import { dateOnly, expiryClasses, money, qty, stockClasses } from '../lib/format'

function StockPill({ state }) {
  const labels = { red: 'Red', yellow: 'Yellow', green: 'Green', neutral: 'Neutral' }
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${stockClasses[state]}`}>{labels[state] || state}</span>
}

function ExpiryPill({ item }) {
  const labels = { none: 'No expiry', ok: 'OK', warning: 'Expiring soon', expired: 'Expired' }
  const state = item.expiry_state || 'none'
  return (
    <div className="space-y-1">
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${expiryClasses[state]}`}>{labels[state] || state}</span>
      <p className="text-xs text-slate-500">{item.expiry_date ? dateOnly(item.expiry_date) : '-'}</p>
    </div>
  )
}

export default function InventoryPage() {
  const api = useApi()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [filters, setFilters] = useState({ q: '', stock: '', category_id: '' })

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: 200 })
    Object.entries(filters).forEach(([key, value]) => value && params.append(key, value))
    try {
      const res = await api.get(`/api/items?${params}`)
      setItems(res.data.items)
    } catch {
      toast.error('Failed to load stock')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { fetchItems() }, [fetchItems])
  useEffect(() => { api.get('/api/categories').then(res => setCategories(res.data)).catch(() => {}) }, [])

  const remove = async (item) => {
    if (!window.confirm(`Delete ${item.name}?`)) return
    try {
      await api.delete(`/api/items/${item.id}`)
      toast.success('Item deleted')
      fetchItems()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Stock Control</h1>
          <p className="text-sm text-slate-500">Barcode, quantities, warning levels, sale prices, and supplier payment warnings.</p>
        </div>
        <button onClick={() => setModal('add')} className="inline-flex items-center gap-2 bg-emerald-700 text-white px-3 py-2 rounded-md text-sm font-semibold hover:bg-emerald-800">
          <Plus size={16} /> Add Item
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-3 grid md:grid-cols-[1fr_180px_180px] gap-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm"
            placeholder="Search name, SKU, or barcode"
            value={filters.q}
            onChange={e => setFilters({ ...filters, q: e.target.value })}
          />
        </div>
        <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={filters.stock} onChange={e => setFilters({ ...filters, stock: e.target.value })}>
          <option value="">All stock states</option>
          <option value="red">Red</option>
          <option value="yellow">Yellow</option>
          <option value="green">Green</option>
        </select>
        <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={filters.category_id} onChange={e => setFilters({ ...filters, category_id: e.target.value })}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">Item</th>
                <th className="text-left px-4 py-3">Barcode</th>
                <th className="text-left px-4 py-3">Stock</th>
                <th className="text-left px-4 py-3">Warning</th>
                <th className="text-left px-4 py-3">Expiry</th>
                <th className="text-left px-4 py-3">Prices</th>
                <th className="text-left px-4 py-3">Supplier</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.category_name || 'No category'} {item.sku ? `- ${item.sku}` : ''}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{item.barcode || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StockPill state={item.stock_state} />
                      <span className="font-semibold">{qty(item.quantity, item.unit_type)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">Warn under {qty(item.reorder_warning_quantity, item.unit_type)}</td>
                  <td className="px-4 py-3"><ExpiryPill item={item} /></td>
                  <td className="px-4 py-3 text-xs">
                    <p>Sale {money(item.sale_price)}</p>
                    <p className="text-slate-500">Cost {money(item.cost_price)}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p>{item.supplier_name || '-'}</p>
                    {item.has_unpaid_purchase && (
                      <p className="inline-flex items-center gap-1 mt-1 text-yellow-700"><AlertTriangle size={12} /> unpaid stock</p>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => navigate(`/inventory/${item.id}`)} className="p-1.5 rounded hover:bg-emerald-50 text-slate-500 hover:text-emerald-700"><Eye size={15} /></button>
                      <button onClick={() => setModal(item)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><Edit size={15} /></button>
                      <button onClick={() => remove(item)} className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-600"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr><td colSpan="9" className="text-center py-12 text-slate-400">No stock items found</td></tr>
              )}
              {loading && (
                <tr><td colSpan="9" className="text-center py-12 text-slate-400">Loading stock...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <AddEditItemModal
          item={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchItems(); toast.success('Stock saved') }}
        />
      )}
    </div>
  )
}
