import { describe, expect, it } from 'vitest'
import { CSV_SEPARATOR, csvEsc, csvNum, csvRow } from './csv'

/**
 * Der CSV-Export landet in Excel. Zwei Dinge müssen deshalb halten:
 * Zellen dürfen nicht als Formel ausgeführt werden (eine als „=…"
 * beginnende Zelle ist ein bekannter Angriffsweg), und Zahlen müssen im
 * Zielformat lesbar bleiben statt als Text anzukommen.
 */

describe('csvEsc — Formelschutz', () => {
  it('entschaerft Zellen, die als Formel ausgefuehrt wuerden', () => {
    expect(csvEsc('=1+1')).toBe("'=1+1")
    expect(csvEsc('+SUM(A1)')).toBe("'+SUM(A1)")
    expect(csvEsc('@import')).toBe("'@import")
  })

  it('entschaerft auch Text, der mit Minus beginnt', () => {
    expect(csvEsc('-cmd')).toBe("'-cmd")
  })

  it('laesst echte negative Zahlen in Ruhe — sie sind keine Formel', () => {
    // Sonst liest Excel eine negative Abweichung wie -0,63 als Text.
    expect(csvEsc('-0,63')).toBe('-0,63')
    expect(csvEsc('-12')).toBe('-12')
    expect(csvEsc('-1.5')).toBe('-1.5')
  })

  it('maskiert auch dann, wenn der Formelschutz schon zugeschlagen hat', () => {
    // Das vorangestellte Hochkomma darf die Maskierung nicht umgehen.
    const out = csvEsc('=A1;B2')
    expect(out.startsWith('"')).toBe(true)
    expect(out).toContain("'=A1")
  })
})

describe('csvEsc — Maskierung', () => {
  it('umschliesst Zellen mit Trennzeichen, Anfuehrungszeichen oder Umbruch', () => {
    expect(csvEsc(`a${CSV_SEPARATOR}b`)).toBe(`"a${CSV_SEPARATOR}b"`)
    expect(csvEsc('sagt "hallo"')).toBe('"sagt ""hallo"""')
    expect(csvEsc('Zeile1\nZeile2')).toBe('"Zeile1\nZeile2"')
  })

  it('macht aus null und undefined eine leere Zelle statt „null"', () => {
    expect(csvEsc(null)).toBe('')
    expect(csvEsc(undefined)).toBe('')
  })
})

describe('csvNum', () => {
  it('schreibt Dezimalkomma, weil Semikolon-Trennung deutsches Excel bedeutet', () => {
    expect(csvNum(3.5)).toBe('3,50') // Standard sind zwei Nachkommastellen
    expect(csvNum(-0.625, 2)).toBe('-0,63')
  })

  it('liefert eine leere Zelle statt NaN oder „null"', () => {
    expect(csvNum(null)).toBe('')
    expect(csvNum(undefined)).toBe('')
    expect(csvNum(Number.NaN)).toBe('')
  })

  it('haelt die gewuenschte Nachkommastellenzahl ein', () => {
    expect(csvNum(2, 0)).toBe('2')
    expect(csvNum(2, 3)).toBe('2,000')
  })
})

describe('csvRow', () => {
  it('fuegt Zellen mit Trennzeichen zusammen und schliesst mit Umbruch ab', () => {
    expect(csvRow(['a', 'b'])).toBe(`a${CSV_SEPARATOR}b\n`)
  })

  it('wendet den Formelschutz auf jede Zelle an', () => {
    expect(csvRow(['ok', '=BOOM()'])).toBe(`ok${CSV_SEPARATOR}'=BOOM()\n`)
  })
})
