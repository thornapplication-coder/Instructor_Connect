/**
 * Befunde der regelbasierten Prüfungen (Formalprüfung v1.1 Kap. 8.8,
 * Word-Check N4, Sprache/Platzhalter N9).
 *
 * Befundtexte sind IMMER englisch (Spez. Kap. 2, 10.3) — sie landen so im
 * Export. Die Oberfläche übersetzt nur Kategorien, Prioritäten und Status.
 * Die Handlungsanweisung für Word dagegen richtet sich an das Team und kommt
 * in der Sprache der Oberfläche (Schlüssel `anleitung`).
 */

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
  /** i18n-Schlüssel der Handlungsanweisung (doccheck:anleitung.*) */
  anleitung?: string
  /** Other Affected Documents (N1.1): Dokumente, die mit dem Befund zusammenhängen */
  weitere?: { dokId: string; dokName: string; fundstelle?: Fundstelle }[]
  /** „Not verifiable – source missing" (N11): Ziel eines Verweises nicht vorhanden */
  verifizierung: 'Verified (rule-based)' | 'Not verifiable – source missing' | 'To verify' | 'To verify – source not in library'
  status: 'Open'
}

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

/** Fortlaufende, lesbare IDs je Dokument: „F-01", „W-03", „L-02". */
export function idsVergeben(befunde: Omit<Befund, 'id'>[]): Befund[] {
  const zaehler: Record<Quelle, number> = { formal: 0, word: 0, sprache: 0, referenz: 0, paket: 0, rechnen: 0, verweis: 0, regelwerk: 0 }
  const kuerzel: Record<Quelle, string> = { formal: 'F', word: 'W', sprache: 'L', referenz: 'R', paket: 'P', rechnen: 'C', verweis: 'V', regelwerk: 'E' }
  return befunde.map((b) => ({ ...b, id: `${kuerzel[b.quelle]}-${String(++zaehler[b.quelle]).padStart(2, '0')}` }))
}

/**
 * Submission gate (N4.3): Hoch-Befunde offen → nicht einreichungsfähig.
 * Ob das sperrt oder nur warnt, entscheidet die Einstellung — ab Werk warnt
 * es (Entscheidung des Superadmins vom 01.11.2026).
 */
export function gate(befunde: Befund[], sperrt: boolean): { einreichungsfaehig: boolean; hoch: number; gesperrt: boolean } {
  const hoch = befunde.filter((b) => b.prioritaet === 'High' && b.status === 'Open').length
  return { einreichungsfaehig: hoch === 0, hoch, gesperrt: sperrt && hoch > 0 }
}
