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

export interface Rohdokument {
  format: Format
  pages: DocPage[]
  outline: OutlineNode[]
  lenkung: Lenkung
  /** Seiten (1-basiert) mit kaum Text, aber Bild — Kandidaten für OCR */
  ocrKandidaten: number[]
  tabellen: number
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
export const PARSER_VERSION = '1.0.0'
