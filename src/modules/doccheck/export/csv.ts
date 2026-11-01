import { LABELS, type Datenstand } from './datenstand'

/**
 * CSV-Befundliste (Spez. v1.1 Kap. 10.6): dieselben Spalten in derselben
 * Reihenfolge wie das Excel-Blatt „Findings". UTF-8 MIT BOM und Semikolon,
 * damit Excel mit deutscher/österreichischer Ländereinstellung die Datei
 * direkt richtig öffnet; Komma ist umstellbar.
 */

/** Wert für eine Zelle: Zeilenumbrüche → „ / ", Formelanfang entschärft, RFC-4180-Quoting. */
export function csvFeld(wert: string): string {
  let w = wert.replace(/\r\n|\r|\n/g, ' / ')
  // CSV-Injection: =, +, -, @ am Anfang würden als Formel ausgeführt
  if (/^[=+\-@]/.test(w)) w = `'${w}`
  return `"${w.replace(/"/g, '""')}"`
}

export function csvBefunde(d: Datenstand, trenner: ';' | ',' = ';'): string {
  const zeilen = [LABELS.columns, ...d.befunde.map((b) => b.spalten)]
  return `﻿${zeilen.map((z) => z.map(csvFeld).join(trenner)).join('\r\n')}\r\n`
}
