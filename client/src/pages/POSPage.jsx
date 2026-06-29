import { useCallback, useEffect, useRef, useState } from 'react'
import { Banknote, Barcode, CalendarDays, Camera, Minus, PackagePlus, Plus, RotateCcw, ScanLine, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApi } from '../hooks/useApi'
import { dateOnly, localDateInputValue, money, qty } from '../lib/format'
import { normalizeQuantity, quantityInputProps, sanitizeQuantityInput } from '../lib/quantity'

export default function POSPage() {
  const api = useApi()
  const inputRef = useRef(null)
  const returnInputRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const scanLoopRef = useRef(null)
  const scannerControlsRef = useRef(null)
  const scannedCodeRef = useRef('')
  const scannerTargetRef = useRef('sale')
  const [barcode, setBarcode] = useState('')
  const [cart, setCart] = useState([])
  const [returnCart, setReturnCart] = useState([])
  const [cartDiscount, setCartDiscount] = useState(0)
  const [checkingOut, setCheckingOut] = useState(false)
  const [returning, setReturning] = useState(false)
  const [historyDate, setHistoryDate] = useState(localDateInputValue())
  const [salesHistory, setSalesHistory] = useState([])
  const [returnsHistory, setReturnsHistory] = useState([])
  const [showOther, setShowOther] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showReturn, setShowReturn] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scannerTarget, setScannerTarget] = useState('sale')
  const [receivedUsd, setReceivedUsd] = useState('')
  const [returnUsd, setReturnUsd] = useState('')
  const [returnBarcode, setReturnBarcode] = useState('')
  const [exchangeRate, setExchangeRate] = useState(90000)
  const [otherItem, setOtherItem] = useState({ barcode: '', name: 'Other', quantity: 1, unit_price: '', unit_type: 'piece' })
  const cameraConstraints = {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    focusMode: { ideal: 'continuous' },
  }

  const fetchSalesHistory = useCallback(async () => {
    const res = await api.get(`/api/pos/sales?date=${historyDate}`)
    setSalesHistory(res.data)
  }, [api, historyDate])

  const fetchReturnsHistory = useCallback(async () => {
    const res = await api.get(`/api/pos/returns?date=${historyDate}`)
    setReturnsHistory(res.data)
  }, [api, historyDate])

  useEffect(() => {
    fetchSalesHistory().catch(() => toast.error('Failed to load sales history'))
    fetchReturnsHistory().catch(() => toast.error('Failed to load returns history'))
  }, [fetchSalesHistory, fetchReturnsHistory])

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

  const addItemToReturnCart = useCallback((item) => {
    setReturnCart(prev => {
      const existing = prev.find(line => line.item_id === item.id)
      const step = item.unit_type === 'kg' ? 0.25 : 1
      if (existing) {
        const nextQuantity = normalizeQuantity(Number(existing.quantity) + step, item.unit_type)
        return prev.map(line => line.item_id === item.id ? { ...line, quantity: nextQuantity } : line)
      }
      return [...prev, { cart_id: `return-${item.id}`, item_id: item.id, name: item.name, barcode: item.barcode, unit_type: item.unit_type, unit_price: Number(item.sale_price), quantity: step }]
    })
  }, [])

  const lookupAndAddReturnBarcode = useCallback(async (code) => {
    const res = await api.get(`/api/items/barcode/${encodeURIComponent(code)}`)
    addItemToReturnCart(res.data)
  }, [api, addItemToReturnCart])

  const stopCameraScanner = useCallback(() => {
    if (scanLoopRef.current) window.cancelAnimationFrame(scanLoopRef.current)
    scanLoopRef.current = null
    scannerControlsRef.current?.stop()
    scannerControlsRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    scannedCodeRef.current = ''
    setShowScanner(false)
  }, [])

  useEffect(() => () => {
    if (scanLoopRef.current) window.cancelAnimationFrame(scanLoopRef.current)
    scannerControlsRef.current?.stop()
    streamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

  const handleScannedBarcode = useCallback(async (code) => {
    try {
      const target = scannerTargetRef.current
      if (target === 'return') {
        await lookupAndAddReturnBarcode(code)
        setReturnBarcode('')
      } else {
        await lookupAndAddBarcode(code)
        setBarcode('')
      }
      toast.success(`Scanned ${code}`)
      stopCameraScanner()
      if (target === 'return') returnInputRef.current?.focus()
      else inputRef.current?.focus()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Barcode not found')
    }
  }, [lookupAndAddBarcode, lookupAndAddReturnBarcode, stopCameraScanner])

  const waitForScannerVideo = () => new Promise(resolve => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
  })

  const openCameraScanner = async (target = 'sale') => {
    setScanError('')
    scannerTargetRef.current = target
    setScannerTarget(target)
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError('Camera access is not available on this device.')
      setShowScanner(true)
      return
    }

    try {
      setShowScanner(true)
      await waitForScannerVideo()
      if (!videoRef.current) throw new Error('Scanner video is not ready')

      if ('BarcodeDetector' in window) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: cameraConstraints,
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'],
        })

        const scan = async () => {
          if (!videoRef.current || !streamRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            const rawValue = codes[0]?.rawValue
            if (rawValue) {
              await handleScannedBarcode(rawValue.trim())
              return
            }
          } catch {
            setScanError('Could not read the barcode. Try better lighting or move closer.')
          }
          scanLoopRef.current = window.requestAnimationFrame(scan)
        }

        scanLoopRef.current = window.requestAnimationFrame(scan)
        return
      }

      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ])
      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
      ])
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 60,
        delayBetweenScanSuccess: 250,
        tryPlayVideoTimeout: 5000,
      })
      scannerControlsRef.current = await reader.decodeFromConstraints(
        { video: cameraConstraints, audio: false },
        videoRef.current,
        async (result) => {
          const rawValue = result?.getText?.()
          if (!rawValue || scannedCodeRef.current) return
          scannedCodeRef.current = rawValue
          await handleScannedBarcode(rawValue.trim())
        }
      )
    } catch {
      setScanError('Camera permission was denied or no camera was found.')
      scannerControlsRef.current?.stop()
      scannerControlsRef.current = null
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }

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

  useEffect(() => {
    const code = returnBarcode.trim()
    if (!code || !showReturn) return undefined

    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        await lookupAndAddReturnBarcode(code)
        if (!cancelled) {
          setReturnBarcode('')
          returnInputRef.current?.focus()
        }
      } catch {
        // Keep typing quiet; the Add button still reports invalid barcodes explicitly.
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [returnBarcode, showReturn, lookupAndAddReturnBarcode])

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

  const addReturnByBarcode = async (e) => {
    e.preventDefault()
    const code = returnBarcode.trim()
    if (!code) return
    try {
      await lookupAndAddReturnBarcode(code)
      setReturnBarcode('')
      returnInputRef.current?.focus()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Barcode not found')
    }
  }

  const openReturn = () => {
    setShowReturn(true)
    window.setTimeout(() => returnInputRef.current?.focus(), 0)
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
  const updateReturn = (cartId, patch) => setReturnCart(prev => prev.map(line => line.cart_id === cartId ? { ...line, ...patch } : line))
  const removeReturn = (cartId) => setReturnCart(prev => prev.filter(line => line.cart_id !== cartId))
  const setOtherQuantity = (value) => {
    const sanitized = sanitizeQuantityInput(value, otherItem.unit_type)
    if (sanitized !== null) setOtherItem(prev => ({ ...prev, quantity: sanitized }))
  }
  const updateLineQuantity = (line, value) => {
    const sanitized = sanitizeQuantityInput(value, line.unit_type)
    if (sanitized !== null) update(line.cart_id, { quantity: sanitized })
  }
  const updateReturnLineQuantity = (line, value) => {
    const sanitized = sanitizeQuantityInput(value, line.unit_type)
    if (sanitized !== null) updateReturn(line.cart_id, { quantity: sanitized })
  }

  const lineBase = (line) => Math.max(0, Number(line.unit_price || 0) * Number(line.quantity || 0))
  const percent = (value) => Math.min(100, Math.max(0, Number(value || 0)))
  const lineDiscountAmount = (line) => lineBase(line) * (percent(line.discount_percent ?? line.discount) / 100)
  const lineTotal = (line) => Math.max(0, lineBase(line) - lineDiscountAmount(line))
  const returnLineTotal = (line) => Math.max(0, Number(line.unit_price || 0) * Number(line.quantity || 0))
  const subtotal = cart.reduce((sum, line) => sum + lineTotal(line), 0)
  const returnSubtotal = returnCart.reduce((sum, line) => sum + returnLineTotal(line), 0)
  const cartDiscountAmount = subtotal * (percent(cartDiscount) / 100)
  const total = Math.max(0, subtotal - cartDiscountAmount)
  const paidUsd = Number(receivedUsd || 0)
  const rate = Math.max(0, Number(String(exchangeRate || 0).replace(/,/g, '')))
  const changeUsd = Math.max(0, paidUsd - total)
  const returnUsdAmount = Math.min(changeUsd, Math.max(0, Number(returnUsd || 0)))
  const returnLbpAmount = Math.max(0, changeUsd - returnUsdAmount)
  const changeLbp = Math.round(returnLbpAmount * rate)
  const remainingUsd = Math.max(0, total - paidUsd)
  const lbp = (value) => `${Math.round(Number(value || 0)).toLocaleString()} LBP`
  const setRateValue = (value) => {
    const digits = value.replace(/\D/g, '')
    setExchangeRate(digits ? Number(digits).toLocaleString() : '')
  }

  const setReceivedPayment = (value) => {
    const nextPaidUsd = Number(value || 0)
    const nextChangeUsd = Math.max(0, nextPaidUsd - total)
    setReceivedUsd(value)
    setReturnUsd(nextChangeUsd ? nextChangeUsd.toFixed(2) : '')
  }

  const openPayment = () => {
    if (!cart.length) return toast.error('Cart is empty')
    const over = cart.find(line => !line.custom && Number(line.quantity) > Number(line.available))
    if (over) return toast.error(`Insufficient stock for ${over.name}`)
    const initialReceived = total ? Math.ceil(total) : 0
    const initialChange = Math.max(0, initialReceived - total)
    setReceivedUsd(initialReceived ? String(initialReceived) : '')
    setReturnUsd(initialChange ? initialChange.toFixed(2) : '')
    setExchangeRate(Number(exchangeRate || 0).toLocaleString())
    setShowPayment(true)
  }

  const checkout = async () => {
    if (!cart.length) return toast.error('Cart is empty')
    const over = cart.find(line => !line.custom && Number(line.quantity) > Number(line.available))
    if (over) return toast.error(`Insufficient stock for ${over.name}`)
    if (paidUsd < total) return toast.error(`Customer still owes ${money(remainingUsd)}`)
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
      setShowPayment(false)
      setReceivedUsd('')
      setReturnUsd('')
      fetchSalesHistory().catch(() => {})
      inputRef.current?.focus()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Checkout failed')
    } finally {
      setCheckingOut(false)
    }
  }

  const submitReturn = async () => {
    if (!returnCart.length) return toast.error('Return cart is empty')
    const invalid = returnCart.find(line => !normalizeQuantity(line.quantity, line.unit_type) || Number(line.unit_price || 0) <= 0)
    if (invalid) return toast.error(`Check return quantity and price for ${invalid.name}`)
    setReturning(true)
    try {
      await api.post('/api/pos/returns', {
        lines: returnCart.map(({ item_id, quantity, unit_price, unit_type }) => ({
          item_id,
          quantity: normalizeQuantity(quantity, unit_type),
          unit_price: Number(unit_price || 0),
        })),
      })
      toast.success('Return completed and stock corrected')
      setReturnCart([])
      setReturnBarcode('')
      fetchReturnsHistory().catch(() => {})
      returnInputRef.current?.focus()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Return failed')
    } finally {
      setReturning(false)
    }
  }

  const historyTotal = salesHistory.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const historyItems = salesHistory.reduce((sum, sale) => sum + (sale.lines || []).reduce((lineSum, line) => lineSum + Number(line.quantity || 0), 0), 0)
  const returnsHistoryTotal = returnsHistory.reduce((sum, returned) => sum + Number(returned.total || 0), 0)
  const returnsHistoryItems = returnsHistory.reduce((sum, returned) => sum + (returned.lines || []).reduce((lineSum, line) => lineSum + Number(line.quantity || 0), 0), 0)

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
        <button type="button" onClick={() => openCameraScanner('sale')} className="px-4 py-3 rounded-md border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 inline-flex items-center gap-2">
          <Camera size={18} /> Camera
        </button>
        <button type="button" onClick={openOther} className="px-4 py-3 rounded-md border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 inline-flex items-center gap-2">
          <PackagePlus size={18} /> Other
        </button>
        <button type="button" onClick={openReturn} className="px-4 py-3 rounded-md border border-red-200 bg-red-50 text-red-700 font-semibold hover:bg-red-100 inline-flex items-center gap-2">
          <RotateCcw size={18} /> Return Item
        </button>
      </form>

      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2"><Camera size={18} /> Scan {scannerTarget === 'return' ? 'return' : 'sale'} barcode</h2>
              <button type="button" onClick={stopCameraScanner} className="p-1 rounded-md hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              {scanError ? (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                  {scanError}
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-md bg-slate-950 aspect-video">
                  <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                  <div className="absolute inset-x-4 top-1/2 h-28 -translate-y-1/2 rounded-md border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
                </div>
              )}
              <p className="text-xs text-slate-500">Point the camera at the barcode. The item will be added automatically when detected.</p>
            </div>
          </div>
        </div>
      )}

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

      {showReturn && (
        <div className="bg-white border border-red-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-red-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold flex items-center gap-2 text-red-700"><RotateCcw size={18} /> Return items</h2>
              <p className="text-xs text-slate-500">Scan a barcode, confirm quantity and refund price, then complete the return.</p>
            </div>
            <button type="button" onClick={() => setShowReturn(false)} className="p-1 rounded hover:bg-slate-100"><X size={16} /></button>
          </div>

          <div className="p-4 space-y-4">
            <form onSubmit={addReturnByBarcode} className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <Barcode size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={returnInputRef}
                  value={returnBarcode}
                  onChange={e => setReturnBarcode(e.target.value)}
                  placeholder="Scan return barcode"
                  className="w-full rounded-md border border-slate-300 pl-10 pr-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <button className="px-4 rounded-md bg-red-700 text-white font-semibold hover:bg-red-800 inline-flex items-center gap-2">
                <ScanLine size={18} /> Add
              </button>
              <button type="button" onClick={() => openCameraScanner('return')} className="px-4 py-2.5 rounded-md border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 inline-flex items-center gap-2">
                <Camera size={18} /> Camera
              </button>
            </form>

            <div className="overflow-x-auto border border-slate-100 rounded-md">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2">Item</th>
                    <th className="text-left px-4 py-2">Quantity</th>
                    <th className="text-left px-4 py-2">Refund Price</th>
                    <th className="text-left px-4 py-2">Refund Total</th>
                    <th className="text-left px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {returnCart.map(line => (
                    <tr key={line.cart_id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{line.name}</p>
                        <p className="text-xs text-slate-500 font-mono">{line.barcode}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateReturn(line.cart_id, { quantity: normalizeQuantity(Math.max(0, Number(line.quantity) - (line.unit_type === 'kg' ? 0.25 : 1)), line.unit_type) })} className="p-1 rounded hover:bg-slate-100" type="button"><Minus size={14} /></button>
                          <input className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm" {...quantityInputProps(line.unit_type)} value={line.quantity} onChange={e => updateReturnLineQuantity(line, e.target.value)} onBlur={e => updateReturn(line.cart_id, { quantity: normalizeQuantity(e.target.value, line.unit_type) })} />
                          <button onClick={() => updateReturn(line.cart_id, { quantity: normalizeQuantity(Number(line.quantity) + (line.unit_type === 'kg' ? 0.25 : 1), line.unit_type) })} className="p-1 rounded hover:bg-slate-100" type="button"><Plus size={14} /></button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.unit_price}
                          onChange={e => updateReturn(line.cart_id, { unit_price: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold">{money(returnLineTotal(line))}</td>
                      <td className="px-4 py-3"><button onClick={() => removeReturn(line.cart_id)} type="button" className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                  {!returnCart.length && <tr><td colSpan="5" className="py-10 text-center text-slate-400">Scan an item to return</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-slate-500">Refund total</p>
                <p className="text-xl font-bold text-red-700">{money(returnSubtotal)}</p>
              </div>
              <button type="button" onClick={submitReturn} disabled={returning || !returnCart.length} className="rounded-md bg-red-700 text-white px-5 py-3 font-semibold hover:bg-red-800 disabled:opacity-50">
                {returning ? 'Completing...' : 'Complete Return'}
              </button>
            </div>
          </div>
        </div>
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
          <button onClick={openPayment} disabled={checkingOut || !cart.length} className="w-full rounded-md bg-emerald-700 text-white py-3 font-semibold hover:bg-emerald-800 disabled:opacity-50">
            Complete Sale
          </button>
        </div>
      </div>

      {showPayment && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2"><Banknote size={18} /> Payment & Change</h2>
              <button type="button" onClick={() => setShowPayment(false)} className="p-1 rounded-md hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Total</span>
                <strong className="text-2xl">{money(total)}</strong>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Received USD</label>
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    type="number"
                    step="0.01"
                    min="0"
                    value={receivedUsd}
                    onChange={e => setReceivedPayment(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">USD rate</label>
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    type="text"
                    inputMode="numeric"
                    value={exchangeRate}
                    onChange={e => setRateValue(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                {[total, 5, 10, 20, 50].map((value, index) => (
                  <button
                    key={`${value}-${index}`}
                    type="button"
                    onClick={() => setReceivedPayment(String(Number(value).toFixed(2)))}
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold hover:bg-slate-50"
                  >
                    {money(value)}
                  </button>
                ))}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between">
                <span className="text-sm text-slate-500">Total change</span>
                <strong>{money(changeUsd)}</strong>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Return USD</label>
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    type="number"
                    step="0.01"
                    min="0"
                    max={changeUsd}
                    value={returnUsd}
                    onChange={e => setReturnUsd(e.target.value)}
                    onBlur={e => setReturnUsd(String(Math.min(changeUsd, Math.max(0, Number(e.target.value || 0))).toFixed(2)))}
                  />
                  <p className="mt-1 text-xs text-slate-400">Cash back in dollars</p>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Return LBP</label>
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold min-h-[38px] flex items-center">
                    {lbp(changeLbp)}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{money(returnLbpAmount)} at {rate.toLocaleString()}</p>
                </div>
              </div>

              {remainingUsd > 0 && (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                  Remaining: {money(remainingUsd)} or {lbp(remainingUsd * rate)}
                </div>
              )}

              <button
                type="button"
                onClick={checkout}
                disabled={checkingOut || paidUsd < total}
                className="w-full rounded-md bg-emerald-700 text-white py-3 font-semibold hover:bg-emerald-800 disabled:opacity-50"
              >
                {checkingOut ? 'Completing...' : 'Confirm Sale'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold">Daily Returns History</h2>
          <p className="text-xs text-slate-500">Returned items for the selected date. These are subtracted from reports and added back to stock.</p>
        </div>

        <div className="grid sm:grid-cols-3 border-b border-slate-100">
          <div className="px-4 py-3">
            <p className="text-xs text-slate-500">Date</p>
            <p className="font-semibold">{dateOnly(historyDate)}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-slate-500">Returns Total</p>
            <p className="font-semibold text-red-700">{money(returnsHistoryTotal)}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-slate-500">Items Returned</p>
            <p className="font-semibold">{returnsHistoryItems.toLocaleString(undefined, { maximumFractionDigits: 3 })}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2">Return</th>
                <th className="text-left px-4 py-2">Items</th>
                <th className="text-left px-4 py-2">Total</th>
                <th className="text-left px-4 py-2">Cashier</th>
              </tr>
            </thead>
            <tbody>
              {returnsHistory.map(returned => (
                <tr key={returned.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 font-semibold">#{returned.id}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {(returned.lines || []).map(line => (
                        <div key={line.id} className="flex items-center justify-between gap-4">
                          <span className="font-medium">{line.item_name}</span>
                          <span className="text-xs text-slate-500">{qty(line.quantity, line.unit_type)} - {money(line.line_total)}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-red-700">{money(returned.total)}</td>
                  <td className="px-4 py-3 text-slate-500">{returned.created_by_name || '-'}</td>
                </tr>
              ))}
              {!returnsHistory.length && (
                <tr><td colSpan="4" className="px-4 py-10 text-center text-slate-400">No POS returns for this date</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
