import type { Duplikat, Vergleichsdokument } from './parse/duplikat'
import { dateiLesen } from './parse/lesen'
import type { ErkannteMeta } from './parse/meta'
import type { Format, OutlineNode, Rechtscharakter, Rohdokument, SeitenQuelle } from './parse/model'
import { pdfLesen } from './parse/pdf'
import { pdfDatum, pdfZuordnung, seitenAusEinheiten, teilen } from './parse/seitenzuordnung'
import type { PdfJs } from './parse/pdf'
import { regelIds } from './parse/regeln'
import { Suchindex, type Treffer } from './search/suche'
import { dokumentPruefen, type Pruefung } from './pruefung/pruefen'
import { REGELN } from './pruefung/kontext'
import type { ReferenzListe } from './referenz/liste'
import { befundPruefen, type ReErgebnis } from './recheck/pruefen'
import type { FremdBefund, Ziel } from './recheck/fremdliste'
import { paketPruefen, type Korrektur, type Mitglied, type PaketErgebnis } from './paket/pruefen'

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
  /** Herkunft der Seitenangaben (Nachtrag N5) */
  seitenQuelle: SeitenQuelle
  /** Ergebnis einer Word-PDF-Paarung, falls versucht */
  pdfPaar?: { abweichung: number; warnung?: 'abweichung' | 'aelter' | 'lesefehler' }
  /** Umfang des Word-Extrakts (N4) — Zahlen, nicht Inhalte */
  word?: { laeufe: number; abschnitte: number; toc: number; verwaisteKopfFuss: number }
  /** Formalprüfung, Word-Check, Sprache/Platzhalter — nur bei Prüfdokumenten */
  pruefung?: Pruefung
}

/** Ab diesem Anteil nicht wiedergefundenen Textes gilt das PDF nicht als Abbild des DOCX (N5.2). */
export const PAAR_SCHWELLE = 0.02

export interface LeseAuftrag {
  id: string
  name: string
  daten: Uint8Array
  titel?: string
  vorgabe?: Rechtscharakter
  bestand?: Vergleichsdokument[]
  /** Regelbasierte Prüfungen nach dem Einlesen (nur Prüfdokumente, Spez. 8.8) */
  pruefen?: { formal: boolean; word: boolean; rechnen?: boolean }
}

function zusammenfassen(id: string, roh: Rohdokument, sha256: string, meta: ErkannteMeta, duplikat: Duplikat, pdfPaar?: Zusammenfassung['pdfPaar']): Zusammenfassung {
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
    seitenQuelle: roh.seitenQuelle ?? 'native',
    ...(pdfPaar ? { pdfPaar } : {}),
    ...(roh.word ? { word: { laeufe: roh.word.laeufe.length, abschnitte: roh.word.abschnitte.length, toc: roh.word.toc.length, verwaisteKopfFuss: roh.word.verwaisteKopfFuss.length } } : {}),
  }
}

export class Kern {
  private docs = new Map<string, { titel: string; name: string; roh: Rohdokument; sha256: string; meta: ErkannteMeta; duplikat: Duplikat; pdfPaar?: Zusammenfassung['pdfPaar']; pruefen?: LeseAuftrag['pruefen'] }>()

  /**
   * Zusammenfassung samt Prüfung. Die Prüfung läuft bei JEDEM Fassen neu:
   * Nach OCR oder Word-PDF-Paar stimmen Texte und Seitenangaben der alten
   * Befunde nicht mehr.
   */
  private fassen(id: string): Zusammenfassung {
    const d = this.docs.get(id)!
    const z = zusammenfassen(id, d.roh, d.sha256, d.meta, d.duplikat, d.pdfPaar)
    if (d.pruefen && (d.pruefen.formal || d.pruefen.word || d.pruefen.rechnen || this.referenzen.length)) {
      z.pruefung = dokumentPruefen({ dokId: id, dokName: d.titel, dateiname: d.name, roh: d.roh, meta: d.meta }, d.pruefen, REGELN, this.referenzen)
    }
    return z
  }
  private index = new Suchindex()
  private laufend = new Map<string, AbortController>()
  private referenzen: ReferenzListe[] = []

