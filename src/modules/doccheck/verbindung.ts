import type { Anfrage, Antwort } from './doccheck.worker'
import type { LeseAuftrag, Zusammenfassung } from './kern'
import type { Treffer } from './search/suche'
import type { ReferenzListe } from './referenz/liste'
import type { FremdBefund, Ziel } from './recheck/fremdliste'
import type { ReErgebnis } from './recheck/pruefen'
import type { Korrektur, Mitglied, PaketErgebnis } from './paket/pruefen'

/**
 * Hauptfenster-Seite des Workers: Anfragen als Promises, Fortschritt als
 * Rückruf. Ein Worker je Tab, erst beim ersten Bedarf gestartet — wer
 * DocCheck öffnet, ohne etwas hochzuladen, startet ihn nie.
 */

export interface WorkerLike {
  postMessage(a: Anfrage, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<Antwort>) => void) | null
  terminate(): void
}

export class Verbindung {
  private w: WorkerLike | null = null
  private nr = 0
  private warten = new Map<number, (x: unknown) => void>()
  private lesend = new Map<string, { ok: (z: Zusammenfassung) => void; fehler: (e: Error) => void; fort?: (s: number, g: number) => void }>()
  private ocrHoerer = new Set<(z: Zusammenfassung) => void>()

  constructor(private erzeugen: () => WorkerLike, private basis: string) {}

  private worker(): WorkerLike {
    if (this.w) return this.w
    const w = this.erzeugen()
    w.onmessage = (e) => this.empfangen(e.data)
    w.postMessage({ typ: 'init', basis: this.basis })
    this.w = w
    return w
  }

  private empfangen(a: Antwort): void {
    if (a.typ === 'fortschritt') this.lesend.get(a.id)?.fort?.(a.seite, a.gesamt)
    else if (a.typ === 'fertig') {
      const l = this.lesend.get(a.id)
      if (l) {
        this.lesend.delete(a.id)
        l.ok(a.z)
      } else this.ocrHoerer.forEach((h) => h(a.z))
    } else if (a.typ === 'fehler') {
      const l = this.lesend.get(a.id)
      this.lesend.delete(a.id)
      l?.fehler(new Error(a.code))
    } else if (a.typ === 'treffer' || a.typ === 'seite' || a.typ === 'nachgeprueft' || a.typ === 'paket') {
      const f = this.warten.get(a.nr)
      this.warten.delete(a.nr)
      f?.(a.typ === 'treffer' ? a.treffer : a.typ === 'seite' ? a.text : a.typ === 'paket' ? a.ergebnis : a.ergebnisse)
    }
  }

  lesen(auftrag: LeseAuftrag, fort?: (s: number, g: number) => void): Promise<Zusammenfassung> {
    return new Promise((ok, fehler) => {
      this.lesend.set(auftrag.id, { ok, fehler, fort })
      // Eine KOPIE übertragen: Das Original braucht der Viewer noch.
      const kopie = auftrag.daten.slice()
      this.worker().postMessage({ typ: 'lesen', auftrag: { ...auftrag, daten: kopie } }, [kopie.buffer])
    })
  }

  abbrechen(id: string): void {
    this.w?.postMessage({ typ: 'abbrechen', id })
  }

  entfernen(id: string): void {
    this.lesend.delete(id)
    this.w?.postMessage({ typ: 'entfernen', id })
  }

  titel(id: string, titel: string): void {
    this.w?.postMessage({ typ: 'titel', id, titel })
  }

  private frage<T>(a: (nr: number) => Anfrage): Promise<T> {
    const nr = ++this.nr
    return new Promise((ok) => {
      this.warten.set(nr, ok as (x: unknown) => void)
      this.worker().postMessage(a(nr))
    })
  }

  suchen(q: string): Promise<Treffer[]> {
    return this.frage((nr) => ({ typ: 'suchen', nr, q }))
  }

  seitenText(id: string, seite: number): Promise<string | null> {
    return this.frage((nr) => ({ typ: 'seite', nr, id, seite }))
  }

  /** Re-Check (N3) — liefert `null`, wenn die Verbindung inzwischen beendet wurde. */
  nachpruefen(auftraege: { befund: FremdBefund; ziel: Ziel }[]): Promise<ReErgebnis[] | null> {
    return this.frage((nr) => ({ typ: 'nachpruefen', nr, auftraege }))
  }

  /** Paketprüfung (N1, N2) — `null`, wenn die Verbindung inzwischen beendet wurde. */
  paketPruefen(struktur: Omit<Mitglied, 'pages'>[], korrekturen: Korrektur[] = []): Promise<PaketErgebnis | null> {
    return this.frage((nr) => ({ typ: 'paket', nr, struktur, korrekturen }))
  }

  ocrEinspielen(id: string, seiten: { n: number; text: string }[]): void {
    this.worker().postMessage({ typ: 'ocr', id, seiten })
  }

  /** Word-PDF-Paar (Nachtrag N5): Ergebnis kommt über `beiOcr`-Hörer
   *  wie jede nachträgliche Aktualisierung. */
  paaren(id: string, daten: Uint8Array): void {
    const kopie = daten.slice()
    this.worker().postMessage({ typ: 'paaren', id, daten: kopie }, [kopie.buffer])
  }

  /** Referenzlisten (Soll) an den Worker — neu geprüfte Dokumente kommen über die `beiOcr`-Hörer. */
  referenzen(listen: ReferenzListe[]): void {
    this.worker().postMessage({ typ: 'referenzen', listen })
  }

  beiOcr(h: (z: Zusammenfassung) => void): () => void {
    this.ocrHoerer.add(h)
    return () => this.ocrHoerer.delete(h)
  }

  /** Alles verwerfen (Abmelden, Spez. 5.4): Worker beenden, offene Zusagen lösen. */
  beenden(): void {
    this.w?.terminate()
    this.w = null
    for (const l of this.lesend.values()) l.fehler(new Error('DC-ABORTED'))
    this.lesend.clear()
    for (const f of this.warten.values()) f(null)
    this.warten.clear()
  }
}

let standard: Verbindung | null = null

/**
 * Die eine Verbindung dieses Tabs. Abmelden (Ereignis `ic-abmelden` aus dem
 * Store) beendet sie — der Worker hält Dokumentinhalte, und die dürfen die
 * Sitzung nicht überleben (Spez. 5.4).
 */
export function standardVerbindung(): Verbindung {
  if (!standard) {
    const v = new Verbindung(
      () => new Worker(new URL('./doccheck.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
      new URL('doccheck/', document.baseURI).href,
    )
    window.addEventListener('ic-abmelden', () => v.beenden())
    standard = v
  }
  return standard
}
