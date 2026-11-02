/**
 * Befunde der regelbasierten Prüfungen (Formalprüfung v1.1 Kap. 8.8,
 * Word-Check N4, Sprache/Platzhalter N9).
 *
 * Befundtexte sind IMMER englisch (Spez. Kap. 2, 10.3) — sie landen so im
 * Export. Die Oberfläche übersetzt nur Kategorien, Prioritäten und Status.
 * Die Handlungsanweisung für Word dagegen richtet sich an das Team und kommt
 * in der Sprache der Oberfläche (Schlüssel `anleitung`).
 */

import type en from '../i18n/en.json'

export type Kategorie = 'Non-Compliance' | 'Gap' | 'Inconsistency' | 'Document Control' | 'Editorial' | 'Recommendation'
export type Prioritaet = 'High' | 'Medium' | 'Low'
export type Quelle = 'formal' | 'word' | 'sprache' | 'referenz' | 'paket' | 'rechnen' | 'verweis' | 'regelwerk'

export interface Fundstelle {
  /** Seitenbezeichnung wie im Dokument („S. 12", „6-04-15 Page 2", „ca. 3") */
  seite?: string
  /** Kapitel, Kopfzeile, Tabelle, Textfeld … */
  ort?: string
  auszug: string
}

export interface Befund {
  id: string
  quelle: Quelle
  /** Schlüssel des Prüfpunkts, z. B. „unsichtbar", „revisionsstand" */
  pruefpunkt: string
  kategorie: Kategorie
  prioritaet: Prioritaet
  dokId: string
  dokName: string
  /** englisch, für den Export */
  text: string
  fundstellen: Fundstelle[]
  /** i18n-Schlüssel der Handlungsanweisung (doccheck:anleitung.*) — im Export die „Proposed Correction" */
  anleitung?: Anleitung
  /** Other Affected Documents (N1.1): Dokumente, die mit dem Befund zusammenhängen */
  weitere?: { dokId: string; dokName: string; fundstelle?: Fundstelle }[]
  /** „Not verifiable – source missing" (N11): Ziel eines Verweises nicht vorhanden */
  verifizierung: 'Verified (rule-based)' | 'Not verifiable – source missing' | 'To verify' | 'To verify – source not in library'
  status: 'Open'
}

/**
 * Schlüssel einer Handlungsanweisung — nur, was in en.json steht. Die
 * Prüfungen MÜSSEN einen setzen (`befund()` in kontext.ts, paket/pruefen.ts):
 * Rechen-, Verweis-, Regelwerks- und alle Paketbefunde hatten keinen, und
 * die Spalte „Proposed Correction" blieb in jedem Export leer (Audit
 * 11/2026, EXP-06). Ein Tippfehler im Schlüssel fällt so schon beim
 * Übersetzen auf, nicht erst als leere Zelle.
 */
export type Anleitung = keyof typeof en.anleitung

export type Ampel = 'ok' | 'wait' | 'bad' | 'na'

export interface Pruefergebnis {
  befunde: Befund[]
  /** Ampel je Prüfpunkt: ok ohne Befund, wait bei Mittel/Niedrig, bad bei Hoch, na = nicht anwendbar */
  ampel: Record<string, Ampel>
}

const RANG: Record<Prioritaet, number> = { High: 0, Medium: 1, Low: 2 }

export function sortieren(b: Befund[]): Befund[] {
  return [...b].sort((x, y) => RANG[x.prioritaet] - RANG[y.prioritaet] || x.dokName.localeCompare(y.dokName) || x.pruefpunkt.localeCompare(y.pruefpunkt))
}

/** Ampel aus Befunden für eine feste Liste von Prüfpunkten. */
export function ampelAus(punkte: string[], befunde: Befund[], nichtAnwendbar: string[] = []): Record<string, Ampel> {
  const out: Record<string, Ampel> = {}
  for (const p of punkte) {
    if (nichtAnwendbar.includes(p)) {
      out[p] = 'na'
      continue
    }
    const eigene = befunde.filter((b) => b.pruefpunkt === p)
    out[p] = eigene.some((b) => b.prioritaet === 'High') ? 'bad' : eigene.length ? 'wait' : 'ok'
  }
  return out
}

/**
 * Zahl mit Einzahl oder Mehrzahl: „1 paragraph", „3 paragraphs". Die
 * Befundtexte gehen so in alle Exporte und an die Behörde — „paragraph(s)"
 * und „1 of them look" standen dort wörtlich (Audit 11/2026, TXT-07).
 */
export function anzahl(n: number, einzahl: string, mehrzahl = `${einzahl}s`): string {
  return `${n} ${n === 1 ? einzahl : mehrzahl}`
}

/** Fortlaufende, lesbare IDs je Dokument: „F-01", „W-03", „L-02". */
export function idsVergeben(befunde: Omit<Befund, 'id'>[]): Befund[] {
  const zaehler: Record<Quelle, number> = { formal: 0, word: 0, sprache: 0, referenz: 0, paket: 0, rechnen: 0, verweis: 0, regelwerk: 0 }
  const kuerzel: Record<Quelle, string> = { formal: 'F', word: 'W', sprache: 'L', referenz: 'R', paket: 'P', rechnen: 'C', verweis: 'V', regelwerk: 'E' }
  return befunde.map((b) => ({ ...b, id: `${kuerzel[b.quelle]}-${String(++zaehler[b.quelle]).padStart(2, '0')}` }))
}

/**
 * Was von den Prüfdokumenten tatsächlich gelesen ist. Ein Scan ohne
 * Textebene lieferte keinen Befund und galt damit als „einreichungsfähig",
 * im Excel als „Ready for submission" (Audit 11/2026, DC-03): Wer nichts
 * gelesen hat, kann nichts bewerten.
 */