  /**
   * Referenzlisten setzen (Soll) — alle Prüfdokumente werden neu geprüft,
   * denn eine neue Liste ändert ihre Befunde. Liefert deren Zusammenfassungen.
   */
  referenzenSetzen(listen: ReferenzListe[]): Zusammenfassung[] {
    this.referenzen = listen
    return [...this.docs.entries()].filter(([, d]) => d.pruefen).map(([id]) => this.fassen(id))
  }

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
      this.docs.set(a.id, { titel, name: a.name, ...g, pruefen: a.pruefen })
      this.index.hinzufuegen({ id: a.id, titel, pages: g.roh.pages })
      return this.fassen(a.id)
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
    return this.fassen(id)
  }

  /**
   * Word-PDF-Paar (Nachtrag N5): Seitenzahlen aus dem PDF übernehmen, wenn
   * es den DOCX-Text trägt (≤ 2 % Abweichung) und nicht älter ist als das
   * DOCX. Sonst bleibt die bisherige Zuordnung, mit Warnung.
   */
  async paaren(id: string, pdf: Uint8Array): Promise<Zusammenfassung | null> {
    const d = this.docs.get(id)
    if (!d || d.roh.format !== 'docx' || !d.roh.einheiten) return null
    let pdfDok: Rohdokument
    try {
      pdfDok = await pdfLesen(pdf.slice(), await this.deps.pdfjs(), { standardFontDataUrl: this.deps.standardFontDataUrl })
    } catch {
      d.pdfPaar = { abweichung: 1, warnung: 'lesefehler' }
      return this.fassen(id)
    }
    const { schnitte, abweichung } = pdfZuordnung(d.roh.einheiten, pdfDok.pages.map((p) => p.text))
    const pdfZeit = pdfDatum(pdfDok.lenkung.eigenschaften.pdfDatum)
    const docxZeit = d.roh.word?.eigenschaften.modified ? Date.parse(d.roh.word.eigenschaften.modified) : NaN
    // Eine Minute Spielraum: Word schreibt das PDF beim Export, oft wenige
    // Sekunden VOR dem letzten Speichern des DOCX.
    const aelter = pdfZeit !== null && !Number.isNaN(docxZeit) && pdfZeit < docxZeit - 60_000
    if (abweichung > PAAR_SCHWELLE || aelter) {
      d.pdfPaar = { abweichung, warnung: aelter ? 'aelter' : 'abweichung' }
      return this.fassen(id)
    }
    const stuecke = teilen(d.roh.einheiten, schnitte)
    const { pages, outline } = seitenAusEinheiten(stuecke.einheiten, stuecke.seiten, (n) => `S. ${n}`)
    d.roh.pages = pages
    d.roh.outline = outline
    d.roh.seitenQuelle = 'pdf_pair'
    d.pdfPaar = { abweichung }
    this.index.hinzufuegen({ id, titel: d.titel, pages })
    return this.fassen(id)
  }

  /**
   * Re-Check einer Fremdliste (Nachtrag N3): jeder Befund gegen das ganze
   * Paket — alle Prüfdokumente, nicht nur das genannte (N3.4).
   */
  nachpruefen(auftraege: { befund: FremdBefund; ziel: Ziel }[]): ReErgebnis[] {
    const alle = [...this.docs.entries()].map(([id, d]) => ({ id, titel: d.titel, pages: d.roh.pages, outline: d.roh.outline, pruefen: !!d.pruefen }))
    // Master- und Sitzungsdokumente sind die Quelle wörtlicher Zitate (N3.4).
    const paket = alle.filter((d) => d.pruefen)
    const quellen = alle.filter((d) => !d.pruefen)
    return auftraege.map((a) => befundPruefen(a.befund, a.ziel, paket, quellen))
  }

  /**
   * Paketprüfung (Nachtrag N1, N2). Die Struktur (Kürzel, Ebene, Gruppe,
   * Revision) kommt aus der Sitzung — der Nutzer hat sie bestätigt —, die
   * Texte aus dem Speicher des Workers. Unbekannte IDs fallen weg.
   */
  paketPruefen(struktur: Omit<Mitglied, 'pages'>[], korrekturen: Korrektur[] = []): PaketErgebnis {
    const alle = struktur.filter((s) => this.docs.has(s.id)).map((s) => ({ ...s, pages: this.docs.get(s.id)!.roh.pages, outline: this.docs.get(s.id)!.roh.outline }))
    return paketPruefen(alle, korrekturen)
  }

  get anzahl(): number {
    return this.docs.size
  }
}
