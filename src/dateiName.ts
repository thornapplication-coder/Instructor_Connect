/**
 * Namen ausgehender Dateien und gedruckter Dokumente — EIN Schema.
 *
 * Audit 11/2026, EXM-10/FN-01/EXM-04: Jede Ansicht baute ihren Dateinamen
 * selbst. `replace(/[^\w-]+/g, '-')` ohne u-Flag kennt nur ASCII — aus
 * „Änderung Lärmschutzverfahren Übung" wurde
 * „-nderung-L-rmschutzverfahren-bung". Der Grading-Druckname klebte
 * „OPC Recurrent" zu „OPCRecurrent" zusammen, und Momentaufnahmen ohne
 * Datum wurden im Downloadordner zu „(1)"-Kopien.
 *
 * Zwei Funktionen, weil es zwei Zwecke sind:
 *  - `dateiName` fuer Downloads: Teile mit „_" verbunden; in jedem Teil wird
 *    alles ausser Buchstaben, Ziffern, Punkt, Unterstrich und Bindestrich zu
 *    „-" — Unicode-fest, Umlaute bleiben. Das Stand-Datum steht hinten und
 *    wird beim Kuerzen nie abgeschnitten: Es unterscheidet zwei Auszuege.
 *  - `druckTitel` fuer `document.title`: Den schlaegt der Browser beim
 *    „Als PDF sichern" als Dateinamen vor und schreibt ihn als Titel ins PDF.
 *    Er bleibt lesbar (Leerzeichen, Datum DD.MM.YYYY wie in der App);
 *    ersetzt wird nur, was ein Dateiname nicht tragen darf.
 *
 * Die Endung haengt der Aufrufer an — sie gehoert zum Format, nicht zum Namen.
 */

/** Hoechstlaenge in Zeichen, ohne Endung. Unter den 255 Bytes, die
 *  Windows und die ueblichen Dateisysteme fuer einen Namen erlauben, auch
 *  wenn der Downloadordner noch „ (1)" anhaengt. */
export const NAME_MAX = 120

/** Fallback, wenn kein Teil etwas traegt — derselbe Name wie index.html. */
const APP = 'Instructor Connect'

/** Unter Windows in Dateinamen verboten; „/" auch ueberall sonst. */
const VERBOTEN = /[\\/:*?"<>|]/g

/**
 * Formatzeichen: unsichtbar, aber im Namen wirksam — U+202E (Schreibrichtung
 * umkehren) macht aus „…exe.pdf" auf dem Bildschirm „…fdp.exe"; ein weiches
 * Trennzeichen aus einem kopierten Word-Text truege ein „-" mitten ins Wort.
 * Sie fallen ersatzlos weg.
 */
const FORMAT = /\p{Cf}/gu
/** Steuerzeichen (Zeilenumbruch, Tabulator, NUL …) */
const STEUER = /\p{Cc}/gu

/** Auf `max` Zeichen kuerzen, ohne ein Zeichen ausserhalb der BMP zu teilen. */
function kuerzen(s: string, max: number): string {
  const zeichen = Array.from(s)
  return zeichen.length <= max ? s : zeichen.slice(0, max).join('')
}

/** Ein Teil eines Downloadnamens. Punkte vorn ergaeben eine versteckte
 *  Datei, Punkte hinten streicht Windows stillschweigend. */
function teilFuerDatei(teil: string): string {
  return teil
    .normalize('NFC')
    .replace(FORMAT, '')
    // Steuerzeichen und Leerraum trennen Woerter — sie werden zu „-" wie alles
    // andere, das kein Buchstabe, keine Ziffer und kein . _ - ist.
    .replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
}

/**
 * Downloadname aus Teilen, z. B.
 * `dateiName(['read-confirmations', 'Änderung Lärmschutz'], '2026-11-02')`
 * → `read-confirmations_Änderung-Lärmschutz_2026-11-02`.
 * Leere Teile entfallen. `tag` ist das Stand-Datum (`lokalerTag`, datum.ts).
 */
export function dateiName(teile: readonly (string | null | undefined)[], tag?: string): string {
  const stand = tag ? teilFuerDatei(tag) : ''
  const platz = NAME_MAX - (stand ? Array.from(stand).length + 1 : 0)
  const stamm = kuerzen(
    teile
      .map((t) => teilFuerDatei(t ?? ''))
      .filter(Boolean)
      .join('_'),
    platz,
  ).replace(/[-._]+$/, '')
  const name = [stamm, stand].filter(Boolean).join('_')
  return name || teilFuerDatei(APP)
}

/**
 * Titel eines gedruckten Dokuments aus Teilen, mit „_" verbunden — z. B.
 * „308A_Grading Sheet TR_Sophie Berger_Mika Beispiel_05.08.2026_OPC Recurrent".
 * Leerraum (auch Zeilenumbrueche) wird zu einem Leerzeichen, verbotene
 * Zeichen zu „-", leere Teile entfallen.
 */
export function druckTitel(teile: readonly (string | null | undefined)[]): string {
  const titel = kuerzen(
    teile
      .map((t) =>
        (t ?? '')
          .normalize('NFC')
          .replace(FORMAT, '')
          .replace(/\s+/g, ' ')
          .replace(STEUER, '')
          .replace(VERBOTEN, '-')
          .trim(),
      )
      .filter(Boolean)
      .join('_'),
    NAME_MAX,
  ).replace(/^[\s.]+|[\s._-]+$/g, '')
  return titel || APP
}