export interface Lesestand {
  /** Seiten, die auf die Texterkennung warten (OCR-Kandidaten) */
  ocrSeiten: number
  /** Prüfdokumente ganz ohne auswertbaren Text */
  ohneText: number
}

export const VOLL_GELESEN: Lesestand = { ocrSeiten: 0, ohneText: 0 }

export function lesestand(docs: { ocrKandidaten: number[]; pruefung?: { ohneText?: boolean } }[]): Lesestand {
  return { ocrSeiten: docs.reduce((n, d) => n + d.ocrKandidaten.length, 0), ohneText: docs.filter((d) => d.pruefung?.ohneText).length }
}

/** Warum nicht bewertbar — die Texterkennung zuerst, weil sie sich gleich starten lässt. */
export function nichtBewertbar(l: Lesestand): 'ocr' | 'ohneText' | null {
  return l.ocrSeiten > 0 ? 'ocr' : l.ohneText > 0 ? 'ohneText' : null
}

/**
 * Kopfzeile des Prüfung-Reiters. Dort stand bei einem Scan ohne Textebene
 * „1 Prüfdokument geprüft: 0 Befunde, davon 0 hoch." — dieselbe
 * Falschmeldung wie im Gate, an dritter Stelle (Audit 11/2026, DC-03,
 * Nachtrag DCF#5). Ein Hinweis darunter hob sie nicht auf, er widersprach
 * ihr nur. Als geprüft zählt deshalb nur ein Dokument, das Text hatte oder
 * trotzdem einen Befund trägt (Word-Eigenschaften, Register); jeder
 * gezählte Befund stammt so aus einem gezählten Dokument. Was nicht
 * bewertbar ist, steht getrennt und mit Grund — ein teilweise gescanntes
 * Dokument in beiden Zeilen, wie es auch das Gate sieht.
 */
export function regelStand(docs: { ocrKandidaten: number[]; pruefung?: { befunde: Pick<Befund, 'prioritaet'>[]; ohneText?: boolean } }[]): {
  geprueft: number
  befunde: number
  hoch: number
  /** Dokumente mit Seiten, die auf die Texterkennung warten */
  ocr: number
  /** Dokumente ohne lesbaren Text und ohne etwas zum Erkennen */
  ohneText: number
} {
  const mit = docs.filter((d) => d.pruefung)
  const befunde = mit.flatMap((d) => d.pruefung!.befunde)
  return {
    geprueft: mit.filter((d) => !d.pruefung!.ohneText || d.pruefung!.befunde.length > 0).length,
    befunde: befunde.length,
    hoch: befunde.filter((b) => b.prioritaet === 'High').length,
    ocr: mit.filter((d) => d.ocrKandidaten.length > 0).length,
    ohneText: mit.filter((d) => d.pruefung!.ohneText && d.ocrKandidaten.length === 0).length,
  }
}

/**
 * Was der Toast nach dem Einlesen meldet (Schlüssel unter `upload`).
 * „gelesen und geprüft – 0 Befunde" klang nach bestanden: beim Scan ohne
 * Textebene (DC-03) und ebenso bei einem Dokument, das gar keine Prüfung
 * hat — ein Sitzungsdokument (Master) oder ein Prüfdokument mit
 * abgeschalteten Prüfungen; im Bild zu Nachtrag DCF#5 stand es für einen
 * Regelwerksauszug. Geprüft heißt nur, was eine Prüfung hat, und
 * „nicht bewertbar" sagt nur, wer überhaupt bewertet wird.
 *
 * Ein Prüfdokument ohne Prüfung hat sie abgeschaltet bekommen — das sagt
 * der Toast dazu, sonst wartete man auf Befunde, die nicht kommen
 * (Audit 11/2026, DC-12).
 */
export function leseMeldung(z: { ocrKandidaten: number[]; pruefung?: { befunde: unknown[]; ohneText?: boolean } }, pruefdokument = false): {
  schluessel: 'gelesen' | 'gelesenOcr' | 'gelesenOhneText' | 'gelesenUngeprueft' | 'gelesenOcrUngeprueft' | 'gelesenOhnePruefung'
  count?: number
  ton?: 'wait'
} {
  const ocr = z.ocrKandidaten.length
  if (!z.pruefung) return ocr ? { schluessel: 'gelesenOcrUngeprueft', count: ocr, ton: 'wait' } : pruefdokument ? { schluessel: 'gelesenOhnePruefung', ton: 'wait' } : { schluessel: 'gelesenUngeprueft' }
  if (ocr) return { schluessel: 'gelesenOcr', count: ocr, ton: 'wait' }
  if (z.pruefung.ohneText) return { schluessel: 'gelesenOhneText', ton: 'wait' }
  return { schluessel: 'gelesen', count: z.pruefung.befunde.length }
}

/**
 * Submission gate (N4.3): Hoch-Befunde offen → nicht einreichungsfähig;
 * Seiten ohne gelesenen Text → nicht bewertbar (DC-03). Ob das sperrt oder
 * nur warnt, entscheidet die Einstellung — ab Werk warnt es (Entscheidung
 * des Superadmins vom 01.11.2026).
 */
export function gate(befunde: Befund[], sperrt: boolean, gelesen: Lesestand): { einreichungsfaehig: boolean; bewertbar: boolean; grund: 'ocr' | 'ohneText' | null; hoch: number; gesperrt: boolean } {
  const hoch = befunde.filter((b) => b.prioritaet === 'High' && b.status === 'Open').length
  const grund = nichtBewertbar(gelesen)
  const einreichungsfaehig = hoch === 0 && !grund
  return { einreichungsfaehig, bewertbar: !grund, grund, hoch, gesperrt: sperrt && !einreichungsfaehig }
}
