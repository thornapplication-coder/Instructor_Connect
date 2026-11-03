import { describe, expect, it } from 'vitest'
import { LEERE_LENKUNG, type Rohdokument } from '../parse/model'
import { REGELN } from './kontext'
import { einheitenPruefen, kopfSpalten, metarMaengel, rechenPruefung, seitenAnfang, seitenSpanne, tabellen, wertLesen, zahl, zeitText } from './rechnen'

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

  it('Doppelte Wörter im Deutschen: „die die", „das das", „der der" sind richtig; „the the" bleibt Low (Audit 11/2026, FRD-17)', () => {
    const deutsch = 'Hinweis: Fluglehrer, die die Einweisung durchgeführt haben, bestätigen diese.\nDas Luftfahrzeug, das das Unternehmen bereitstellt, wird eingewiesen.\nDer Fluglehrer, der der verantwortliche Pilot ist, entscheidet.'
    expect(punkte(deutsch)).toEqual([])
    // Kurze Zeile ohne eigene Sprache: Dokumentsprache entscheidet
    expect(punkte(`${deutsch}\ndie die`)).toEqual([])
    // Im englischen Dokument bleibt „the the" ein Befund, eine deutsche Zeile darin folgt den deutschen Regeln
    const en = rechenPruefung(k('The crew shall check the the checklist before the flight.\nFluglehrer, die die Einweisung durchgeführt haben, bestätigen diese.', 'docx')).befunde
    expect(en.map((b) => [b.prioritaet, b.text])).toEqual([['Low', 'Repeated word or waypoint: "the the" (1×).']])
    // Nur die Doppelungen der Liste sind erlaubt — „im im" bleibt auch im Deutschen ein Befund
    expect(punkte('Ein Fehler im im Text bleibt ein Fehler und wird gemeldet.')).toEqual(['doppelt'])
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

  it('SERA-Rundungswerte sind keine Umrechnungsfehler; „1000 ft (350 m)" bleibt einer (Audit 11/2026, FRD-08)', () => {
    const e = (x: string) => einheitenPruefen(k(x)).map((b) => [b.prioritaet, b.text])
    // Werte wie in SERA.5005 — vorher je ein Medium-Befund „Unit conversion does not match"
    expect(e('VFR flights shall not be flown at a height less than 300 m (1 000 ft) above the highest obstacle.')).toEqual([])
    expect(e('Elsewhere: 150 m (500 ft) above the ground or water.')).toEqual([])
    expect(e('Cruising level 600 m (2 000 ft); 1500 ft (450 m); 3000 ft (900 m); 5000 ft (1500 m); 10000 ft (3000 m).')).toEqual([])
    expect(e('Minimum height 1000 ft (350 m).')).toEqual([['Medium', 'Unit conversion does not match: 1000 ft = 304.8 m, stated 350 m (tolerance 1 %).']])
    // Rund, aber zu weit weg; nah, aber nicht rund — beides bleibt ein Fehler
    expect(e('1000 ft (250 m)')).toHaveLength(1)
    expect(e('1000 ft (310 m)')).toHaveLength(1)
    // Die Rundungsregel gilt nur für ft/m — 1,6 % bei kg bleiben ein Befund
    expect(e('5000 lbs (2300 kg)')).toHaveLength(1)
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

  describe('Tabelle über eine Seitengrenze (Audit 11/2026, FRD-02)', () => {
    // Seite 1 endet mit Tabellenzeilen, Seite 2 beginnt mit gleich breiten — wie
    // geschätzte („ca.") oder über das Word-PDF gepaarte Seiten eines DOCX
    const zweiSeiten = (gesamt: string, format: Rohdokument['format'] = 'docx'): Rohdokument => ({
      format,
      pages: [
        { index: 1, label: 'ca. 10', text: 'Table 2 Flight hours\nLesson | Dual | Mutual\nFI-01 | 1:00 | 0:30\nFI-02 | 1:30 | 0:30\n' },
        { index: 2, label: 'ca. 11', text: `FI-03 | 2:00 | 1:00\nFI-04 | 1:00 | \nTotal | ${gesamt}\nThe table ends here.` },
      ],
      outline: [], lenkung: LEERE_LENKUNG, ocrKandidaten: [], tabellen: 1,
    })
    const pruefe = (r: Rohdokument) => rechenPruefung({ dokId: 'd', dokName: 'D', roh: r, meta: {}, regeln: REGELN })

    it('richtige Summe über beide Seiten: kein Befund; vorher je Seite gerechnet → falscher High', () => {
      const t = tabellen(zweiSeiten('5:30 | 2:00'))
      expect(t).toHaveLength(1)
      expect(t[0].zeilen).toHaveLength(6)
      expect(t[0].seiten).toEqual(['ca. 10', 'ca. 10', 'ca. 10', 'ca. 11', 'ca. 11', 'ca. 11'])
      const p = pruefe(zweiSeiten('5:30 | 2:00'))
      expect(p.befunde).toEqual([])
      expect(p.ampel.summen).toBe('ok')
    })

    it('falsche Summe über beide Seiten: High mit beiden Werten und Seitenspanne', () => {
      const b = pruefe(zweiSeiten('5:00 | 2:00')).befunde
      expect(b.map((x) => [x.prioritaet, x.text])).toEqual([['High', 'Table total does not match: sum of rows 5:30, stated 5:00.']])
      expect(b[0].fundstellen[0]).toMatchObject({ seite: 'ca. 10–11', auszug: 'Total | 5:00 | 2:00' })
    })

    it('Text zwischen den Seiten oder XLSX-Blätter: keine Fortführung', () => {
      const r = zweiSeiten('5:30 | 2:00')
      expect(tabellen({ ...r, pages: [{ ...r.pages[0], text: `${r.pages[0].text}Note below the table.` }, r.pages[1]] })).toHaveLength(2)
      // Blätter einer Arbeitsmappe sind getrennte Tabellen
      expect(tabellen({ ...r, format: 'xlsx' })).toHaveLength(2)
      // Andere Zellenzahl auf der neuen Seite: eine neue Tabelle
      expect(tabellen({ ...r, pages: [r.pages[0], { ...r.pages[1], text: 'A | B\nC | D' }] }).map((t) => t.zeilen.length)).toEqual([3, 2])
      // Leere Seite dazwischen trennt; leere Zeilen am Seitenrand nicht
      expect(tabellen({ ...r, pages: [r.pages[0], { index: 2, text: '\n' }, { ...r.pages[1], index: 3 }] })).toHaveLength(2)
      expect(tabellen({ ...r, pages: [r.pages[0], { ...r.pages[1], text: `\n\n${r.pages[1].text}` }] })).toHaveLength(1)
    })

    it('Seitenspanne: gleiche Bezeichnung bleibt, gleiche Form wird zusammengezogen', () => {
      expect([seitenSpanne('S. 10', 'S. 10'), seitenSpanne('S. 10', 'S. 11'), seitenSpanne('S. 9 (±1)', 'S. 10 (±1)'), seitenSpanne('ca. 3', 'S. 4'), seitenSpanne('Cover', 'S. 2')]).toEqual(['S. 10', 'S. 10–11', 'S. 9–10 (±1)', 'ca. 3 – S. 4', 'Cover – S. 2'])
      // Zurück zur ersten Seite — „Seite anzeigen" sucht die Bezeichnung wörtlich (Gegenprüfung P5)
      for (const [von, bis] of [['S. 10', 'S. 10'], ['S. 10', 'S. 11'], ['S. 9 (±1)', 'S. 10 (±1)'], ['ca. 3', 'S. 4'], ['Cover', 'S. 2'], ['Flights', 'Flights']]) expect(seitenAnfang(seitenSpanne(von, bis))).toBe(von)
    })
  })

  describe('Zweizeiliger Kopf mit verbundenen Zellen (Audit 11/2026, FRD-03)', () => {
    // Wie Word ihn nach dem Auffüllen der verbundenen Zellen liefert: „Flight time"
    // über Dual | Mutual (gridSpan), die anderen Zellen senkrecht verbunden (vMerge)
    const tab = (kum3: string) =>
      [
        'Phase | Lesson | Content | Flight time |  | Cumulative',
        ' |  |  | Dual | Mutual | ',
        '1 | FI-01 | Effects of controls | 1:00 |  | 1:00',
        '1 | FI-02 | Straight and level | 1:00 | 0:30 | 2:30',
        `2 | FI-03 | Climbing | 1:30 | 0:30 | ${kum3}`,
        'Total |  |  | 3:30 | 1:00 | 4:30',
      ].join('\n')

    it('eine Tabelle; Kumuliert-Spalte nicht summiert, Dual und Mutual stimmen — kein Befund', () => {
      const t = tabellen(roh(tab('4:30')))
      expect(t).toHaveLength(1)
      expect(kopfSpalten(t[0])).toEqual(['Phase', 'Lesson', 'Content', 'Flight time Dual', 'Mutual', 'Cumulative'])
      const p = rechenPruefung(k(tab('4:30')))
      expect(p.befunde).toEqual([])
      expect(p.ampel).toMatchObject({ summen: 'ok', kumuliert: 'ok' })
    })

    it('falsche Kumuliert-Zelle → Medium; die Dauer ist Dual + Mutual unter dem verbundenen Kopf', () => {
      const b = rechenPruefung(k(tab('4:00'))).befunde
      expect(b.map((x) => [x.pruefpunkt, x.prioritaet, x.text])).toEqual([['kumuliert', 'Medium', 'Cumulative time does not add up: 2:30 + 2:00 = 4:30, stated 4:00.']])
    })

    it('zugeschnittene Zeile behält ihre leeren Randzellen — das Word-PDF-Paar schneidet seine Stücke zu', () => {
      const t = tabellen(roh('Lesson | Dual | Mutual\nFI-01 | 1:00 |\n| 0:30 | 0:30\nTotal | 1:00 | 0:30'))
      expect(t.map((x) => x.zeilen)).toEqual([[['Lesson', 'Dual', 'Mutual'], ['FI-01', '1:00', ''], ['', '0:30', '0:30'], ['Total', '1:00', '0:30']]])
      // Ein Strich mitten im Wort ist kein Zelltrenner
      expect(tabellen(roh('a|b\nc|d'))).toEqual([])
    })

    it('Kumuliert erst in der zweiten Kopfzeile: wird erkannt und nicht summiert', () => {
      const t = 'Lesson | Time | \n | Duration | Cumulative\nA | 1:00 | 1:00\nB | 2:00 | 3:00\nTotal | 3:00 | 3:00'
      expect(rechenPruefung(k(t)).befunde).toEqual([])
      expect(rechenPruefung(k(t.replace('B | 2:00 | 3:00', 'B | 2:00 | 3:30'))).befunde.map((x) => x.pruefpunkt)).toEqual(['kumuliert'])
    })
  })
})

describe('Kapitel der Fundstellen (Audit 11/2026, Nachtrag TXT#1)', () => {
  it('Tabelle, Umrechnung, Wettermeldung und Doppelwort tragen das Kapitel, in dem sie stehen — auch auf einer einzigen Seite', () => {
    // Vorher stand unter „Chapter / Section" nur „Table" oder nichts
    const text = '1 Hours\nName | h\nA | 1\nB | 2\nTotal | 4\n2 Data\nMTOW 11930 lbs (5000 kg)\n3 Weather\nMETAR 24010KT 0800 15/04\n4 Routes\nProceed to to the hold.'
    const outline = ['1 Hours', '2 Data', '3 Weather', '4 Routes'].map((titel) => ({ titel, ebene: 1, vonSeite: 1 }))
    const r: Rohdokument = { format: 'docx', pages: [{ index: 1, label: 'ca. 1', text }], outline, lenkung: LEERE_LENKUNG, ocrKandidaten: [], tabellen: 0 }
    expect(tabellen(r).map((t) => t.kapitel)).toEqual(['1 Hours'])
    const b = rechenPruefung({ dokId: 'd', dokName: 'D', roh: r, meta: {}, regeln: REGELN }).befunde
    expect(Object.fromEntries(b.map((x) => [x.pruefpunkt, [x.fundstellen[0].kapitel, x.fundstellen[0].ort]]))).toEqual({
      summen: ['1 Hours', 'Table'],
      einheiten: ['2 Data', undefined],
      metar: ['3 Weather', undefined],
      doppelt: ['4 Routes', undefined],
    })
    // Ohne Gliederung wie bisher: kein Kapitel, kein leeres Feld
    expect(rechenPruefung(k('Name | h\nA | 1\nB | 2\nTotal | 4')).befunde[0].fundstellen[0]).toEqual({ seite: '1', ort: 'Table', auszug: 'Total | 4' })
  })
})
