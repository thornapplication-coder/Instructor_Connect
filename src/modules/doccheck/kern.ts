import type { Duplikat, Vergleichsdokument } from './parse/duplikat'
import { dateiLesen } from './parse/lesen'
import type { ErkannteMeta } from './parse/meta'
import type { Format, OutlineNode, Rechtscharakter, Rohdokument } from './parse/model'
import type { PdfJs } from './parse/pdf'
import { regelIds } from './parse/regeln'
import { Suchindex, type Treffer } from './search/suche'

/**
 * Was im Worker läuft: Dokumente lesen, im Speicher halten, durchsuchen.
 *
 * Bewusst ohne postMessage — die Nachrichtenschicht steht in
 * doccheck.worker.ts. So ist der Kern in Node testbar, und die Worker-Datei
 * bleibt eine dünne Übersetzung.
 *
 * Gespeichert wird nichts (Spez. 4.1): Die Dokumente leben im Speicher des
 * Workers und sind mit dem Tab weg.
 */

export interface Zusammenfassung {
  id: string
  format: Format
  seiten: number
  zeichen: number
  ocrKandidaten: number[]
  ocrSeiten: number
  tabellen: number
  sha256: string
  meta: ErkannteMeta
  duplikat: Duplikat
  labels: (string | undefined)[]
  outline: OutlineNode[]
  lenkung: { aenderungen: number; kommentare: number; revisionsbalken: number; textfelder: number; kopfzeilen: number; fusszeilen: number }
}

export interface LeseAuftrag {
  id: string
  name: string
  daten: Uint8Array
  titel?: string
  vorgabe?: Rechtscharakter
  bestand?: Vergleichsdokument[]
}

function zusammenfassen(id: string, roh: Rohdokument, sha256: string, meta: ErkannteMeta, duplikat: Duplikat): Zusammenfassung {
  const l = roh.lenkung
  return {
    id,
    format: roh.format,
    seiten: roh.pages.length,
    zeichen: roh.pages.reduce((a, p) => a + p.text.length, 0),
    ocrKandidaten: roh.ocrKandidaten,
    ocrSeiten: roh.pages.filter((p) => p.isOcr).length,
    tabellen: roh.tabellen,
    sha256,
    meta,
    duplikat,
    labels: roh.pages.map((p) => p.label),
    outline: roh.outline,
    lenkung: {
      aenderungen: l.aenderungen.length,
      kommentare: l.kommentare.length,
      revisionsbalken: l.revisionsbalken,
      textfelder: l.textfelder.length,
      kopfzeilen: l.kopfzeilen.length,
      fusszeilen: l.fusszeilen.length,
    },
  }
}

export class Kern {
  private docs = new Map<string, { titel: string; roh: Rohdokument; sha256: string; meta: ErkannteMeta; duplikat: Duplikat }>()
  private index = new Suchindex()
  private laufend = new Map<string, AbortController>()

  constructor(private deps: { pdfjs: () => Promise<PdfJs>; standardFontDataUrl?: string }) {}

  async lesen(a: LeseAuftrag, onFortschritt?: (seite: number, gesamt: number) => void): Promise<Zusammenfassung> {
    const ctrl = new AbortController()
    this.laufend.set(a.id, ctrl)
    try {
      const g = await dateiLesen({ name: a.name, daten: a.daten }, this.deps, {
        vorgabe: a.vorgabe,
        bestand: a.bestand,
        standardFontDataUrl: this.deps.standardFontDataUrl,
        onFortschritt,
        signal: ctrl.signal,
      })
      // Abgebrochen, während der letzte Schritt lief: nicht mehr aufnehmen.
      if (ctrl.signal.aborted) throw new Error('DC-ABORTED')
      const titel = a.titel || g.meta.titel || a.name
      this.docs.set(a.id, { titel, ...g })
      this.index.hinzufuegen({ id: a.id, titel, pages: g.roh.pages })
      return zusammenfassen(a.id, g.roh, g.sha256, g.meta, g.duplikat)
    } finally {
      this.laufend.delete(a.id)
    }
  }

  abbrechen(id: string): void {
    this.laufend.get(id)?.abort()
  }

  entfernen(id: string): void {
    this.abbrechen(id)
    this.docs.delete(id)
    this.index.entfernen(id)
  }

  /** Titel geändert (Nutzer hat den erkannten Wert korrigiert) — Treffer sollen ihn zeigen. */
  titelSetzen(id: string, titel: string): void {
    const d = this.docs.get(id)
    if (!d || d.titel === titel) return
    d.titel = titel
    this.index.hinzufuegen({ id, titel, pages: d.roh.pages })
  }

  suchen(q: string, max?: number): Treffer[] {
    return this.index.suchen(q, max)
  }

  seitenText(id: string, seite: number): string | null {
    return this.docs.get(id)?.roh.pages[seite - 1]?.text ?? null
  }

  /**
   * OCR-Ergebnisse übernehmen. Die Seite wird als OCR markiert (Spez. 7.2) —
   * ein Zitat von dort ist unsicherer und soll so gekennzeichnet bleiben.
   */
  ocrEinspielen(id: string, seiten: { n: number; text: string }[]): Zusammenfassung | null {
    const d = this.docs.get(id)
    if (!d) return null
    for (const { n, text } of seiten) {
      const p = d.roh.pages[n - 1]
      if (!p) continue
      p.text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
      p.isOcr = true
      const refs = regelIds(p.text)
      if (refs.length) p.regRefs = refs
      else delete p.regRefs
    }
    d.roh.ocrKandidaten = d.roh.ocrKandidaten.filter((n) => !seiten.some((s) => s.n === n))
    this.index.hinzufuegen({ id, titel: d.titel, pages: d.roh.pages })
    return zusammenfassen(id, d.roh, d.sha256, d.meta, d.duplikat)
  }

  get anzahl(): number {
    return this.docs.size
  }
}
