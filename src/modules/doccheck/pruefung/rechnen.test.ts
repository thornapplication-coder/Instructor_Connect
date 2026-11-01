import { describe, expect, it } from 'vitest'
import { LEERE_LENKUNG, type Rohdokument } from '../parse/model'
import { REGELN } from './kontext'
import { einheitenPruefen, metarMaengel, rechenPruefung, tabellen, wertLesen, zahl, zeitText } from './rechnen'

const roh = (text: string, format: Rohdokument['format'] = 'docx'): Rohdokument => ({ format, pages: [{ index: 1, text }], outline: [], lenkung: LEERE_LENKUNG, ocrKandidaten: [], tabellen: 0 })
const k = (text: string, format?: Rohdokument['format']) => ({ dokId: 'd', dokName: 'D', roh: roh(text, format), meta: {}, regeln: REGELN })
const punkte = (text: string, format?: Rohdokument['format']) => rechenPruefung(k(text, format)).befunde.map((b) => b.pruefpunkt)

describe('Werte und Tabellen', () => {
  it('Zeit- und Zahlwerte; Unbekanntes ist kein Wert', () => {
    expect([wertLesen('2:30'), wertLesen('02:30h'), wertLesen('16:00 hours'), wertLesen('2,5'), wertLesen('2.5 h'), wertLesen('-3')]).toEqual([
      { n: 150, zeit: true }, { n: 150, zeit: true }, { n: 960, zeit: true }, { n: 2.5, zeit: false }, { n: 2.5, zeit: false }, { n: -3, zeit: false },
    ])
    expect([wertLesen('2:75'), wertLesen('abc'), wertLesen('')]).toEqual([null, null, null])
    expect([zeitText(50), zeitText(1440)]).toEqual(['0:50', '24:00'])
  })

  it('Tabellen: gleiche Zellenzahl hintereinander; Einzelzeilen nicht; PDF hat keine', () => {
    const t = tabellen(roh('Intro\nA | 1\nB | 2\nX | Y | Z\nText\nC | 3'))
    expect(t.map((x) => x.zeilen.length)).toEqual([2])
    expect(t[0].davor).toEqual(['Intro'])
    expect(tabellen(roh('A | 1\nB | 2', 'pdf'))).toEqual([])
  })

  it('Tausender und Dezimalzahlen', () => {
    expect([zahl('11,930'), zahl('11 930'), zahl('11.930'), zahl('2,5'), zahl('5834')]).toEqual([11930, 11930, 11930, 2.5, 5834])
  })
})

describe('Prüfungen', () => {
  it('Summen: mehrere Summenzeilen je Tabelle, Dezimalzahlen mit Toleranz, Spalten mit Text werden übergangen', () => {
    const t = 'Name | Hours | Note\nA | 1:00 | x\nB | 1:00 | y\nTotal | 2:00 | -\nC | 0,5 | z\nD | 0,25 | z\nSum | 0,75 | -'
    expect(punkte(t)).toEqual([])
    expect(rechenPruefung(k('Name | h\nA | 0,5\nB | 0,25\nSum | 0,8')).befunde[0].text).toBe('Table total does not match: sum of rows 0.75, stated 0.8.')
    // Summenzeile ohne Wert in der Spalte: nichts zu prüfen
    expect(punkte('Name | h\nA | 1\nB | 2\nTotal | n/a')).toEqual([])
  })

  it('Kumuliert: nur mit Dauer- UND Kumuliert-Spalte; Summenzeile übersprungen', () => {
    expect(punkte('Item | Duration | Cumulative\nA | 10 | 10\nB | 5 | 15\nTotal | 15 | 15')).toEqual([])
    expect(punkte('Item | Cumulative\nA | 0:10\nB | 0:30')).toEqual([])
    expect(punkte('Item | Duration | Elapsed\nA | 0:10 | 0:10\nB | 0:05 | 0:20')).toEqual(['kumuliert'])
  })

  it('Sessiondauer: Dezimalstunden, Tabelle mit Kumuliert-Spalte zählt nicht, keine Angabe → nichts', () => {
    expect(punkte('Simulator session 1,5 h\nBlock | Duration\nA | 0:30\nB | 1:00')).toEqual([])
    expect(punkte('FFS lesson 3 h\nBlock | Duration\nA | 0:30\nB | 1:00')).toEqual(['session'])
    expect(punkte('FFS session 3:00 h\nBlock | Duration | Cumulative\nA | 0:30 | 0:30')).toEqual([])
    expect(punkte('Block | Duration\nA | 0:30\nB | 1:00')).toEqual([])
    expect(punkte('FFS session 3:00 h\nBlock | Note\nA | x\nB | y')).toEqual([])
  })

  it('Einheiten: ft/m, kt/km/h, NM/km, °C/°F; innerhalb der Toleranz kein Befund', () => {
    const e = (s: string) => einheitenPruefen(k(s)).map((b) => b.text)
    expect(e('FL100 = 10000 ft (3048 m). 250 kt (463 km/h). 10 NM (18.5 km). 20 °C (68 °F).')).toEqual([])
    expect(e('Altitude 5000 ft (1700 m)')).toEqual(['Unit conversion does not match: 5000 ft = 1524 m, stated 1700 m (tolerance 1 %).'])
    expect(e('ISA 15 °C (62 °F)')).toHaveLength(1)
    expect(e('11,930 lbs (5,411 kg)')).toEqual([])
  })

  it('METAR: jede Regel einzeln, CAVOK und BR', () => {
    expect(metarMaengel('LOWW 27010KT 3000 CAVOK 12/08')).toEqual([])
    expect(metarMaengel('LOWW 27010KT 3000 BR 12/02')).toEqual(['Mist with a temperature/dew point spread of 10 °C is implausible.'])
    expect(metarMaengel('LOWW 27010KT 1500 FG 05/05')).toEqual(['FG reported with visibility 1500 m; fog requires visibility below 1000 m (use BR).'])
    expect(metarMaengel('LOWW VRB02KT 0100 FG M01/M01 VV150')[0]).toContain('VV150 (15000 ft)')
    expect(metarMaengel('LOWW 27010G25KT 9999 M05/M10')).toEqual([])
    expect(metarMaengel('LOWW 27010KT 9999')).toEqual([])
  })

  it('Doppelte Wörter: erlaubte Doppelungen nicht; PDF: Tabellenpunkte nicht anwendbar', () => {
    expect(punkte('He had had enough. That that is.')).toEqual([])
    expect(punkte('Check the the checklist.')).toEqual(['doppelt'])
    expect(rechenPruefung(k('x', 'pdf')).ampel).toEqual({ summen: 'na', kumuliert: 'na', session: 'na', einheiten: 'ok', metar: 'ok', doppelt: 'ok' })
  })
})
