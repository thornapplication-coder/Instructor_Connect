import { Eraser, Keyboard, PenLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BILD_H,
  einpassen,
  RAND_PX,
  TEXT_RAND,
  tintenRahmen,
  typedBildBreite,
  typedSignatureVermerk,
  umsetzen,
  VERHAELTNIS,
  VERMERK_PX,
  zuschnitt,
  type Box,
  type Groesse,
} from '../signaturBild'

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
 *
 * Audit 11/2026, SIG-01: Der Vermerk stand mit 13 px im Bild und kam auf
 * Papier mit rund 2,5 pt an. Größe und Text kommen jetzt aus
 * signaturBild.ts (dort nachgerechnet und getestet), der Zeitpunkt vom
 * Aufrufer — mit dem Zeitversatz der Sandbox statt `new Date()`.
 */
function typedSignatureImage(name: string, jetzt: number): string {
  const ratio = 2
  const h = BILD_H
  const vermerk = typedSignatureVermerk(jetzt)
  const vermerkFont = `${VERMERK_PX}px system-ui, sans-serif`
  const canvas = document.createElement('canvas')
  const messen = canvas.getContext('2d')!
  messen.font = vermerkFont
  const w = typedBildBreite(messen.measureText(vermerk).width)
  // Größe erst nach dem Messen setzen — das setzt den Kontext zurück.
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
  while (ctx.measureText(name).width > w - 2 * TEXT_RAND && size > 18) {
    size -= 2
    ctx.font = `italic ${size}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`
  }
  // Name in der oberen Fläche, der Vermerk darunter — beide mit Luft zum Rand.
  ctx.fillText(name, TEXT_RAND, (h - VERMERK_PX - 8) / 2)
  ctx.font = vermerkFont
  ctx.fillStyle = '#475569'
  ctx.fillText(vermerk, TEXT_RAND, h - 8 - VERMERK_PX / 2)
  return canvas.toDataURL('image/png')
}

/**
 * Stand der Zeichenfläche als Ausschnitt: das Bild um die Tinte, wo es lag
 * und in welcher Fläche (CSS-Pixel). Damit lässt sich der Inhalt nach einer
 * Größenänderung oder einem „Strich zurück" SYNCHRON neu setzen.
 */
type Stand = { bild: HTMLCanvasElement; lage: Box; flaeche: Groesse }

function leeren(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
}

/** Tinte der Fläche aufnehmen — `null`, wenn keine da ist. */
function aufnehmen(canvas: HTMLCanvasElement, dichte: number, flaeche: Groesse): { stand: Stand; box: Box } | null {
  if (canvas.width === 0 || canvas.height === 0) return null
  const daten = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  const box = tintenRahmen(daten, canvas.width, canvas.height)
  if (!box) return null
  const eng = zuschnitt(box, canvas.width, canvas.height, Math.round(RAND_PX * dichte))
  const bild = document.createElement('canvas')
  bild.width = eng.w
  bild.height = eng.h
  bild.getContext('2d')!.drawImage(canvas, -eng.x, -eng.y)
  return { stand: { bild, lage: { x: eng.x / dichte, y: eng.y / dichte, w: eng.w / dichte, h: eng.h / dichte }, flaeche }, box }
}

/** Gespeichert wird der Ausschnitt um die Tinte im festen Seitenverhältnis —
 *  nicht das ganze Canvas, in dem die Unterschrift im Nachweis winzig stand. */
function alsWert(canvas: HTMLCanvasElement, box: Box, dichte: number): string {
  const z = zuschnitt(box, canvas.width, canvas.height, Math.round(RAND_PX * dichte), VERHAELTNIS)
  const aus = document.createElement('canvas')
  aus.width = z.w
  aus.height = z.h
  aus.getContext('2d')!.drawImage(canvas, -z.x, -z.y)
  return aus.toDataURL('image/png')
}

/** Einen Stand in eine (neue) Fläche setzen — Transformation des Kontexts
 *  steht bereits auf CSS-Pixeln. */
