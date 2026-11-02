import { describe, expect, it } from 'vitest'
import { artErkennen, csvLesen, kopfzeile, LISTE_MAX_MB, listeAusTabelle, listeGroessePruefen, mdTabelle, zuordnen, type ReferenzListe } from './liste'

describe('Referenzlisten — Erkennung an den Spaltenköpfen', () => {
  it('Glossar (deutsch wie englisch), Varianten getrennt nach ; , / oder Zeilenumbruch', () => {
    const l = listeAusTabelle('g.xlsx', [['Soll-Schreibweise', 'Zu vermeidende Varianten', 'Hinweis', 'Quelle'], ['take-off', 'takeoff; take off', 'Noun', 'AFM'], ['', 'leer']])
    expect(l).toEqual({ id: 'ref-gxlsx-', name: 'g.xlsx', art: 'glossar', eintraege: [{ soll: 'take-off', varianten: ['takeoff', 'take off'], hinweis: 'Noun', quelle: 'AFM' }] })
    expect(artErkennen(['Preferred term', 'Avoid'])?.art).toBe('glossar')
  })

  it('Abkürzungen, Register, Kennungen', () => {
    expect(artErkennen(['Abkürzung', 'Bedeutung'])?.art).toBe('abkuerzungen')
    expect(artErkennen(['Doc No.', 'Revision', 'Effective Date'])).toEqual({ art: 'register', spalten: { dokument: 0, revision: 1, datum: 2 } })
    expect(artErkennen(['S/N', 'Designation'])?.art).toBe('kennungen')
  })

  it('kein Register ohne Revision/Datum, keine Abkürzungsliste ohne Bedeutung, nichts Unbekanntes', () => {
    expect(artErkennen(['Title', 'Owner'])).toBeNull()
    expect(artErkennen(['Abbreviation'])).toBeNull()
    expect(listeAusTabelle('x', [['foo', 'bar']])).toBeNull()
  })

  it('Titelzeilen vor dem Kopf werden übersprungen; Art kann vorgegeben werden', () => {
    const z = [['Device list 2026'], [''], ['Identifier', 'Name'], ['AT-FFS-0101', 'CL30 FFS']]
    expect(kopfzeile(z)).toBe(2)
    const l = listeAusTabelle('k.csv', z)
    expect(l).toMatchObject({ art: 'kennungen', eintraege: [{ kennung: 'AT-FFS-0101', bezeichnung: 'CL30 FFS' }] })
    expect(listeAusTabelle('k.csv', [['Identifier', 'Name'], ['X1', 'y']], 'glossar')).toBeNull()
    expect(zuordnen(['ID', 'ID'], 'kennungen')).toEqual({ kennung: 0 })
  })

  it('Register und Abkürzungen als Einträge', () => {
    expect(listeAusTabelle('r', [['Document', 'Rev', 'Date'], ['SBX-PLM-300', 'Rev 1', '46082'], ['SBX-OM', '', '']])).toMatchObject({
      art: 'register',
      eintraege: [{ dokument: 'SBX-PLM-300', revision: 'Rev 1', datum: '46082' }, { dokument: 'SBX-OM' }],
    })
    expect(listeAusTabelle('a', [['Acronym', 'Meaning'], ['AFM', 'Airplane Flight Manual']], undefined, 'Blatt1')).toMatchObject({ art: 'abkuerzungen', blatt: 'Blatt1', eintraege: [{ abk: 'AFM', bedeutung: 'Airplane Flight Manual' }] })
  })
})

describe('CSV und Markdown', () => {
  it('CSV mit Semikolon, Anführungszeichen, BOM, CRLF', () => {
    expect(csvLesen('﻿Soll;Varianten\r\n"take-off";"takeoff; take off"\r\n"a ""b""";x\n\n')).toEqual([['Soll', 'Varianten'], ['take-off', 'takeoff; take off'], ['a "b"', 'x']])
    expect(csvLesen('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
    expect(csvLesen('a\tb\n1\t2\n')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('Markdown-Tabelle ohne Trennzeile', () => {
    expect(mdTabelle('Text\n| Soll | Varianten |\n|---|:--:|\n| take-off | takeoff |')).toEqual([['Soll', 'Varianten'], ['take-off', 'takeoff']])
  })
})

describe('Präparierte Listen blockieren nicht (Audit 11/2026, SEC-01)', () => {
  const dauer = (f: () => unknown) => {
    const a = performance.now()
    f()
    return performance.now() - a
  }

  it('Markdown: zehn Zeilen mit 100 000 Leerzeichen in unter 500 ms — Trennzeile weiter übersprungen', () => {
    const text = Array.from({ length: 10 }, () => '|' + ' '.repeat(1e5) + 'x').join('\n')
    let zeilen: string[][] = []
    expect(dauer(() => (zeilen = mdTabelle(text)))).toBeLessThan(500)
    expect(zeilen).toHaveLength(10)
    expect(mdTabelle('| A | B |\n|---|:--:|\n| - | : |\n|  |  |\n| c | d |')).toEqual([['A', 'B'], ['c', 'd']])
  })

  it('Varianten: langer Leerraum ohne Trenner in unter 500 ms; „|" trennt nur mit Leerraum ringsum', () => {
    const lang = 'take off' + ' '.repeat(1e5) + 'x'
    let l: ReturnType<typeof listeAusTabelle> = null
    expect(dauer(() => (l = listeAusTabelle('g', [['Soll', 'Varianten'], ['takeoff', lang]])))).toBeLessThan(500)
    expect((l as Extract<ReferenzListe, { art: 'glossar' }> | null)?.eintraege[0].varianten).toEqual([lang])
    const g = listeAusTabelle('g', [['Soll', 'Varianten'], ['takeoff', 'take off | take-off;T/O  |  t|o']])
    expect(g?.art === 'glossar' && g.eintraege[0].varianten).toEqual(['take off', 'take-off', 'T', 'O', 't|o'])
  })

  it('Größengrenze: bis zur Grenze gelesen, darüber DC-LISTE-GROSS', () => {
    expect(() => listeGroessePruefen(LISTE_MAX_MB * 1024 * 1024)).not.toThrow()
    expect(() => listeGroessePruefen(LISTE_MAX_MB * 1024 * 1024 + 1)).toThrow('DC-LISTE-GROSS')
  })
})
