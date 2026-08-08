import { Eraser } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Unterschrift per Finger oder Eingabestift (Spez. 5.5) — keine reine
 * Namensbestätigung. Liefert die Zeichnung als PNG-Data-URL.
 */
export function SignaturePad({ value, onChange, label }: { value: string | null; onChange: (dataUrl: string | null) => void; label: string }) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)
  // Gespeicherte Signatur als Bild zeigen, solange nicht neu gezeichnet wird
  const showImage = !!value && !hasInk

  // Canvas in Gerätepixeln aufsetzen, damit die Linie auf Retina scharf
  // bleibt. Läuft erneut, wenn das Canvas nach der Bildvorschau erscheint.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = getComputedStyle(canvas).color
  }, [showImage])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    drawing.current = true
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasInk(true)
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    onChange(canvasRef.current!.toDataURL('image/png'))
  }

  const clear = () => {
    // Im Bildvorschau-Zustand ist kein Canvas montiert
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13px] font-medium text-dim">{label}</span>
        {(hasInk || value) && (
          <button onClick={clear} className="flex items-center gap-1 text-[12px] text-dim hover:text-danger">
            <Eraser size={12} /> {t('grading.clearSignature')}
          </button>
        )}
      </div>
      {showImage ? (
        <img src={value} alt="signature" className="h-28 w-full rounded-xl border border-line/15 bg-white object-contain" />
      ) : (
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="h-28 w-full touch-none rounded-xl border border-dashed border-line/25 bg-surface text-ink"
        />
      )}
      {!hasInk && !value && <p className="mt-1 text-[11.5px] text-dim/70">{t('grading.signHint')}</p>}
    </div>
  )
}
