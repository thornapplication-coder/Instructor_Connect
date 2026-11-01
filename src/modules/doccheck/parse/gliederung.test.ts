import { describe, expect, it } from 'vitest'
import { abschnittsPfade, ueberschrift } from './gliederung'

describe('Abschnittspfad aus nummerierten Überschriften', () => {
  it('erkennt Überschriften verschiedener Ebenen', () => {
    expect(ueberschrift('2.4 Limitations')).toEqual({ nummer: '2.4', titel: '2.4 Limitations', ebene: 2 })
    expect(ueberschrift('1. Electrical')).toEqual({ nummer: '1', titel: '1 Electrical', ebene: 1 })
  })

  it('verwirft Fließtext, Angaben und Tabellenzeilen', () => {
    expect(ueberschrift('2 Engines are installed.')).toBeNull()
    expect(ueberschrift('10 FT')).toBeNull()
    expect(ueberschrift('155 KIAS maximum')).toBeNull()
    expect(ueberschrift('1 Electrical | 2 Fuel')).toBeNull()
    expect(ueberschrift(`1 ${'A'.repeat(95)}`)).toBeNull()
    expect(ueberschrift('lowercase start')).toBeNull()
  })

  it('führt den Pfad über Seiten und Ebenen fort', () => {
    const { pfade, outline } = abschnittsPfade(['1 Electrical\n1.1 Components\ntext', 'more text', '2 Fuel'])
    expect(pfade).toEqual([['1 Electrical', '1.1 Components'], ['1 Electrical', '1.1 Components'], ['2 Fuel']])
    expect(outline.map((o) => [o.titel, o.ebene, o.vonSeite])).toEqual([['1 Electrical', 1, 1], ['1.1 Components', 2, 1], ['2 Fuel', 1, 3]])
  })
})
