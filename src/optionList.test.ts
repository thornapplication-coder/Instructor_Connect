import { describe, expect, it } from 'vitest'
import { optionEntfernen, optionHinzufuegen, optionUmbenennen } from './optionList'

/**
 * Audit 11/2026, GRD-17/A11Y-02: Auswahlwerte werden über ihre Stelle
 * bearbeitet, nicht über ihren Wert — leer und doppelt wird abgelehnt.
 */

const orte = ['AAA Neusiedl', 'FFS Vienna', 'LOWW']

describe('optionUmbenennen', () => {
  it('ersetzt nur die Stelle i und laesst alle anderen unveraendert', () => {
    expect(optionUmbenennen(orte, 0, 'AAA NeusiedlXY')).toEqual({ ok: true, options: ['AAA NeusiedlXY', 'FFS Vienna', 'LOWW'] })
  })

  it('schneidet Leerraum am Rand ab', () => {
    expect(optionUmbenennen(orte, 2, '  LOWG  ')).toEqual({ ok: true, options: ['AAA Neusiedl', 'FFS Vienna', 'LOWG'] })
  })

  it('lehnt einen leeren Wert ab — entfernt wird mit dem Loeschknopf', () => {
    expect(optionUmbenennen(orte, 1, '   ')).toEqual({ ok: false, grund: 'leer' })
  })

  it('lehnt eine Dublette ab und nennt den vorhandenen Eintrag in seiner Schreibweise', () => {
    expect(optionUmbenennen(orte, 0, 'loww')).toEqual({ ok: false, grund: 'doppelt', vorhanden: 'LOWW' })
  })

  it('erlaubt, die eigene Schreibweise zu aendern', () => {
    expect(optionUmbenennen(orte, 2, 'Loww')).toEqual({ ok: true, options: ['AAA Neusiedl', 'FFS Vienna', 'Loww'] })
  })

  it('benennt bei gleichlautendem Altbestand nur die gewaehlte Stelle um', () => {
    // Die alte Wertsuche haette beide „A" umbenannt.
    expect(optionUmbenennen(['A', 'A'], 1, 'B')).toEqual({ ok: true, options: ['A', 'B'] })
  })

  it('aendert bei einer Stelle ausserhalb der Liste nichts', () => {
    expect(optionUmbenennen(orte, 5, 'X')).toEqual({ ok: true, options: orte })
    expect(optionUmbenennen(orte, -1, 'X')).toEqual({ ok: true, options: orte })
  })
})

describe('optionHinzufuegen', () => {
  it('haengt einen neuen Wert an', () => {
    expect(optionHinzufuegen(orte, ' LOWG ')).toEqual({ ok: true, options: [...orte, 'LOWG'] })
  })

  it('lehnt leer und doppelt ab', () => {
    expect(optionHinzufuegen(orte, '')).toEqual({ ok: false, grund: 'leer' })
    expect(optionHinzufuegen(orte, 'ffs  vienna')).toEqual({ ok: false, grund: 'doppelt', vorhanden: 'FFS Vienna' })
  })
})

describe('optionEntfernen', () => {
  it('entfernt nur die Stelle i, auch wenn ein anderer Eintrag gleich lautet', () => {
    expect(optionEntfernen(['A', 'B', 'A'], 2)).toEqual(['A', 'B'])
    expect(optionEntfernen(orte, 1)).toEqual(['AAA Neusiedl', 'LOWW'])
  })
})
