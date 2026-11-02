import { describe, expect, it } from 'vitest'
import { dateiName, druckTitel, NAME_MAX } from './dateiName'

/**
 * Dateinamen und Drucktitel (Audit 11/2026, EXM-10, FN-01, EXM-04).
 *
 * Bewacht wird, was schon einmal falsch war: Umlaute fielen aus Namen
 * (`[^\w-]` ohne u-Flag kennt nur ASCII), der Grading-Druckname klebte
 * Woerter zusammen („OPCRecurrent"), und Momentaufnahmen ohne Datum
 * ueberschrieben sich im Downloadordner.
 */

/** Was in einem Dateinamen unter Windows nicht stehen darf, dazu Steuerzeichen. */
const PFADZEICHEN = /[\\/:*?"<>|\p{Cc}]/u

describe('dateiName', () => {
  it('behaelt Umlaute und ersetzt Leerraum durch „-" (FN-01)', () => {
    expect(dateiName(['Jürgen Müller'])).toBe('Jürgen-Müller')
    expect(dateiName(['read-confirmations', 'Änderung Lärmschutz „Übung" 2026'])).toBe('read-confirmations_Änderung-Lärmschutz-Übung-2026')
  })

  it('laesst keine Pfad- oder Steuerzeichen stehen', () => {
    expect(dateiName(['a/b:c'])).toBe('a-b-c')
    const name = dateiName(['..\\..\\boot', 'x*y?z"<>|', 'Zeile1\nZeile2\tEnde', 'nul\u0000l'])
    expect(name).not.toMatch(PFADZEICHEN)
    expect(name).toBe('boot_x-y-z_Zeile1-Zeile2-Ende_nul-l')
  })

  it('beginnt nicht mit einem Punkt und endet nicht mit einem (versteckte Datei, Windows)', () => {
    expect(dateiName(['.profile.'])).toBe('profile')
    expect(dateiName(['- Notiz -'])).toBe('Notiz')
  })

  it('verwirft Formatzeichen, statt sie zu Trennern zu machen', () => {
    // U+202E dreht die Schreibrichtung um; das weiche Trennzeichen kommt aus Word.
    // Als Escape geschrieben: Unsichtbar im Quelltext saehe niemand, was
    // hier geprueft wird.
    expect(dateiName(['Bericht\u202efdp.exe'])).toBe('Berichtfdp.exe')
    expect(dateiName(['Lärm\u00adschutz'])).toBe('Lärmschutz')
  })

  it('setzt zerlegte Umlaute zusammen (macOS liefert „u" + Trema)', () => {
    expect(dateiName(['Mu\u0308ller'])).toBe('M\u00fcller')
  })

  it('haengt das Stand-Datum an (EXM-10)', () => {
    expect(dateiName(['aaa-logbook', 'Sophie Berger'], '2026-11-02')).toBe('aaa-logbook_Sophie-Berger_2026-11-02')
  })

  it('laesst leere Teile entfallen', () => {
    expect(dateiName(['Bericht', '', null, undefined, '   ', 'CL30'], '2026-11-02')).toBe('Bericht_CL30_2026-11-02')
  })

  it('hat einen Namen, auch wenn kein Teil etwas traegt', () => {
    expect(dateiName([])).toBe('Instructor-Connect')
    expect(dateiName(['///'])).toBe('Instructor-Connect')
    expect(dateiName([], '2026-11-02')).toBe('2026-11-02')
  })

  it('kuerzt auf hoechstens 120 Zeichen — das Datum bleibt dabei stehen', () => {
    const lang = 'Änderung '.repeat(40)
    const name = dateiName(['read-confirmations', lang], '2026-11-02')
    expect(Array.from(name).length).toBeLessThanOrEqual(NAME_MAX)
    expect(NAME_MAX).toBe(120)
    expect(name.endsWith('_2026-11-02')).toBe(true)
    // Kein Trenner vor dem Datum, der vom Abschneiden uebrig blieb.
    expect(name).not.toMatch(/[-_.]_2026-11-02$/)
    // Der Schnitt faellt genau hinter ein „-" (12 × 10 Zeichen) — es bleibt nicht stehen.
    expect(dateiName(['abcdefghi '.repeat(20)])).toBe('abcdefghi-'.repeat(12).slice(0, -1))
  })

  it('teilt beim Kuerzen kein Zeichen ausserhalb der BMP', () => {
    const name = dateiName(['𝔄'.repeat(200)])
    expect(Array.from(name)).toHaveLength(NAME_MAX)
    expect(name).toBe('𝔄'.repeat(NAME_MAX))
  })
})

describe('druckTitel', () => {
  it('behaelt Wortgrenzen, Umlaute und das Datum der App (EXM-10)', () => {
    expect(druckTitel(['308F', 'Grading Sheet Recurrent', 'Jürgen Müller', 'Mika Beispiel', '05.08.2026', 'OPC-Recurrent'])).toBe(
      '308F_Grading Sheet Recurrent_Jürgen Müller_Mika Beispiel_05.08.2026_OPC-Recurrent',
    )
  })

  it('ersetzt verbotene Zeichen und faltet Leerraum', () => {
    const titel = druckTitel(['Report: Q3/Q4', 'a*b?"c"<d>|e', 'Zeile1\n\nZeile2', 'x\u0000y'])
    expect(titel).toBe('Report- Q3-Q4_a-b--c--d--e_Zeile1 Zeile2_xy')
    expect(titel).not.toMatch(PFADZEICHEN)
  })

  it('laesst leere Teile entfallen und faellt notfalls auf den App-Namen zurueck', () => {
    expect(druckTitel(['Analytics', '', null, '  ', '02.11.2026'])).toBe('Analytics_02.11.2026')
    expect(druckTitel([])).toBe('Instructor Connect')
    expect(druckTitel(['\u202e', '...'])).toBe('Instructor Connect')
  })

  it('kuerzt auf hoechstens 120 Zeichen ohne Trenner am Ende', () => {
    expect(druckTitel(['A'.repeat(118), 'Zweiter Teil'])).toBe(`${'A'.repeat(118)}_Z`)
    // Der Schnitt faellt genau hinter den Trenner — er bleibt nicht stehen.
    expect(druckTitel(['A'.repeat(119), 'Zweiter Teil'])).toBe('A'.repeat(119))
  })
})
