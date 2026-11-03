import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ablageParameter, type AblageParameter } from '../parse/pdfAblage'
import { pdfAblage, pdfjsLaden } from '../pdfjsLaden'
import { datei, useSitzung } from '../sitzung'
import { standardVerbindung } from '../verbindung'
import { istGesperrteTaste } from '../viewerTasten'
import { useDialogFokus } from '../../../components/ui'

/**
 * Viewer (Spez. 6.3, 9): „Seite anzeigen" öffnet das Dokument an der
 * Fundstelle, hervorgehoben. PDFs werden gerendert; DOCX und XLSX haben
 * keine Seiten im Druckbild — dort zeigt der Viewer den gelesenen Text.
 *
 * Für Bibliotheksdokumente (ab Phase 3) gilt die Sperre: kein Download,
 * kein Druck, Strg/Cmd+S und Strg/Cmd+P abgefangen. Eigene Prüf- und
 * Sitzungsdokumente hat der Nutzer selbst hochgeladen — dort gibt es
 * nichts zu sperren.
 */

export interface ViewerZiel {
  docId: string
  seite: number
  q?: string
  gesperrt?: boolean
  /** Export-ID des Befunds, von dem aus der Viewer geöffnet wurde („TM-003") — dieselbe wie im Bericht (DC-10) */
  befund?: string
}

const Ctx = createContext<(z: ViewerZiel) => void>(() => {})
export const useViewer = () => useContext(Ctx)

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [ziel, setZiel] = useState<ViewerZiel | null>(null)
  const oeffnen = useCallback((z: ViewerZiel) => setZiel(z), [])
  return (
    <Ctx.Provider value={oeffnen}>
      {children}
      {ziel && <Viewer ziel={ziel} onClose={() => setZiel(null)} />}
    </Ctx.Provider>
  )
}

type PdfAnzeige = {
  getDocument(src: { data: Uint8Array } & AblageParameter): { promise: Promise<PdfDokAnzeige>; destroy(): Promise<void> }
  Util: { transform(a: number[], b: number[]): number[] }
}
type PdfDokAnzeige = { numPages: number; getPage(n: number): Promise<PdfSeiteAnzeige> }
type PdfSeiteAnzeige = {
  getViewport(o: { scale: number }): { width: number; height: number; transform: number[]; scale: number }
  render(o: { canvasContext: CanvasRenderingContext2D; canvas: HTMLCanvasElement; viewport: unknown }): { promise: Promise<void>; cancel(): void }
  getTextContent(): Promise<{ items: { str?: string; transform?: number[]; width?: number }[] }>
}

/** Markierungen für die gesuchte Stelle aus den Textstücken der Seite. */
function markierungen(lib: PdfAnzeige, items: { str?: string; transform?: number[]; width?: number }[], q: string, vp: { transform: number[]; scale: number }) {
  const ziel = q.trim().toLowerCase()
  if (!ziel) return []
  const woerter = ziel.split(/\s+/).filter((w) => w.length >= 3)
  const passt = (s: string) => s.toLowerCase().includes(ziel) || (woerter.length > 0 && woerter.every((w) => s.toLowerCase().includes(w)))
  const treffer = items.filter((i) => i.str && i.transform && passt(i.str))
  // Ganze Phrase über mehrere Stücke verteilt: dann die Stücke mit dem längsten Wort.
  const liste = treffer.length ? treffer : items.filter((i) => i.str && i.transform && woerter.length && i.str.toLowerCase().includes(woerter.sort((a, b) => b.length - a.length)[0]))
  return liste.map((i) => {
    const tx = lib.Util.transform(vp.transform, i.transform!)
    const h = Math.hypot(tx[2], tx[3])
    return { left: tx[4], top: tx[5] - h, width: (i.width ?? 0) * vp.scale, height: h * 1.15 }
  })
}