function setzen(canvas: HTMLCanvasElement, stand: Stand, neu: Groesse): Stand {
  const ziel = umsetzen(stand.flaeche, neu, stand.lage)
  canvas.getContext('2d')!.drawImage(stand.bild, ziel.x, ziel.y, ziel.w, ziel.h)
  return { bild: stand.bild, lage: ziel, flaeche: neu }
}

export function SignaturePad({
  value,
  onChange,
  label,
  zeitversatzMs = 0,
}: {
  value: string | null
  onChange: (dataUrl: string | null) => void
  label: string
  /** Zeitversatz der Sandbox — für den Stempel der getippten Unterschrift. */
  zeitversatzMs?: number
}) {
  // Teil der Grading-Formulare → immer englisch
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  /** Zuletzt SELBST ausgegebener Wert. Woran der Effekt unten erkennt, dass
   *  ein Wert von außen kam (gelöscht oder ein fremdes Bild). */
  const eigenerWertRef = useRef<string | null>(value)
  /** Was gerade auf der Fläche steht (ohne laufenden Strich). */
  const inhaltRef = useRef<Stand | null>(null)
  /** Fläche in CSS-Pixeln und Pixeldichte der letzten Größenanpassung. */
  const flaecheRef = useRef<Groesse | null>(null)
  const dichteRef = useRef(1)
  /**
   * Generation des Inhalts. Ein asynchron geladenes Bild (Wert von außen)
   * zeichnet nur, wenn seitdem niemand gelöscht, zurückgenommen oder einen
   * anderen Wert gesetzt hat — sonst malte es mit alten Maßen in die Fläche
   * (die Doppelfigur aus MOB-01).
   */
  const genRef = useRef(0)
  /** Stände vor jedem Strich — für „letzten Strich zurück". */
  const historyRef = useRef<{ wert: string | null; stand: Stand | null }[]>([])

  const ausgeben = (wert: string | null) => {
    eigenerWertRef.current = wert
    onChangeRef.current(wert)
  }

  /** Fläche leeren und alles Gemerkte verwerfen. */
  const zuruecksetzen = () => {
    genRef.current++
    historyRef.current = []
    inhaltRef.current = null
    if (canvasRef.current) leeren(canvasRef.current)
  }

  /** Fremden Wert zeichnen — der einzige verbliebene asynchrone Weg. Maße
   *  werden erst beim Laden gelesen, und nur in der eigenen Generation. */
  const zeichneWert = (wert: string) => {
    const gen = genRef.current
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      const flaeche = flaecheRef.current
      if (gen !== genRef.current || !canvas || !flaeche) return
      const z = einpassen({ w: img.naturalWidth, h: img.naturalHeight }, flaeche)
      canvas.getContext('2d')!.drawImage(img, z.x, z.y, z.w, z.h)
      inhaltRef.current = aufnehmen(canvas, dichteRef.current, flaeche)?.stand ?? null
    }
    img.src = wert
  }

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

    /*
     * Größe anpassen, OHNE den Inhalt zu verlieren.
     *
     * Jede Änderung von width/height leert ein Canvas. Bisher kam der Inhalt
     * danach asynchron aus dem gespeicherten Wert zurück — dazwischen war der
     * Strich weg (gemessen: Tinte 0 / 9878 / 0 / 9243 … über eine Sekunde),
     * ein laufender Strich ging ganz verloren, und ein verspätetes onload
     * malte mit den Maßen der Vollbildfläche ins kleine Feld. Jetzt wird der
     * Inhalt VOR der Änderung synchron aufgenommen und danach gesetzt.
     */
    const ensureSize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return null
      const ratio = window.devicePixelRatio || 1
      const w = Math.round(rect.width * ratio)
      const h = Math.round(rect.height * ratio)
      if (canvas.width === w && canvas.height === h) return canvas.getContext('2d')!
      const alt = flaecheRef.current
      const vorher = alt ? aufnehmen(canvas, dichteRef.current, alt) : null
      canvas.width = w
      canvas.height = h
      dichteRef.current = ratio
      flaecheRef.current = { w: rect.width, h: rect.height }
      const ctx = initCtx(ratio)
      if (vorher) {
        const neu = setzen(canvas, vorher.stand, flaecheRef.current)
        // Während eines Strichs enthält die Aufnahme den halben Strich — der
        // gemerkte Stand bleibt dann der vor dem Strich.
        if (!drawing) inhaltRef.current = neu
      } else if (!alt && valueRef.current && valueRef.current === eigenerWertRef.current) {
        // Erste Größe, Wert schon da: einmal zeichnen.
        zeichneWert(valueRef.current)
      }
      return ctx
    }

    const pos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const down = (e: PointerEvent) => {
      e.preventDefault()
      // Stand VOR diesem Strich merken — nur so laesst sich ein einzelner
      // Strich zuruecknehmen. Bisher gab es nur „alles loeschen": Ein
      // Verrutschen kostete die ganze Unterschrift, und der Pilot musste neu
      // ansetzen. Gemerkt wird das Bild selbst, nicht nur der Wert: Das
      // Zurücknehmen zeichnet damit synchron, ohne Ladeweg.
      historyRef.current.push({ wert: eigenerWertRef.current, stand: inhaltRef.current })
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

    /*
     * Strich beendet: Tinte ZÄHLEN, nicht vermuten. Ohne Tinte gibt es keine
     * Unterschrift — vorher ging hier jedes PNG hinaus, auch ein
     * transparentes, und das Formular hielt es für eine (MOB-01).
     */
    const up = () => {
      if (!drawing) return
      drawing = false
      const flaeche = flaecheRef.current
      const auf = flaeche ? aufnehmen(canvas, dichteRef.current, flaeche) : null
      inhaltRef.current = auf?.stand ?? null
      ausgeben(auf ? alsWert(canvas, auf.box, dichteRef.current) : null)
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

  // Wert von außen geändert (z. B. vom Formular gelöscht) → Fläche nachziehen.
  // Eigene Ausgaben stehen schon auf der Fläche und werden übersprungen.
  useEffect(() => {
    if (value === eigenerWertRef.current) return
    eigenerWertRef.current = value
    zuruecksetzen()
    if (value) zeichneWert(value)
  }, [value])

  const clear = () => {
    zuruecksetzen()
    ausgeben(null)
  }

  /** Letzten Strich zuruecknehmen — setzt den gemerkten Stand synchron neu. */
  const undo = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prev = historyRef.current.pop()
    genRef.current++
    leeren(canvas)
    const flaeche = flaecheRef.current
    inhaltRef.current = prev?.stand && flaeche ? setzen(canvas, prev.stand, flaeche) : null
    ausgeben(prev?.wert ?? null)
  }

  // Zeichnen ist der Normalfall; Tippen die gleichwertige Alternative ohne
  // Zeigegerät. Der Wechsel verwirft eine bereits geleistete Unterschrift —
  // sie wäre im anderen Modus nicht mehr die eigene Eingabe.
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  /** Vollbild: quer, rund 2,5-fache Flaeche. */
  const [gross, setGross] = useState(false)
  const grossRef = useRef<HTMLDivElement>(null)
  /** Wo der Fokus herkam — dorthin geht er beim Schliessen zurueck. */
  const oeffnerRef = useRef<Element | null>(null)

  /*
   * Escape schliesst, der Fokus bleibt drin und kehrt zurueck — dieselbe
   * Zusage wie bei `Modal`. Zusaetzlich wird der Seitenhintergrund am
   * Scrollen gehindert: Auf dem Telefon liess sich sonst unter dem Vollbild
   * das Formular verschieben, und nach dem Schliessen stand man woanders.
   */
  useEffect(() => {
    if (!gross) return
    oeffnerRef.current = document.activeElement
    const vorher = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const aufTaste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setGross(false)
        return
      }
      if (e.key !== 'Tab') return
      const ziele = [...(grossRef.current?.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, canvas[tabindex]') ?? [])].filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      )
      if (ziele.length === 0) return
      const erstes = ziele[0]
      const letztes = ziele[ziele.length - 1]
      if (e.shiftKey && document.activeElement === erstes) {
        e.preventDefault()
        letztes.focus()
      } else if (!e.shiftKey && document.activeElement === letztes) {
        e.preventDefault()
        erstes.focus()
      }
    }
    document.addEventListener('keydown', aufTaste)
    return () => {
      document.removeEventListener('keydown', aufTaste)
      document.body.style.overflow = vorher
      ;(oeffnerRef.current as HTMLElement | null)?.focus?.()
    }
  }, [gross])
  const [typedName, setTypedName] = useState('')
  const switchMode = (m: 'draw' | 'type') => {
    if (m === mode) return
    setMode(m)
    setTypedName('')
    zuruecksetzen()
    ausgeben(null)
  }
  const tippen = () => typedName.trim() && ausgeben(typedSignatureImage(typedName.trim(), Date.now() + zeitversatzMs))

  return (
    <div>
      {/*
        Beschriftung und Knöpfe UMBRECHEN als Ganzes, statt sich gegenseitig zu
        quetschen: Die Trainee-Zeile trägt den Namen des Piloten („Trainee
        signature — Mika Beispiel"), und am Telefon blieben daneben nur noch
        wenige Millimeter für die Knöpfe. Die projektweite Umbruchregel
        (`overflow-wrap: anywhere`) griff dann genau dort, wofür sie nicht
        gedacht ist, und aus „Clear" wurde „Clea" / „r". Deshalb: die Knöpfe
        schrumpfen nicht (`shrink-0`) und brechen nicht (`whitespace-nowrap`) —
        passen sie nicht mehr neben die Beschriftung, rücken sie geschlossen in
        die nächste Zeile.
      */}
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <span className="min-w-0 text-small font-medium text-dim">{label}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {value && (
            <button onClick={clear} className="flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-micro text-dim hover:text-danger">
              <Eraser size={12} /> {t('forms:clearSignature')}
            </button>
          )}
          <button
            onClick={() => switchMode(mode === 'draw' ? 'type' : 'draw')}
            aria-pressed={mode === 'type'}
            className="flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-micro text-dim underline-offset-2 hover:text-accent hover:underline"
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
                onKeyDown={(e) => e.key === 'Enter' && tippen()}
                placeholder={t('forms:typedNamePlaceholder')}
                aria-label={label}
                className="w-full rounded-xl border border-field bg-bg/60 px-3.5 py-2.5 text-lead text-ink placeholder:text-dim outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
              />
              <button
                onClick={tippen}
                disabled={!typedName.trim()}
                className="min-h-11 shrink-0 rounded-xl border border-line/15 px-3 text-small text-ink transition hover:bg-line/5 disabled:opacity-40"
              >
                {t('forms:useTyped')}
              </button>
            </div>
          )}
          {!value && <p className="mt-1 text-micro text-dim">{t('forms:typedHint')}</p>}
        </div>
      )}
      {/* Feste Farben statt Theme-Token: die Fläche zeigt beim Zeichnen genau
          das, was später im Dokument und auf dem Ausdruck steht. Im
          Tipp-Modus bleibt der Canvas im Baum (die Zeichenlogik hängt an
          ihm), wird aber ausgeblendet. */}
      {/*
        Vollbild ist ein Dialog — und muss sich auch wie einer verhalten.

        Bis zuletzt war es nur eine Flaeche mit `fixed inset-0 z-50`: ohne
        Rolle, ohne Escape, ohne Fokusfang. Der Tabulator wanderte in die
        verdeckten Bedienelemente des Formulars dahinter, Escape tat nichts,
        und „Clear" wie der Umschalter Zeichnen/Tippen lagen in der Kopfzeile
        — also HINTER dem Overlay. Ein verrutschter Strich liess sich dort nur
        noch einzeln ueber „Zurueck" abbauen. Das widersprach der eigenen
        Zusage im README, dass jeder Dialog dieser App mit Escape schliesst
        und den Fokus haelt.
      */}
      <div
        {...(gross ? { role: 'dialog' as const, 'aria-modal': true, 'aria-label': label } : {})}
        ref={grossRef}
        className={
          gross
            ? 'fixed inset-0 z-50 flex flex-col gap-2 bg-bg p-3'
            : mode === 'type'
              ? 'hidden'
              : 'block'
        }
      >
        {gross && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 truncate text-lead font-semibold">{label}</p>
            <span className="ml-auto flex shrink-0 items-center gap-3">
              {/* Dieselben zwei Bedienelemente wie in der Kopfzeile — im
                  Vollbild waren sie schlicht nicht erreichbar.
                  „Clear" steht hier IMMER im Layout und wird nur unsichtbar
                  geschaltet (MOB-01): Kam es mit dem ersten Strich hinzu,
                  brach die Kopfzeile um, die Zeichenfläche schrumpfte mitten
                  im Unterschreiben, und jede Größenänderung leerte sie. */}
              <button
                onClick={clear}
                disabled={!value}
                className={`flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-micro text-dim hover:text-danger ${value ? '' : 'invisible'}`}
              >
                <Eraser size={12} /> {t('forms:clearSignature')}
              </button>
              <button
                onClick={() => switchMode(mode === 'draw' ? 'type' : 'draw')}
                aria-pressed={mode === 'type'}
                className="flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-micro text-dim underline-offset-2 hover:text-accent hover:underline"
              >
                {mode === 'draw' ? <Keyboard size={12} /> : <PenLine size={12} />}
                {mode === 'draw' ? t('forms:typeInstead') : t('forms:drawInstead')}
              </button>
              <button
                onClick={() => setGross(false)}
                className="min-h-11 shrink-0 rounded-xl bg-accent px-4 text-body font-semibold text-bg"
              >
                {t('forms:signDone')}
              </button>
            </span>
          </div>
        )}
      {/*
        Im Vollbild liegt das Canvas ABSOLUT in einer Fläche mit min-h-0.
        Als Flex-Element mit `min-height: auto` übernahm es sein Seitenver-
        hältnis aus den eigenen width/height-Attributen — die wiederum aus
        seiner Größe gesetzt werden. Diese Rückkopplung ließ es im Querformat
        ohne jede Eingabe wachsen (314 → 425 px in 2 s, weit über den
        Bildschirm; „Done" war nicht mehr erreichbar). Absolut positioniert
        bestimmt allein die umgebende Fläche die Größe (MOB-01).
      */}
      <div className={gross ? 'relative min-h-0 flex-1' : undefined}>
      <canvas
        hidden={mode === 'type' && !gross}
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
        className={gross ? 'absolute inset-0 h-full w-full rounded-xl border border-dashed' : 'h-36 w-full rounded-xl border border-dashed'}
      />
      </div>
      {/* Vollbild und „Strich zurueck" direkt an der Flaeche: 112 px hochkant
          waren zu wenig, um auf einem Telefon lesbar zu unterschreiben, und
          „Clear" war die einzige Korrektur. */}
      {/* Feste Mindesthöhe: Erscheint „Strich zurück" nach dem ersten Strich,
          darf die Zeile nicht wachsen — sie nähme dem Vollbild-Canvas die
          Höhe, und das leerte ihn (MOB-01). */}
      <div className="mt-1 flex min-h-11 items-center gap-3">
        {!gross && (
          <button onClick={() => setGross(true)} className="min-h-11 text-micro text-dim underline-offset-2 hover:text-accent hover:underline">
            {t('forms:signFullscreen')}
          </button>
        )}
        {historyRef.current.length > 0 && value && (
          <button onClick={undo} className="min-h-11 text-micro text-dim underline-offset-2 hover:text-accent hover:underline">
            {t('forms:signUndo')}
          </button>
        )}
        {!value && mode === 'draw' && <p className="text-micro text-dim">{t('forms:signHint')}</p>}
      </div>
      </div>
    </div>
  )
}
