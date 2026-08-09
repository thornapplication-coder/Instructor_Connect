/**
 * Gemeinsame CSV-Helfer für alle Exporte (Grading, Kontrolllisten).
 *
 * - Trennzeichen ';' wird aus Werten entfernt, Zeilenumbrüche geglättet
 * - Führende Formelzeichen (=, +, -, @) werden entschärft, damit Excel/
 *   LibreOffice keine Formeln aus Nutzertexten ausführt
 * - Der Download trägt ein UTF-8-BOM, damit Umlaute in Excel korrekt
 *   erscheinen, und die Objekt-URL wird erst nach dem Download freigegeben
 */
export const csvEsc = (v: unknown): string => {
  let s = String(v ?? '').replace(/;/g, ',').replace(/\r?\n/g, ' ')
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  return s
}

export const csvRow = (cells: unknown[]): string => cells.map(csvEsc).join(';') + '\n'

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
