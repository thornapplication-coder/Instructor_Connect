import { formelSchutz } from '../../../csv'
import type { CsvTrenner } from '../types'
import { LABELS, type Datenstand } from './datenstand'

/**
 * CSV-Befundliste (Spez. v1.1 Kap. 10.6): dieselben Spalten in derselben
 * Reihenfolge wie das Excel-Blatt „Findings". UTF-8 MIT BOM und Semikolon,
 * damit Excel mit deutscher/österreichischer Ländereinstellung die Datei
 * direkt richtig öffnet; Komma stellt der Superadmin um (`csvTrenner`).
 */

/** Wert für eine Zelle: Zeilenumbrüche → „ / ", Formelanfang entschärft, RFC-4180-Quoting. */
export function csvFeld(wert: string): string {
  // Erst die Umbrüche: Ein führendes CR wird so zu „ / " und braucht keinen
  // Schutz mehr; den Rest (=, +, -, @, Tab) regelt dieselbe Funktion wie in
  // jeder anderen CSV der App (Audit 11/2026, EXP-22).
  const w = formelSchutz(wert.replace(/\r\n|\r|\n/g, ' / '))
  return `"${w.replace(/"/g, '""')}"`
}

/**
 * Eine ganze CSV-Datei: BOM, alle Felder gequotet, CRLF. JEDE DocCheck-CSV
 * entsteht hier — die Re-Check-CSV baute vorher mit dem App-Helfer einen
 * zweiten Dialekt (LF, Quoting nur bei Bedarf, echte Umbrüche im Remark)
 * (Audit 11/2026, EXP-17).
 */
export function csvDatei(zeilen: string[][], trenner: CsvTrenner = ';'): string {
  return `﻿${zeilen.map((z) => z.map(csvFeld).join(trenner)).join('\r\n')}\r\n`
}

export function csvBefunde(d: Datenstand, trenner: CsvTrenner = ';'): string {
  return csvDatei([LABELS.columns, ...d.befunde.map((b) => b.spalten)], trenner)
}
