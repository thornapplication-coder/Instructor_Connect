/**
 * Einheitliches Datenmodell eingelesener Dokumente (Spez. Kap. 7.1).
 *
 * Ein Prüfdokument, ein Sitzungsdokument und — ab Phase 3 — ein
 * Bibliotheksdokument sehen nach dem Einlesen gleich aus. Damit kennt die
 * Prüf-Engine nur EINE Form, egal ob PDF, DOCX oder XLSX dahinterstand.
 */

export type DocRole = 'review' | 'master'
export type DocSource = 'review' | 'library' | 'session'
export type Rechtscharakter = 'IR' | 'AMC' | 'GM' | 'CS' | 'national' | 'OEM' | 'mixed'
export type Format = 'pdf' | 'docx' | 'xlsx'

export interface DocPage {
  /** fortlaufend ab 1 (= PDF-Seite, DOCX: ungefähre Seite, XLSX: Blatt) */
  index: number
  /** gedruckte Seitenbezeichnung, z. B. "6-04-15 Page 2"; DOCX „ca. 12", XLSX Blattname */
  label?: string
  /** normalisierter Text */
  text: string
  sectionPath?: string[]
  regRefs?: string[]
  legalType?: Rechtscharakter
  isOcr?: boolean
  /** entfernte Kopf-/Fußzeilen dieser Seite (PDF) */
  rand?: string[]
}

export interface OutlineNode {
  titel: string
  ebene: number
  vonSeite: number
}

/** Was der Leser zusätzlich zur Seitenfolge findet — für Dokumentenlenkung
 *  und Formalprüfung (Spez. 7.3). Nur DOCX füllt das vollständig. */
export interface Lenkung {
  kopfzeilen: string[]
  fusszeilen: string[]
  textfelder: string[]
  aenderungen: { art: 'ins' | 'del'; text: string; autor?: string }[]
  kommentare: { autor?: string; text: string }[]
  revisionsbalken: number
  eigenschaften: Record<string, string>
}

/* ------------------- Word-Extrakt (Nachtrag v1.2) ------------------- */

/** Wirksame Zeicheneigenschaften eines Laufs — nach Auflösung von
 *  Dokumentvorgabe, Absatz- und Zeichenformatvorlage und direkter
 *  Formatierung. Farben als RRGGBB in Großbuchstaben, „auto" bleibt „auto". */
export interface Laufeigenschaften {
  farbe?: string
  /** Schriftgröße in Punkt */
  groesse?: number
  vanish?: boolean
  noProof?: boolean
  sprache?: string
  markierung?: string
  schattierung?: string
  fett?: boolean
}

export type WortOrt = 'body' | 'textfeld' | 'kopf' | 'fuss'

export interface WortAbsatz {
  nr: number
  text: string
  ort: WortOrt
  /** Datei des Teils (word/document.xml, word/header2.xml …) */
  teil: string
  stil?: string
  stilName?: string
  ebene?: number
  /** Ebene im Inhaltsverzeichnis (Formatvorlage „toc N") */
  toc?: number
  sektion: number
  /** Seite nach Word-Umbruchmarken (Näherung) */
  seiteCa: number
  tabelle?: { zeile: number; spalte: number }
}

export interface WortLauf {
  absatz: number
  text: string
  eigenschaften: Laufeigenschaften
  /** Wirksamer Hintergrund (Nachtrag N4): Lauf → Absatz → Zelle →
   *  Tabellenformatvorlage (bedingt) → Seite → weiß */
  hintergrund: string
}

export interface WortAbschnitt {
  nr: number
  kopf: { typ: string; teil: string; text: string }[]
  fuss: { typ: string; teil: string; text: string }[]
}

export interface WordExtrakt {
  absaetze: WortAbsatz[]
  laeufe: WortLauf[]
  abschnitte: WortAbschnitt[]
  /** Kopf-/Fußzeilen-Teile, die KEIN Abschnitt verwendet — oft alte Reste */
  verwaisteKopfFuss: string[]
  standard: Laufeigenschaften
  kompatibilitaet?: number
  seitenhintergrund?: string
  eigenschaften: { title?: string; creator?: string; lastModifiedBy?: string; modified?: string; seiten?: number }
  /** Feldergebnis des Inhaltsverzeichnisses: Eintrag und gedruckte Seite */
  toc: { titel: string; seite: number | null; ebene: number }[]
}

/** Woher die Seitenangaben eines Dokuments stammen (Nachtrag N5, review_runs.page_source). */
export type SeitenQuelle = 'pdf_pair' | 'toc_mapping' | 'approx' | 'native'

export interface Rohdokument {
  format: Format
  pages: DocPage[]
  outline: OutlineNode[]
  lenkung: Lenkung
  /** Seiten (1-basiert) mit kaum Text, aber Bild — Kandidaten für OCR */
  ocrKandidaten: number[]
  tabellen: number
  /** nur DOCX */
  word?: WordExtrakt
  /** nur DOCX: Einheiten (Absätze, Tabellenzeilen) in Lesereihenfolge mit
   *  geschätzter Seite — Grundlage für die Neuzuordnung über ein Word-PDF. */
  einheiten?: { text: string; seite: number; ebene?: number }[]
  seitenQuelle?: SeitenQuelle
}

export const LEERE_LENKUNG: Lenkung = {
  kopfzeilen: [],
  fusszeilen: [],
  textfelder: [],
  aenderungen: [],
  kommentare: [],
  revisionsbalken: 0,
  eigenschaften: {},
}

/** Bei jeder Änderung an Parser oder Normalisierung hochzählen — Spez. 7.7:
 *  Weicht sie ab, wird ein gespeicherter Index neu gebaut. */
export const PARSER_VERSION = '1.1.0'
