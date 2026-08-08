import { Eraser } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Unterschrift per Finger oder Eingabestift (Spez. 5.5) — keine reine
 * Namensbestätigung. Liefert die Zeichnung als PNG-Data-URL.
 *
 * Das Canvas ist immer montiert (kein Bild/Canvas-Wechsel mehr) und passt
 * seine Pixelgröße per ResizeObserver an den Container an — damit
 * funktioniert das Feld auch, wenn es erst nach dem Layout sichtbar wird
 * (Ursache für „Unterschriftsfelder gehen nicht“ auf manchen Formularen).
 */
export function SignaturePad({ value, onChange, label }: { value: string | null; onChange: (dataUrl: string | null) => void; label: string }) {
  // Teil der Grading-Formulare → immer englisch
  const { i18n } = useTranslation()
  const t = i18n.getFixedT('en')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const valueRef = useRef(value)
  valueRef.current = value

  const initCtx = (canvas: HTMLCanvasElement, ratio: number) => {
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = getComputedStyle(canvas).color
    return ctx
  }

  // Canvas in Gerätepixeln aufsetzen (Retina-scharf) und bei jeder
  // Größenänderung neu dimensionieren; eine vorhandene Zeichnung wird
  // dabei wieder eingezeichnet.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 2) return // noch nicht im Layout — ResizeObserver meldet sich erneut
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      const ctx = initCtx(canvas, ratio)
      const v = valueRef.current
      if (v) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
        img.src = v
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // Wert von außen gelöscht (z. B. „Löschen“-Button) → Fläche leeren
  useEffect(() => {
    if (value) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
  }, [value])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const canvas = canvasRef.current!
    // Falls das Canvas beim Aufsetzen 0 px breit war: jetzt nachholen
    if (canvas.width < 2) {
      const rect = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      initCtx(canvas, ratio)
    }
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = getComputedStyle(canvas).color
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    // Punkt auch bei bloßem Tippen sichtbar machen
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
    drawing.current = true
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    onChange(canvasRef.current!.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')!
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
    }
    onChange(null)
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13px] font-medium text-dim">{label}</span>
        {value && (
          <button onClick={clear} className="flex items-center gap-1 text-[12px] text-dim hover:text-danger">
            <Eraser size={12} /> {t('grading.clearSignature')}
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        className="h-28 w-full touch-none select-none rounded-xl border border-dashed border-line/25 bg-surface text-ink"
      />
      {!value && <p className="mt-1 text-[11.5px] text-dim/70">{t('grading.signHint')}</p>}
    </div>
  )
}
