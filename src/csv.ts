/**
 * Gemeinsame CSV-Helfer für alle Exporte (Grading, Kontrolllisten).
 *
 * - Maskierung nach RFC 4180: Felder mit Trennzeichen, Anführungszeichen oder
 *   Zeilenumbruch stehen in Anführungszeichen, enthaltene Anführungszeichen
 *   werden verdoppelt. Vorher wurden Semikolons durch Kommas ersetzt — ein
 *   Wert, der selbst mit einem Anführungszeichen begann, zerriss dabei die
 *   Zeilenstruktur und hebelte den Formelschutz aus.
 * - Führende Formelzeichen (=, +, -, @, Tab, CR) werden entschärft, damit
 *   Excel/LibreOffice keine Formeln aus Nutzertexten ausführt
 * - Zahlen folgen dem Trennzeichen: bei ';' schreibt die Datei ein
 *   Dezimalkomma, damit deutsches Excel sie als Zahl liest
 * - Der Download trägt ein UTF-8-BOM, damit Umlaute in Excel korrekt
 *   erscheinen, und die Objekt-URL wird erst nach dem Download freigegeben
 */

export const CSV_SEPARATOR: string = ';'

/** Reine Zahl (auch negativ, mit Komma oder Punkt) — die braucht keinen
 *  Formelschutz und darf ihn auch nicht bekommen, sonst liest Excel eine
 *  negative Abweichung wie -0,63 als Text. */
const isPlainNumber = (s: string) => /^-?\d+([.,]\d+)?$/.test(s)

/**
 * Formelschutz (OWASP CSV Injection): =, +, -, @, Tab und CR am Anfang
 * bekommen ein Hochkomma. EINE Regel für alle CSV-Ausgaben — DocCheck
 * prüfte vorher mit einer eigenen, die den führenden Tab durchließ, und
 * seine Auszüge stammen aus fremden Dokumenten (Audit 11/2026, EXP-22).
 */
export const formelSchutz = (s: string): string => (/^[=+@\t\r]/.test(s) || (s.startsWith('-') && !isPlainNumber(s)) ? `'${s}` : s)

export const csvEsc = (v: unknown): string => {
  // Formelschutz zuerst — das vorangestellte Hochkomma darf die spätere
  // Maskierung nicht umgehen.
  const s = formelSchutz(String(v ?? ''))
  if (s.includes('"') || s.includes(CSV_SEPARATOR) || /[\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Zahl fürs Zielformat: Semikolon-Trennung bedeutet deutsches Excel und
 *  damit Dezimalkomma. Nicht-Zahlen bleiben unverändert. */
export const csvNum = (v: number | null | undefined, digits = 2): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return ''
  const s = v.toFixed(digits)
  return CSV_SEPARATOR === ';' ? s.replace('.', ',') : s
}

export const csvRow = (cells: unknown[]): string => cells.map(csvEsc).join(CSV_SEPARATOR) + '\n'

export function downloadCsv(filename: string, csv: string): void {
  // Bringt der Text sein BOM schon mit (DocCheck-CSV, `csvDatei`), kein
  // zweites: Excel zeigte es sonst als „ï»¿" vor dem ersten Spaltenkopf.
  const url = URL.createObjectURL(new Blob([csv.startsWith('\uFEFF') ? csv : '\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
