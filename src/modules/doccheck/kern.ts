import type { Duplikat, Vergleichsdokument } from './parse/duplikat'
import { dateiLesen } from './parse/lesen'
import type { ErkannteMeta } from './parse/meta'
import type { Format, OutlineNode, Rechtscharakter, Rohdokument, SeitenQuelle } from './parse/model'
import { pdfLesen } from './parse/pdf'
import { pdfDatum, pdfZuordnung, seitenAusEinheiten, teilen } from './parse/seitenzuordnung'
import type { PdfJs } from './parse/pdf'
import type { PdfAblage } from './parse/pdfAblage'
import { regelIds } from './parse/regeln'
import { Suchindex, type Treffer } from './search/suche'
import { dokumentPruefen, type Pruefung } from './pruefung/pruefen'
import { REGELN } from './pruefung/kontext'
import { regelIndex, type RegelIndex } from './pruefung/regelwerk'
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
  pruefen?: PruefSchalter
}

/** Welche regelbasierten Prüfungen laufen — Abbild der Admin-Schalter formalCheck, wordCheck, calcCheck. */
export interface PruefSchalter {
  formal: boolean
  word: boolean
  rechnen?: boolean
}

const gleicheSchalter = (a: PruefSchalter, b: PruefSchalter) => a.formal === b.formal && a.word === b.word && !!a.rechnen === !!b.rechnen

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
  private docs = new Map<string, { titel: string; name: string; roh: Rohdokument; sha256: string; meta: ErkannteMeta; duplikat: Duplikat; pdfPaar?: Zusammenfassung['pdfPaar']; pruefen?: PruefSchalter }>()

  /**
   * Zusammenfassung samt Prüfung. Die Prüfung läuft bei JEDEM Fassen neu:
   * Nach OCR oder Word-PDF-Paar stimmen Texte und Seitenangaben der alten
   * Befunde nicht mehr.
   */
  private fassen(id: string): Zusammenfassung {
    const d = this.docs.get(id)!
    const z = zusammenfassen(id, d.roh, d.sha256, d.meta, d.duplikat, d.pdfPaar)
    // Regelwerksverweise (N8) haben keinen Schalter — sie laufen, sobald ein Regelwerk geladen ist.
    if (d.pruefen && (d.pruefen.formal || d.pruefen.word || d.pruefen.rechnen || this.referenzen.length || this.regelwerk().eintraege.size)) {
      z.pruefung = dokumentPruefen({ dokId: id, dokName: d.titel, dateiname: d.name, roh: d.roh, meta: d.meta }, d.pruefen, REGELN, this.referenzen, this.regelwerk())
    }
    return z
  }
  private index = new Suchindex()
  private regeln: { index: RegelIndex; kennung: string } | null = null

  /** Regelwerke (N8) = alle Nicht-Prüfdokumente; Index zwischengespeichert, bis sich dort etwas ändert. */
  private regelwerk(): RegelIndex {
    if (!this.regeln) {
      const index = regelIndex([...this.docs.values()].filter((d) => !d.pruefen).map((d) => ({ titel: d.titel, pages: d.roh.pages })))
      const kennung = JSON.stringify([...index.eintraege.values()].map((e) => [e.schluessel, [...e.absaetze].sort()]).sort())
      this.regeln = { index, kennung }
    }
    return this.regeln.index
  }

  /**
   * Nach Lesen, OCR oder Entfernen eines Regelwerks: Hat sich der Index
   * geändert, sind alle Prüfdokumente neu zu prüfen — ihre „To verify"-
   * Befunde hängen daran. Liefert deren neue Zusammenfassungen.
   */
  private regelwerkGeaendert(): Zusammenfassung[] {
    const alt = this.regeln?.kennung
    this.regeln = null
    this.regelwerk()
    if (alt === this.regeln!.kennung) return []
    return [...this.docs.entries()].filter(([, d]) => d.pruefen).map(([id]) => this.fassen(id))
  }

  /** Aufruf nach dem Lesen: War es ein Regelwerk (kein Prüfdokument), Prüfdokumente nachziehen. */
  nachLesen(id: string): Zusammenfassung[] {
    const d = this.docs.get(id)
    return d && !d.pruefen ? this.regelwerkGeaendert() : []
  }
  private laufend = new Map<string, AbortController>()
  /** Jüngste Word-PDF-Paarung je Dokument — eine ältere, die erst danach fertig wird, zählt nicht mehr (`paaren`) */
  private paarLaeufe = new Map<string, number>()
  private referenzen: ReferenzListe[] = []
  /** Zuletzt gesetzter Schalterstand — gilt auch für Dokumente, die gerade noch gelesen werden. */
  private schalter: PruefSchalter | null = null

  /**
   * Prüfschalter geändert (Superadmin): Alle Prüfdokumente nehmen den neuen
   * Stand an und werden neu gefasst. Vorher galten die Schalter nur fürs
   * nächste Hochladen — der Hinweis „wirken sofort" stimmte nicht, und neben
   * „abgeschaltet" standen Befunde der abgeschalteten Prüfung (Audit 11/2026,
   * DC-12). Liefert nur, was sich geändert hat: Derselbe Stand noch einmal
   * (etwa beim Öffnen des Moduls) prüft nichts neu.
   */
  pruefenSetzen(schalter: PruefSchalter): Zusammenfassung[] {
    this.schalter = { ...schalter }
    const geaendert = [...this.docs.entries()].filter(([, d]) => d.pruefen && !gleicheSchalter(d.pruefen, schalter))
    for (const [, d] of geaendert) d.pruefen = { ...schalter }
    return geaendert.map(([id]) => this.fassen(id))
  }

  /**
   * Referenzlisten setzen (Soll) — alle Prüfdokumente werden neu geprüft,
   * denn eine neue Liste ändert ihre Befunde. Liefert deren Zusammenfassungen.
   */
  referenzenSetzen(listen: ReferenzListe[]): Zusammenfassung[] {
    this.referenzen = listen
    return [...this.docs.entries()].filter(([, d]) => d.pruefen).map(([id]) => this.fassen(id))
  }

  constructor(private deps: { pdfjs: () => Promise<PdfJs> } & PdfAblage) {}

  private get ablage(): PdfAblage {
    return { standardFontDataUrl: this.deps.standardFontDataUrl, wasmUrl: this.deps.wasmUrl, iccUrl: this.deps.iccUrl }
  }

  async lesen(a: LeseAuftrag, onFortschritt?: (seite: number, gesamt: number) => void): Promise<Zusammenfassung> {
    const ctrl = new AbortController()
    this.laufend.set(a.id, ctrl)
    try {
      const g = await dateiLesen({ name: a.name, daten: a.daten }, this.deps, {
        vorgabe: a.vorgabe,
        bestand: a.bestand,
        ...this.ablage,
        onFortschritt,
        signal: ctrl.signal,
      })
      // Abgebrochen, während der letzte Schritt lief: nicht mehr aufnehmen.
      if (ctrl.signal.aborted) throw new Error('DC-ABORTED')
      const titel = a.titel || g.meta.titel || a.name
      // Wurden die Schalter umgelegt, während dieses Dokument gelesen wurde,
      // gilt der neue Stand — der Auftrag trägt noch den alten (DC-12).
      const pruefen = a.pruefen && (this.schalter ? { ...this.schalter } : a.pruefen)
      this.docs.set(a.id, { titel, name: a.name, ...g, pruefen })
      this.index.hinzufuegen({ id: a.id, titel, pages: g.roh.pages })
      return this.fassen(a.id)
    } finally {
      this.laufend.delete(a.id)
    }
  }

  abbrechen(id: string): void {
    this.laufend.get(id)?.abort()
  }

  /** Entfernen; war es ein Regelwerk, kommen die neu geprüften Prüfdokumente zurück. */
  entfernen(id: string): Zusammenfassung[] {
    this.abbrechen(id)
    const warRegelwerk = this.docs.has(id) && !this.docs.get(id)!.pruefen
    this.docs.delete(id)
    this.paarLaeufe.delete(id)
    this.index.entfernen(id)
    return warRegelwerk ? this.regelwerkGeaendert() : []
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
    // OCR in einem gescannten Regelwerk kann neue Regeln sichtbar machen
    if (!d.pruefen) this.regeln = null
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
    // Nach Ablauf der Wartezeit (`paarZeitgrenze`) kann der Nutzer erneut ein
    // PDF dazulegen, während das erste noch gelesen wird. Wer zuletzt fertig
    // wird, gewänne sonst — womöglich das ALTE PDF, während der Viewer schon
    // das neue zeigt. Und ein inzwischen entferntes Dokument käme über den
    // Suchindex zurück (Gegenprüfung Audit 11/2026, Runde 3).
    const lauf = (this.paarLaeufe.get(id) ?? 0) + 1
    this.paarLaeufe.set(id, lauf)
    const veraltet = () => this.docs.get(id) !== d || this.paarLaeufe.get(id) !== lauf
    let pdfDok: Rohdokument
    try {
      pdfDok = await pdfLesen(pdf.slice(), await this.deps.pdfjs(), this.ablage)
    } catch {
      if (veraltet()) return null
      d.pdfPaar = { abweichung: 1, warnung: 'lesefehler' }
      return this.fassen(id)
    }
    if (veraltet()) return null
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
