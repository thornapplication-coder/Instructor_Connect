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

  it('hochgestelltes Verweiszeichen am Zellende gehört nicht zum Wert (Gegenprüfung Audit 11/2026, FRD-06)', () => {
    expect([wertLesen('1.5¹'), wertLesen('12:30²³'), wertLesen('4ⁱᵛ'), wertLesen('7 hⁱ')]).toEqual([{ n: 1.5, zeit: false }, { n: 750, zeit: true }, { n: 4, zeit: false }, { n: 7, zeit: false }])
    // Eine normale Ziffer ist Teil des Werts — nur die Hochzahl wird abgelöst
    expect(wertLesen('1.51')).toEqual({ n: 1.51, zeit: false })
    // Mit Fußnote in einer Datenzeile wird die Summe weiter geprüft
    const tab = 'Lesson | Hours\nFI-01 | 1.5¹\nFI-02 | 2.0\nTotal | 4.0\n¹ Including ground time.'
    expect(punkte(tab, 'docx')).toContain('summen')
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
    expect(rechenPruefung(k('x', 'pdf')).ampel).toEqual({ summen: 'na', kumuliert: 'na', session: 'na', einheiten: 'ok', metar: 'na', doppelt: 'ok' })
  })

  it('nicht anwendbar, wo die Grundlage fehlt; anwendbar, sobald sie da ist (Fachprüfung 01.11.2026)', () => {
    // Tabelle ohne Summenzeile, ohne Kumuliert-Spalte, ohne Sitzungsangabe, ohne Wettermeldung
    expect(rechenPruefung(k('Item | Hours\nWBT | 2\nFFS | 4', 'docx')).ampel).toMatchObject({ summen: 'na', kumuliert: 'na', session: 'na', metar: 'na' })
    const voll = rechenPruefung(k('Item | Hours | Cumulative\nWBT | 2 | 2\nFFS | 4 | 6\nTotal | 6 | 6\nLOWW 27010KT 9999 12/05', 'docx')).ampel
    expect(voll).toMatchObject({ summen: 'ok', kumuliert: 'ok', metar: 'ok' })
  })

  it('Excel-Liste mit Leerzellen an ihrem Platz: falsche Summe und falsche Zeitsumme werden gefunden (Audit 11/2026, FRD-11)', () => {
    const flights = 'Date | Lesson | Dual (h) | Mutual (h) | Total (h)\n02.03.2026 | FI-01 | 1.0 |  | 1.0\n03.03.2026 | FI-02 | 1.5 | 0.5 | 2.0\n05.03.2026 | FI-03 | 11.5 |  | 11.5\nTotal |  | 13.5 | 0.5 | 14.5'
    // Dual: 1,0 + 1,5 + 11,5 = 14, ausgewiesen 13,5; Mutual und Total stimmen — die leeren Zellen verschieben nichts
    expect(rechenPruefung(k(flights, 'xlsx')).befunde.map((b) => [b.prioritaet, b.text])).toEqual([['High', 'Table total does not match: sum of rows 14, stated 13.5.']])
    const monthly = 'Month | Flight time | Briefing time\nMarch 2026 | 14:00 | 9:30\nApril 2026 | 12:30 | 8:15\nMay 2026 | 4:30 | 3:10\nTotal | 31:00 | 20:45'
    expect(rechenPruefung(k(monthly, 'xlsx')).befunde.map((b) => [b.prioritaet, b.text])).toEqual([['High', 'Table total does not match: sum of rows 20:55, stated 20:45.']])
  })

  it('Summen „ok" nur, wenn wirklich gegen mindestens zwei Datenzeilen gerechnet wurde — sonst nicht anwendbar (Audit 11/2026, FRD-11)', () => {
    // Summenzeile, die zu keiner Wertspalte passt (vorher: verrutschte Excel-Spalten)
    expect(rechenPruefung(k('Item | Hours | Note\nA | 1 | x\nB | 2 | y\nTotal | n/a | -')).ampel.summen).toBe('na')
    // Nur eine Datenzeile: verglichen ist da nichts
    expect(rechenPruefung(k('Item | Hours\nA | 2\nTotal | 2')).ampel.summen).toBe('na')
    expect(rechenPruefung(k('Item | Hours\nA | 2\nB | 3\nTotal | 5')).ampel.summen).toBe('ok')
    expect(rechenPruefung(k('Item | Hours\nA | 2\nB | 3\nTotal | 6')).ampel.summen).toBe('bad')
  })

  it('Fehlalarme der Fachprüfung (01.11.2026): verschiedene Größen im selben Satz sind keine Umrechnung', () => {
    const e = (x: string) => einheitenPruefen(k(x)).map((b) => b.text)
    expect(e('DH not lower than 200 ft and RVR not less than 550 m.')).toEqual([])
    expect(e('MTOW 5670 kg, max fuel 2,500 lbs.')).toEqual([])
    expect(e('Visibility 5 km and range 12 NM.')).toEqual([])
    // Direkt verbunden — in beiden Reihenfolgen und mit / = „or"
    // 12,500 lbs = 5669.9 kg — innerhalb der Toleranz, rückwärts gelesen
    expect(e('MTOW 5670 kg (12,500 lbs)')).toEqual([])
    expect(e('MTOW 5834 kg (11930 lbs)')).toEqual(['Unit conversion does not match: 11930 lbs = 5411.4 kg, stated 5834 kg (tolerance 1 %).'])
    expect(e('10000 ft = 3500 m')).toHaveLength(1)
    expect(e('250 kt or 463 km/h')).toEqual([])
  })

  it('METAR: MIFG/BCFG/PRFG/VCFG sind kein Nebel im Sinne der 1000-m-Regel; Bahnangabe ist keine Temperatur; variable Windrichtung', () => {
    expect(metarMaengel('METAR LOWW 121250Z 27010KT 8000 MIFG 12/10 FEW030')).toEqual([])
    expect(metarMaengel('METAR LOWW 121250Z 27010KT 3000 BCFG 12/10 FEW030')).toEqual([])
    expect(metarMaengel('LOWW 27010KT 0500 FZFG M02/M02 VV002')).toEqual([])
    expect(metarMaengel('LOWW 27010KT 9999 RWY 09/27 15/05')).toEqual([])
    expect(metarMaengel('LOWW 27010KT 240V300 3000 12/08 FEW030')).toEqual(['Visibility 3000 m without a present weather group (BR, HZ, FG …).'])
  })

  it('Zwischensummen: geprüft und nicht doppelt in der Gesamtsumme (Fachprüfung 01.11.2026)', () => {
    const t = 'Item | Hours\nA | 2:00\nB | 1:00\nSubtotal | 3:00\nC | 3:00\nTotal | 6:00'
    expect(punkte(t)).toEqual([])
    expect(rechenPruefung(k('Item | Hours\nA | 2:00\nB | 1:00\nSubtotal | 4:00\nC | 3:00\nTotal | 6:00')).befunde.map((b) => b.text)).toEqual(['Table subtotal does not match: sum of rows 3:00, stated 4:00.'])
  })
})

