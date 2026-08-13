/**
 * Angefangene Grading-Formulare wiederfinden.
 *
 * Ein Entwurf lag lange unsichtbar in `localStorage`: Nach dem Neuladen
 * landete man auf der leeren Typauswahl, die Liste zeigte nichts — im
 * Zweifel begann eine halbe Stunde Bewertung von vorn.
 *
 * Gelesen wird derselbe Schlüssel, den das Formular schreibt:
 * `aaa-draft-<user>-<bezug>-<typ>`. `<bezug>` ist `new` bei einem neuen
 * Blatt oder die Kennung des Ausgangsblatts, wenn es ein Folgeformular ist
 * (306/310). Gesucht wird deshalb über den Nutzer und nicht über `new` —
 * sonst tauchte ein angefangenes 306 hier nie auf, obwohl es genau das
 * Blatt ist, an das man erinnert werden will.
 *
 * Die Funktion lag als Hilfsfunktion in `Grading.tsx` und war damit von der
 * Testpflicht befreit — beide Wachen des Projekts globen auf `src/*.ts`. Die
 * Dateiendung ist kein Grund; deshalb steht sie jetzt hier.
 */

export type Draft = {
  /** Der localStorage-Schlüssel — Grundlage fürs Öffnen und Verwerfen. */
  key: string
  formTypeId: string
  /** Wer bewertet wird; leer, wenn noch niemand eingetragen ist. */
  wer: string
  /** Wie viele Noten schon gesetzt sind … */
  noten: number
  /** … von wie vielen insgesamt. */
  gesamt: number
}

/** Rohform eines gespeicherten Entwurfs — bewusst tolerant gelesen. */
type RohEntwurf = {
  trainees?: { traineeName?: string; grades?: { grade: number | 'NO' | null }[] }[]
  header?: Record<string, string>
}

export function readDrafts(userId: string, speicher: Storage = localStorage): Draft[] {
  try {
    const prefix = `aaa-draft-${userId}-`
    return Object.keys(speicher)
      .filter((k) => k.startsWith(prefix))
      .map((k) => {
        // Ein beschädigter Eintrag darf nicht die ganze Liste kosten: Der
        // Entwurf ist dann verloren, die übrigen sind es nicht.
        let d: RohEntwurf = {}
        try {
          d = JSON.parse(speicher.getItem(k) ?? '{}') as RohEntwurf
        } catch {
          d = {}
        }
        const trainees = d.trainees ?? []
        return {
          key: k,
          // Der Rest hinter dem Nutzer ist `<bezug>-<typ>`; der Typ steht
          // hinter dem letzten Strich.
          formTypeId: k.slice(k.lastIndexOf('-') + 1),
          wer: trainees.map((x) => x.traineeName?.trim()).filter(Boolean).join(', ') || d.header?.traineeName || '',
          noten: trainees.reduce((n, x) => n + (x.grades ?? []).filter((g) => g.grade !== null).length, 0),
          gesamt: trainees.reduce((n, x) => n + (x.grades ?? []).length, 0),
        }
      })
  } catch {
    // Ohne localStorage (private Fenster mit gesperrtem Speicher) gibt es
    // keine Entwürfe — das ist kein Fehler, nur nichts zu zeigen.
    return []
  }
}

/**
 * Kurze Zeitangabe für Listen: heute die Uhrzeit, in der letzten Woche der
 * Wochentag, davor das Datum.
 *
 * Die Chatliste nannte an dieser Stelle die Aufbewahrungsfrist — eine
 * Angabe, die für jede Gruppe gleich war und deshalb nichts unterschied.
 * Was man in einer Liste sucht, ist „wann zuletzt".
 */
export function kurzeZeit(ts: number, lng: string, jetzt: number): string {
  const locale = lng === 'de' ? 'de-AT' : 'en-GB'
  const tagMs = 24 * 3600_000
  const heute = new Date(jetzt).setHours(0, 0, 0, 0)
  if (ts >= heute) return new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (ts >= heute - 6 * tagMs) return new Date(ts).toLocaleDateString(locale, { weekday: 'short' })
  return new Date(ts).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
}
