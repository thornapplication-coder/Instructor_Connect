import { vorhandenerEintrag } from './einstellungen'

/**
 * Auswahlwerte eines Formularfelds (Event, Location, Varianten, ATA-Kapitel
 * …) hinzufügen, umbenennen und entfernen — über die STELLE in der Liste,
 * nicht über den Wert.
 *
 * Audit 11/2026, GRD-17/A11Y-02: Der Editor suchte den bearbeiteten Eintrag
 * über seinen Wert und führte ihn auch als React-Schlüssel. Jeder Tastendruck
 * änderte damit den Schlüssel, das Feld wurde neu eingehängt, der Fokus fiel
 * auf <body> — umbenennen ging nur ein Zeichen je Klick. Zwei gleichlautende
 * Einträge hätte die Wertsuche zudem gemeinsam umbenannt.
 *
 * Abgelehnt werden leere Werte und Dubletten. Dublette heißt wie in den
 * Chip-Listen der Einstellungen: gleich bis auf Groß-/Kleinschreibung und
 * Leerraum (`vorhandenerEintrag`) — „ffs" neben „FFS" wäre im Formular zwei
 * Einträge für dieselbe Sache.
 */

export type OptionErgebnis =
  | { ok: true; options: string[] }
  /** `vorhanden`: der Eintrag, mit dem der neue Wert kollidiert — in SEINER
   *  Schreibweise, damit die Meldung ihn so nennt, wie er in der Liste steht. */
  | { ok: false; grund: 'leer' | 'doppelt'; vorhanden?: string }

/** Bereinigter Wert — oder der Grund, warum er nicht in die Liste darf. */
function pruefen(andere: string[], wert: string): Extract<OptionErgebnis, { ok: false }> | string {
  const v = wert.trim()
  if (!v) return { ok: false, grund: 'leer' }
  const vorhanden = vorhandenerEintrag(andere, v)
  if (vorhanden !== undefined) return { ok: false, grund: 'doppelt', vorhanden }
  return v
}

/** Eintrag an Stelle `i` umbenennen; alle übrigen bleiben unverändert. Der
 *  eigene alte Wert zählt nicht als Dublette — „fFS" → „FFS" ist erlaubt. */
export function optionUmbenennen(options: string[], i: number, wert: string): OptionErgebnis {
  if (i < 0 || i >= options.length) return { ok: true, options }
  const v = pruefen(
    options.filter((_, j) => j !== i),
    wert,
  )
  if (typeof v !== 'string') return v
  return { ok: true, options: options.map((o, j) => (j === i ? v : o)) }
}

/** Neuen Eintrag ans Ende anfügen. */
export function optionHinzufuegen(options: string[], wert: string): OptionErgebnis {
  const v = pruefen(options, wert)
  if (typeof v !== 'string') return v
  return { ok: true, options: [...options, v] }
}

/** Eintrag an Stelle `i` entfernen — nur diesen, auch wenn ein anderer
 *  gleich lautet (Altbestand vor dieser Regel). */
export function optionEntfernen(options: string[], i: number): string[] {
  return options.filter((_, j) => j !== i)
}