function Viewer({ ziel, onClose }: { ziel: ViewerZiel; onClose: () => void }) {
  const { t } = useTranslation('doccheck')
  const { docs } = useSitzung()
  const d = docs.find((x) => x.id === ziel.docId)
  // DOCX mit Word-PDF (Nachtrag N5): angezeigt wird das PDF — Words Seite,
  // nicht die eigene Näherung.
  const pdfQuelle = d?.z?.format === 'pdf' ? ziel.docId : d?.z?.seitenQuelle === 'pdf_pair' && datei(`${ziel.docId}#pdf`) ? `${ziel.docId}#pdf` : null
  const istPdf = pdfQuelle !== null
  const gesamt = d?.z?.seiten ?? 1
  const [seite, setSeite] = useState(Math.min(Math.max(1, ziel.seite), gesamt))
  const [zoom, setZoom] = useState(1)
  const [text, setText] = useState<string | null>(null)
  const [marken, setMarken] = useState<{ left: number; top: number; width: number; height: number }[]>([])
  const [fehler, setFehler] = useState(false)
  const leinwand = useRef<HTMLCanvasElement>(null)
  const rahmen = useRef<HTMLDivElement>(null)
  const dokRef = useRef<{ dok: Promise<PdfDokAnzeige>; destroy: () => Promise<void> } | null>(null)

  // Fokus hinein, Tab im Kreis, Escape schließt, Fokus zurück — wie jeder Dialog
  const dialog = useRef<HTMLDivElement>(null)
  useDialogFokus(dialog, onClose)

  // Gesperrte Dokumente fangen Speichern/Drucken ab.
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (ziel.gesperrt && istGesperrteTaste(e)) e.preventDefault()
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [onClose, ziel.gesperrt])

  // PDF einmal öffnen und beim Schließen freigeben.
  useEffect(() => {
    if (!istPdf) return
    const daten = datei(pdfQuelle!)
    if (!daten) {
      setFehler(true)
      return
    }
    let aufgabe: ReturnType<PdfAnzeige['getDocument']> | null = null
    const dok = (pdfjsLaden() as unknown as Promise<PdfAnzeige>).then((lib) => {
      // Nicht eingebettete Schriften und Bilddecoder aus derselben Ablage wie
      // beim Lesen (Audit 11/2026, TEC-20)
      aufgabe = lib.getDocument({ data: daten.slice(), ...ablageParameter(pdfAblage(new URL('doccheck/', document.baseURI).href)) })
      return aufgabe.promise
    })
    dokRef.current = { dok, destroy: async () => void (await aufgabe?.destroy()) }
    return () => void dokRef.current?.destroy()
  }, [istPdf, pdfQuelle])

  // Seite rendern (PDF) bzw. Text holen (DOCX/XLSX).
  useEffect(() => {
    let abbruch = false
    if (!istPdf) {
      void standardVerbindung()
        .seitenText(ziel.docId, seite)
        .then((tx) => !abbruch && setText(tx))
      return () => void (abbruch = true)
    }
    let task: { cancel(): void } | null = null
    void (async () => {
      try {
        const lib = (await pdfjsLaden()) as unknown as PdfAnzeige
        const dok = await dokRef.current!.dok
        const p = await dok.getPage(seite)
        const breite = Math.min(rahmen.current?.clientWidth ?? 900, 1100)
        const basis = p.getViewport({ scale: 1 })
        const vp = p.getViewport({ scale: (breite / basis.width) * zoom })
        const c = leinwand.current
        if (!c || abbruch) return
        c.width = Math.floor(vp.width)
        c.height = Math.floor(vp.height)
        const r = p.render({ canvasContext: c.getContext('2d')!, canvas: c, viewport: vp })
        task = r
        await r.promise
        if (ziel.q && !abbruch) setMarken(markierungen(lib, (await p.getTextContent()).items, ziel.q, vp))
        else setMarken([])
      } catch {
        if (!abbruch) setFehler(true)
      }
    })()
    return () => {
      abbruch = true
      task?.cancel()
    }
  }, [istPdf, seite, zoom, ziel.docId, ziel.q])

  const label = d?.z?.labels[seite - 1]
  const hervorheben = (s: string) => {
    const q = ziel.q?.trim()
    if (!q) return s
    const teile = s.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return teile.map((x, i) => (i % 2 ? <mark key={i} className="rounded bg-wait/30 text-ink">{x}</mark> : x))
  }

  // `safe-rundum`: Vollbild bis unter die Systemleisten — Titel und
  // Schließen-Knopf lagen im Standalone-Betrieb unter der Statusleiste bzw.
  // im Querformat unter der Sensorkappe (Audit 11/2026, MOB-07).
  return (
    <div ref={dialog} tabIndex={-1} className="safe-rundum fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur" role="dialog" aria-modal="true" aria-label={t('viewer.titel')}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line/10 px-4 py-2">
        <p className="min-w-0 flex-1 truncate text-small font-semibold">
          {ziel.befund && <span className="mr-2 font-mono text-micro">{t('viewer.befund', { id: ziel.befund })}</span>}
          {d?.felder.titel || d?.name}
          {label && <span className="ml-2 font-normal text-dim">· {label}</span>}
        </p>
        <button aria-label={t('viewer.zurueck')} disabled={seite <= 1} onClick={() => setSeite(seite - 1)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-line/5 disabled:opacity-30">
          <ChevronLeft size={18} />
        </button>
        <span className="text-small tabular-nums text-dim" aria-live="polite">{t('viewer.seite', { seite, gesamt })}</span>
        <button aria-label={t('viewer.weiter')} disabled={seite >= gesamt} onClick={() => setSeite(seite + 1)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-line/5 disabled:opacity-30">
          <ChevronRight size={18} />
        </button>
        {istPdf && (
          <>
            <button aria-label={t('viewer.kleiner')} onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-line/5">
              <Minus size={16} />
            </button>
            <button aria-label={t('viewer.groesser')} onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-line/5">
              <Plus size={16} />
            </button>
          </>
        )}
        <button aria-label={t('viewer.schliessen')} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-line/5">
          <X size={18} />
        </button>
      </div>
      <div ref={rahmen} className="flex-1 overflow-auto p-4" onContextMenu={(e) => ziel.gesperrt && e.preventDefault()}>
        {fehler ? (
          <p className="py-major text-center text-small text-dim">{t('viewer.fehler')}</p>
        ) : istPdf ? (
          <div className="relative mx-auto w-fit shadow-soft">
            <canvas ref={leinwand} className="block bg-white" />
            {marken.map((m, i) => (
              <span key={i} className="pointer-events-none absolute rounded-sm bg-wait/35 ring-2 ring-wait" style={{ left: m.left - 2, top: m.top - 2, width: m.width + 4, height: m.height + 4 }} />
            ))}
          </div>
        ) : (
          <pre className="mx-auto max-w-3xl whitespace-pre-wrap rounded-2xl bg-surface p-section font-sans text-body leading-relaxed shadow-soft">{text === null ? '…' : hervorheben(text) || t('viewer.leer')}</pre>
        )}
      </div>
    </div>
  )
}
