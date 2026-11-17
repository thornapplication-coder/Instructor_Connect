/**
 * Zeitsprung-Lauf (Nachtlauf, `.github/workflows/nachtlauf.yml`): Mit
 * `TEST_UHR` läuft die ganze Suite so, als wäre es dieser Zeitpunkt — und
 * die Uhr läuft von dort normal weiter.
 *
 * Wozu: Ein Test, der nur „heute" grün ist, und ein Datumsfehler, der nur
 * an der Umstellung auf Sommerzeit, zu Silvester oder am 29. Februar
 * zuschlägt, fallen sonst erst auf, wenn der Kalender dort ankommt — im
 * Betrieb. EXM-01 (Datum von gestern kurz nach Mitternacht) war genau so
 * ein Fehler: In der CI (UTC) unsichtbar.
 *
 * Tests, die die Zeit selbst stellen (`vi.useFakeTimers`, `setSystemTime`),
 * bleiben bei ihrer Zeit: Die Attrappe ersetzt dieses `Date` und setzt es
 * beim Abbau wieder ein.
 */
export function uhrVersetzen(ziel: number): () => void {
  const Echt = globalThis.Date
  const versatz = ziel - Echt.now()
  class Versetzt extends Echt {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(Echt.now() + versatz)
      else super(...(args as [string | number | Date]))
    }
    static now(): number {
      return Echt.now() + versatz
    }
  }
  globalThis.Date = Versetzt as DateConstructor
  return () => {
    globalThis.Date = Echt
  }
}

/** Zeitpunkt aus `TEST_UHR` — nur ein vollständiger mit Zeitzone, sonst lieber gar keiner. */
export function testUhr(wert: string | undefined): number | null {
  if (!wert) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(wert)) throw new Error(`TEST_UHR braucht Datum, Uhrzeit und Zone (z. B. 2027-03-28T01:59:30+01:00), nicht „${wert}"`)
  return Date.parse(wert)
}

const ziel = testUhr(process.env.TEST_UHR)
if (ziel !== null) uhrVersetzen(ziel)
