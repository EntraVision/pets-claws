import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Barcode, CalendarDays, Minus, PackagePlus, Plus, ScanLine, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApi } from '../hooks/useApi'
import { dateOnly, localDateInputValue, money, qty } from '../lib/format'
import { normalizeQuantity, quantityInputProps, sanitizeQuantityInput } from '../lib/quantity'

export default function POSPage() {
  const api = useApi()
  const inputRef = useRef(null)
  const [barcode, setBarcode] = useState('')
  const [cart, setCart] = useState([])
  const [cartDiscount, setCartDiscount] = useState(0)
  const [checkingOut, setCheckingOut] = useState(false)
  const [historyDate, setHistoryDate] = useState(localDateInputValue())
  const [salesHistory, setSalesHistory] = useState([])
  const [showOther, setShowOther] = useState(false)
  const [otherItem, setOtherItem] = useState({ barcode: '', name: 'Other', quantity: 1, unit_price: '', unit_type: 'piece' })

  const fetchSalesHistory = async () => {
    const res = await api.get(`/api/pos/sales?date=${historyDate}`)
    setSalesHistory(res.data)
  }

  useEffect(() => {
    fetchSalesHistory().catch(() => toast.error('Failed to load sales history'))
  }, [historyDate])

  const addItemToCart = useCallback((item) => {
    setCart(prev => {
      const existing = prev.find(line => line.item_id === item.id)
      const step = item.unit_type === 'kg' ? 0.25 : 1
      if (existing) {
        const nextQuantity = normalizeQuantity(Number(existing.quantity) + step, item.unit_type)
        if (nextQuantity > Number(existing.available)) {
          toast.error(`Insufficient stock for ${existing.name}`)
          return prev
        }
        return prev.map(line => line.item_id === item.id ? { ...line, quantity: nextQuantity } : line)
      }
      if (step > Number(item.quantity)) {
        toast.error(`Insufficient stock for ${item.name}`)
        return prev
      }
      return [...prev, { cart_id: `item-${item.id}`, item_id: item.id, name: item.name, barcode: item.barcode, unit_type: item.unit_type, available: Number(item.quantity), unit_price: Number(item.sale_price), quantity: step, discount: 0 }]
    })
  }, [])

  const lookupAndAddBarcode = useCallback(async (code) => {
    const res = await api.get(`/api/items/barcode/${encodeURIComponent(code)}`)
    addItemToCart(res.data)
  }, [api, addItemToCart])

  useEffect(() => {
    const code = barcode.trim()
    if (!code) return undefined

    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        await lookupAndAddBarcode(code)
        if (!cancelled) {
          setBarcode('')
          inputRef.current?.focus()
        }
      } catch {
        // Keep typing quiet; the Add button still reports invalid barcodes explicitly.
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [barcode, lookupAndAddBarcode])

  const addByBarcode = async (e) => {
    e.preventDefault()
    const code = barcode.trim()
    if (!code) return
    try {
      await lookupAndAddBarcode(code)
      setBarcode('')
      inputRef.current?.focus()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Barcode not found')
    }
  }

  const openOther = () => {
    setOtherItem({ barcode: barcode.trim(), name: 'Other', quantity: 1, unit_price: '', unit_type: 'piece' })
    setShowOther(true)
  }

  const addOther = (e) => {
    e.preventDefault()
    const unitPrice = Number(otherItem.unit_price || 0)
    const quantity = normalizeQuantity(otherItem.quantity, otherItem.unit_type)
    if (!quantity || quantity <= 0) return toast.error('Enter a valid quantity')
    if (!unitPrice || unitPrice <= 0) return toast.error('Enter a custom price')

    setCart(prev => [
      ...prev,
      {
        cart_id: `custom-${Date.now()}-${prev.length}`,
        custom: true,
        item_id: null,
        name: otherItem.name.trim() || 'Other',
        barcode: otherItem.barcode.trim(),
        unit_type: otherItem.unit_type,
        available: null,
        unit_price: unitPrice,
        quantity,
        discount: 0,
      },
    ])
    setBarcode('')
    setShowOther(false)
    setOtherItem({ barcode: '', name: 'Other', quantity: 1, unit_price: '', unit_type: 'piece' })
    inputRef.current?.focus()
  }

  const update = (cartId, patch) => setCart(prev => prev.map(line => line.cart_id === cartId ? { ...line, ...patch } : line))
  const remove = (cartId) => setCart(prev => prev.filter(line => line.cart_id !== cartId))
  const setOtherQuantity = (value) => {
    const sanitized = sanitizeQuantityInput(value, otherItem.unit_type)
    if (sanitized !== null) setOtherItem(prev => ({ ...prev, quantity: sanitized }))
  }
  const updateLineQuantity = (line, value) => {
    const sanitized = sanitizeQuantityInput(value, line.unit_type)
    if (sanitized !== null) update(line.cart_id, { quantity: sanitized })
  }

  const lineBase = (line) => Math.max(0, Number(line.unit_price || 0) * Number(line.quantity || 0))
  const percent = (value) => Math.min(100, Math.max(0, Number(value || 0)))
  const lineDiscountAmount = (line) => lineBase(line) * (percent(line.discount_percent ?? line.discount) / 100)
  const lineTotal = (line) => Math.max(0, lineBase(line) - lineDiscountAmount(line))
  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + lineTotal(line), 0), [cart])
  const cartDiscountAmount = subtotal * (percent(cartDiscount) / 100)
  const total = Math.max(0, subtotal - cartDiscountAmount)

  const checkout = async () => {
    if (!cart.length) return toast.error('Cart is empty')
    const over = cart.find(line => !line.custom && Number(line.quantity) > Number(line.available))
    if (over) return toast.error(`Insufficient stock for ${over.name}`)
    setCheckingOut(true)
    try {
      await api.post('/api/pos/sales', {
        cart_discount_percent: Number(cartDiscount || 0),
        lines: cart.map(({ custom, item_id, name, barcode, quantity, unit_price, unit_type, discount_percent, discount }) => ({
          custom,
          item_id,
          item_name: name,
          barcode,
          quantity: normalizeQuantity(quantity, unit_type),
          unit_price: Number(unit_price || 0),
          unit_type,
          discount_percent: Number(discount_percent ?? discount ?? 0),
        })),
      })
      toast.success('Sale completed and stock deducted')
      setCart([])
      setCartDiscount(0)
      fetchSalesHistory().catch(() => {})
      inputRef.current?.focus()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Checkout failed')
    } finally {
      setCheckingOut(false)
    }
  }

  const historyTotal = salesHistory.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const historyItems = salesHistory.reduce((sum, sale) => sum + (sale.lines || []).reduce((lineSum, line) => lineSum + Number(line.quantity || 0), 0), 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">POS</h1>
        <p className="text-sm text-slate-500">Scan or type a barcode, adjust quantities and discounts, then checkout.</p>
      </div>

      <form onSubmit={addByBarcode} className="bg-white border border-slate-200 rounded-lg p-4 flex gap-2 flex-wrap">
        <div className="relative flex-1">
          <Barcode size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            value={barcode}
            onChange={e => setBarcode(e.target.value)}
            placeholder="Scan barcode"
            className="w-full rounded-md border border-slate-300 pl-10 pr-3 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoFocus
          />
        </div>
        <button className="px-4 rounded-md bg-emerald-700 text-white font-semibold hover:bg-emerald-800 inline-flex items-center gap-2">
          <ScanLine size={18} /> Add
        </button>
        <button type="button" onClick={openOther} className="px-4 py-3 rounded-md border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 inline-flex items-center gap-2">
          <PackagePlus size={18} /> Other
        </button>
      </form>

      {showOther && (
        <form onSubmit={addOther} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Other item</h2>
            <button type="button" onClick={() => setShowOther(false)} className="p-1 rounded hover:bg-slate-100"><X size={16} /></button>
          </div>
          <div className="grid md:grid-cols-[1fr_1fr_120px_140px_140px] gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Barcode</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={otherItem.barcode} onChange={e => setOtherItem(prev => ({ ...prev, barcode: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Name</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={otherItem.name} onChange={e => setOtherItem(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Quantity</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" {...quantityInputProps(otherItem.unit_type)} value={otherItem.quantity} onChange={e => setOtherQuantity(e.target.value)} onBlur={e => setOtherItem(prev => ({ ...prev, quantity: normalizeQuantity(e.target.value, prev.unit_type) }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Unit</label>
              <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={otherItem.unit_type} onChange={e => setOtherItem(prev => ({ ...prev, unit_type: e.target.value, quantity: normalizeQuantity(prev.quantity, e.target.value) }))}>
                <option value="piece">Pieces</option>
                <option value="kg">Kg</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Custom price</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="number" step="0.01" min="0" value={otherItem.unit_price} onChange={e => setOtherItem(prev => ({ ...prev, unit_price: e.target.value }))} required />
            </div>
          </div>
          <button className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800">Add Other to Cart</button>
        </form>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">Item</th>
                <th className="text-left px-4 py-3">Available</th>
                <th className="text-left px-4 py-3">Quantity</th>
                <th className="text-left px-4 py-3">Unit Price</th>
                <th className="text-left px-4 py-3">Discount %</th>
                <th className="text-left px-4 py-3">Total</th>
                <th className="text-left px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {cart.map(line => (
                <tr key={line.cart_id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{line.name} {line.custom && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">Other</span>}</p>
                    <p className="text-xs text-slate-500 font-mono">{line.barcode}</p>
                  </td>
                  <td className="px-4 py-3">{line.custom ? '-' : qty(line.available, line.unit_type)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => update(line.cart_id, { quantity: normalizeQuantity(Math.max(0, Number(line.quantity) - (line.unit_type === 'kg' ? 0.25 : 1)), line.unit_type) })} className="p-1 rounded hover:bg-slate-100" type="button"><Minus size={14} /></button>
                      <input className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm" {...quantityInputProps(line.unit_type)} value={line.quantity} onChange={e => updateLineQuantity(line, e.target.value)} onBlur={e => update(line.cart_id, { quantity: normalizeQuantity(e.target.value, line.unit_type) })} />
                      <button onClick={() => update(line.cart_id, { quantity: normalizeQuantity(Number(line.quantity) + (line.unit_type === 'kg' ? 0.25 : 1), line.unit_type) })} className="p-1 rounded hover:bg-slate-100" type="button"><Plus size={14} /></button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.unit_price}
                      onChange={e => update(line.cart_id, { unit_price: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <input className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm" type="number" step="0.01" min="0" max="100" value={line.discount_percent ?? line.discount} onChange={e => update(line.cart_id, { discount_percent: e.target.value })} />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold">{money(lineTotal(line))}</td>
                  <td className="px-4 py-3"><button onClick={() => remove(line.cart_id)} type="button" className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={15} /></button></td>
                </tr>
              ))}
              {!cart.length && <tr><td colSpan="7" className="py-16 text-center text-slate-400">Scan an item to begin</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 h-fit space-y-3">
          <h2 className="font-semibold">Checkout</h2>
          <div className="flex justify-between text-sm"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Total discount %</label>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="number" step="0.01" min="0" max="100" value={cartDiscount} onChange={e => setCartDiscount(e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">{money(cartDiscountAmount)} off</p>
          </div>
          <div className="border-t border-slate-100 pt-3 flex justify-between text-lg"><span>Total</span><strong>{money(total)}</strong></div>
          <button onClick={checkout} disabled={checkingOut || !cart.length} className="w-full rounded-md bg-emerald-700 text-white py-3 font-semibold hover:bg-emerald-800 disabled:opacity-50">
            {checkingOut ? 'Completing...' : 'Complete Sale'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">Daily Sales History</h2>
            <p className="text-xs text-slate-500">Review POS sales and sold items by date.</p>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-slate-500" />
            <input
              type="date"
              value={historyDate}
              onChange={e => setHistoryDate(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 border-b border-slate-100">
          <div className="px-4 py-3">
            <p className="text-xs text-slate-500">Date</p>
            <p className="font-semibold">{dateOnly(historyDate)}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-slate-500">Sales Total</p>
            <p className="font-semibold">{money(historyTotal)}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-slate-500">Items Sold</p>
            <p className="font-semibold">{historyItems.toLocaleString(undefined, { maximumFractionDigits: 3 })}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2">Sale</th>
                <th className="text-left px-4 py-2">Items</th>
                <th className="text-left px-4 py-2">Subtotal</th>
                <th className="text-left px-4 py-2">Discount</th>
                <th className="text-left px-4 py-2">Total</th>
                <th className="text-left px-4 py-2">Cashier</th>
              </tr>
            </thead>
            <tbody>
              {salesHistory.map(sale => (
                <tr key={sale.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 font-semibold">#{sale.id}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {(sale.lines || []).map(line => (
                        <div key={line.id} className="flex items-center justify-between gap-4">
                          <span className="font-medium">{line.item_name}</span>
                          <span className="text-xs text-slate-500">{qty(line.quantity, line.unit_type)} · {money(line.line_total)}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">{money(sale.subtotal)}</td>
                  <td className="px-4 py-3">{money(sale.discount_total)}</td>
                  <td className="px-4 py-3 font-semibold">{money(sale.total)}</td>
                  <td className="px-4 py-3 text-slate-500">{sale.created_by_name || '-'}</td>
                </tr>
              ))}
              {!salesHistory.length && (
                <tr><td colSpan="6" className="px-4 py-10 text-center text-slate-400">No POS sales for this date</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
