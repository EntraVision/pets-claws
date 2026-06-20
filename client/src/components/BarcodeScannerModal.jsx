import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'

const cameraConstraints = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 1280 },
  height: { ideal: 720 },
  focusMode: { ideal: 'continuous' },
}

export default function BarcodeScannerModal({ onClose, onDetected }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const scannedRef = useRef('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not available on this device.')
        return
      }

      try {
        await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ])
        if (cancelled || !videoRef.current) return

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

        controlsRef.current = await reader.decodeFromConstraints(
          { video: cameraConstraints, audio: false },
          videoRef.current,
          (result) => {
            const rawValue = result?.getText?.()
            if (!rawValue || scannedRef.current) return
            scannedRef.current = rawValue
            onDetected(rawValue.trim())
          }
        )
      } catch {
        setError('Camera permission was denied or no camera was found.')
      }
    }

    start()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [onDetected])

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 p-4 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Camera size={18} /> Scan barcode</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          {error ? (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              {error}
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-md bg-slate-950 aspect-video">
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
              <div className="absolute inset-x-4 top-1/2 h-28 -translate-y-1/2 rounded-md border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
            </div>
          )}
          <p className="text-xs text-slate-500">Point the camera at the barcode. The barcode field will fill automatically when detected.</p>
        </div>
      </div>
    </div>
  )
}
