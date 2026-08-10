import { Eraser } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Unterschrift per Finger oder Eingabestift (Spez. 5.5) — keine reine
 * Namensbestätigung. Liefert die Zeichnung als PNG-Data-URL.
 *
 * Die Zeichenlogik hängt mit NATIVEN Listenern (passive: false) direkt am
 * Canvas: Reacts Touch-Handler sind passiv, wodurch iOS Safari das Zeichnen
 * teils als Scrollen interpretierte („Unterschriftsfeld geht nicht“).
 * Zusätzlich: touch-action none, kein Text-Callout, Größe per
 * ResizeObserver — funktioniert auch, wenn das Feld erst später Layout hat.
 */
/**
 * Die Unterschrift wird IMMER auf weißem Grund angezeigt (GradingView) und auf
 * weißes Papier gedruckt. Deshalb ist die Zeichenfläche selbst ein Blatt
 * Papier: feste dunkle Tinte auf festem Weiß, unabhängig vom Hell-/Dunkelmodus.
 *
 * Vorher nahm die Fläche ihre Farbe aus der Umgebung. Im Dunkelmodus entstand
 * damit eine nahezu weiße Unterschrift, die auf dem weißen Feld und auf Papier
 * einen Kontrast von 1,13:1 hatte — also unsichtbar war. Beim Zeichnen sah sie
 * richtig aus, der fertige Nachweis war leer.
 */
const INK = '#16253D'
const PAPER = '#FFFFFF'
const PAD_BORDER = '#94A3B8'

export function SignaturePad({ value, onChange, label }: { value: string | null; onChange: (dataUrl: string | null) => void; label: string }) {
  // Teil der Grading-Formulare → immer englisch
  const { i18n } = useTranslation()
  const t = i18n.getFixedT('en')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let drawing = false

    const initCtx = (ratio: number) => {
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = INK
      return ctx
    }

    const ensureSize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 2) return null
      const ratio = window.devicePixelRatio || 1
      const w = Math.round(rect.width * ratio)
      const h = Math.round(rect.height * ratio)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        const ctx = initCtx(ratio)
        const v = valueRef.current
        if (v) {
          const img = new Image()
          img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
          img.src = v
        }
        return ctx
      }
      return canvas.getContext('2d')!
    }

    const pos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const down = (e: PointerEvent) => {
      e.preventDefault()
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* ältere Browser ohne Pointer Capture zeichnen trotzdem */
      }
      const ctx = ensureSize() ?? canvas.getContext('2d')!
      ctx.strokeStyle = INK
      const { x, y } = pos(e)
      ctx.beginPath()
      ctx.moveTo(x, y)
      // Punkt auch bei bloßem Tippen sichtbar machen
      ctx.lineTo(x + 0.1, y + 0.1)
      ctx.stroke()
      drawing = true
    }

    const move = (e: PointerEvent) => {
      if (!drawing) return
      e.preventDefault()
      const ctx = canvas.getContext('2d')!
      const { x, y } = pos(e)
      ctx.lineTo(x, y)
      ctx.stroke()
    }

    const up = () => {
      if (!drawing) return
      drawing = false
      onChangeRef.current(canvas.toDataURL('image/png'))
    }

    // iOS-Fallback: Touch-Gesten am Canvas nie ans Scrolling durchreichen
    const blockTouch = (e: TouchEvent) => e.preventDefault()

    canvas.addEventListener('pointerdown', down, { passive: false })
    canvas.addEventListener('pointermove', move, { passive: false })
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('touchstart', blockTouch, { passive: false })
    canvas.addEventListener('touchmove', blockTouch, { passive: false })

    ensureSize()
    const ro = new ResizeObserver(() => ensureSize())
    ro.observe(canvas)

    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('touchstart', blockTouch)
      canvas.removeEventListener('touchmove', blockTouch)
      ro.disconnect()
    }
  }, [])

  // Wert von außen gelöscht (z. B. „Clear“-Button) → Fläche leeren
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

  const clear = () => onChange(null)

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
      {/* Feste Farben statt Theme-Token: die Fläche zeigt beim Zeichnen genau
          das, was später im Dokument und auf dem Ausdruck steht. */}
      <canvas
        ref={canvasRef}
        style={
          {
            touchAction: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            WebkitTouchCallout: 'none',
            background: PAPER,
            borderColor: PAD_BORDER,
            color: INK,
          } as React.CSSProperties
        }
        className="h-28 w-full rounded-xl border border-dashed"
      />
      {!value && <p className="mt-1 text-[11.5px] text-dim">{t('grading.signHint')}</p>}
    </div>
  )
}
