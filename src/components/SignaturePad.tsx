import { Eraser, Keyboard, PenLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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

/**
 * Getippte Unterschrift als Bild — die Alternative für alle, die nicht
 * zeichnen können (nur Tastatur, motorische Einschränkung, defektes
 * Touchpad). Der Vermerk „Typed signature" samt Zeitstempel wird in das
 * Bild selbst gerendert: er steht damit unveränderlich in jeder Ansicht,
 * jedem PDF und jedem Ausdruck, ohne dass das Datenmodell ihn kennen muss.
 */
function typedSignatureImage(name: string): string {
  const w = 600
  const h = 160
  const ratio = 2
  const canvas = document.createElement('canvas')
  canvas.width = w * ratio
  canvas.height = h * ratio
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = INK
  ctx.textBaseline = 'middle'
  // Schreibschrift, wo vorhanden; die generische Familie „cursive" ist der
  // verlässliche Rückfall auf jedem System.
  let size = 52
  ctx.font = `italic ${size}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`
  while (ctx.measureText(name).width > w - 40 && size > 18) {
    size -= 2
    ctx.font = `italic ${size}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`
  }
  ctx.fillText(name, 20, h / 2 - 14)
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  ctx.font = '13px system-ui, sans-serif'
  ctx.fillStyle = '#475569'
  ctx.fillText(`Typed signature (keyboard entry) · ${stamp}`, 20, h - 24)
  return canvas.toDataURL('image/png')
}

export function SignaturePad({ value, onChange, label }: { value: string | null; onChange: (dataUrl: string | null) => void; label: string }) {
  // Teil der Grading-Formulare → immer englisch
  const { t } = useTranslation()
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

  // Zeichnen ist der Normalfall; Tippen die gleichwertige Alternative ohne
  // Zeigegerät. Der Wechsel verwirft eine bereits geleistete Unterschrift —
  // sie wäre im anderen Modus nicht mehr die eigene Eingabe.
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  const [typedName, setTypedName] = useState('')
  const switchMode = (m: 'draw' | 'type') => {
    if (m === mode) return
    setMode(m)
    setTypedName('')
    onChange(null)
  }

  return (
    <div>
      {/*
        Beschriftung und Knöpfe UMBRECHEN als Ganzes, statt sich gegenseitig zu
        quetschen: Die Trainee-Zeile trägt den Namen des Piloten („Trainee
        signature — Michael Holy"), und am Telefon blieben daneben nur noch
        wenige Millimeter für die Knöpfe. Die projektweite Umbruchregel
        (`overflow-wrap: anywhere`) griff dann genau dort, wofür sie nicht
        gedacht ist, und aus „Clear" wurde „Clea" / „r". Deshalb: die Knöpfe
        schrumpfen nicht (`shrink-0`) und brechen nicht (`whitespace-nowrap`) —
        passen sie nicht mehr neben die Beschriftung, rücken sie geschlossen in
        die nächste Zeile.
      */}
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <span className="min-w-0 text-[13px] font-medium text-dim">{label}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {value && (
            <button onClick={clear} className="flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-[12px] text-dim hover:text-danger">
              <Eraser size={12} /> {t('forms:clearSignature')}
            </button>
          )}
          <button
            onClick={() => switchMode(mode === 'draw' ? 'type' : 'draw')}
            aria-pressed={mode === 'type'}
            className="flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-[12px] text-dim underline-offset-2 hover:text-accent hover:underline"
          >
            {mode === 'draw' ? <Keyboard size={12} /> : <PenLine size={12} />}
            {mode === 'draw' ? t('forms:typeInstead') : t('forms:drawInstead')}
          </button>
        </span>
      </div>
      {mode === 'type' && (
        <div>
          {value ? (
            /* Vorschau: exakt das Bild, das im Dokument stehen wird */
            <img src={value} alt={label} style={{ background: PAPER, borderColor: PAD_BORDER }} className="h-28 w-full rounded-xl border border-dashed object-contain" />
          ) : (
            <div className="flex gap-2">
              <input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && typedName.trim() && onChange(typedSignatureImage(typedName.trim()))}
                placeholder={t('forms:typedNamePlaceholder')}
                aria-label={label}
                className="w-full rounded-xl border border-field bg-bg/60 px-3.5 py-2.5 text-[15px] text-ink placeholder:text-dim outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
              />
              <button
                onClick={() => typedName.trim() && onChange(typedSignatureImage(typedName.trim()))}
                disabled={!typedName.trim()}
                className="min-h-11 shrink-0 rounded-xl border border-line/15 px-3 text-[13px] text-ink transition hover:bg-line/5 disabled:opacity-40"
              >
                {t('forms:useTyped')}
              </button>
            </div>
          )}
          {!value && <p className="mt-1 text-[11.5px] text-dim">{t('forms:typedHint')}</p>}
        </div>
      )}
      {/* Feste Farben statt Theme-Token: die Fläche zeigt beim Zeichnen genau
          das, was später im Dokument und auf dem Ausdruck steht. Im
          Tipp-Modus bleibt der Canvas im Baum (die Zeichenlogik hängt an
          ihm), wird aber ausgeblendet. */}
      <canvas
        hidden={mode === 'type'}
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
      {!value && mode === 'draw' && <p className="mt-1 text-[11.5px] text-dim">{t('forms:signHint')}</p>}
    </div>
  )
}
