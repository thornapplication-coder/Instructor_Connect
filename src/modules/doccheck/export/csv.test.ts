import { describe, expect, it } from 'vitest'
import { csvBefunde, csvDatei, csvFeld } from './csv'
import { datenstand, LABELS } from './datenstand'
import { eingabe } from './beispiel'
import { csvLesen } from '../referenz/liste'

describe('CSV (Spez. v1.1 Kap. 10.6)', () => {
  const d = datenstand(eingabe())
  it('BOM, Semikolon, alles in Anführungszeichen, Umbrüche → „ / ", Formelschutz', () => {
    const csv = csvBefunde(d)
    expect(csv.startsWith('﻿"ID";"Document";')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csvFeld('=SUM(A1)')).toBe(`"'=SUM(A1)"`)
    expect(csvFeld('@x')).toBe(`"'@x"`)
    expect(csvFeld('a"b')).toBe('"a""b"')
    expect(csvFeld('a\r\nb\nc')).toBe('"a / b / c"')
    expect(csvBefunde(d, ',').split('\r\n')[0]).toMatch(/^﻿"ID","Document",/)
  })

  it('Formelschutz ist DIESELBE Regel wie in src/csv.ts — auch für Tab am Anfang (Audit 11/2026, EXP-22)', () => {
    // Vorher /^[=+\-@]/: Ein Auszug aus einem fremden Dokument, der mit Tab
    // begann, ging ungeschützt in die Datei
    expect(csvFeld('\t=1+1').startsWith(`"'`)).toBe(true)
    expect(csvFeld('-5 kt')).toBe(`"'-5 kt"`)
    expect(csvFeld('+1 234')).toBe(`"'+1 234"`)
    // Ein führendes CR wird schon zum Umbruch-Ersatz und braucht keinen Schutz
    expect(csvFeld('\r=1')).toBe('" / =1"')
    // Eine reine Zahl ist keine Formel: dieselbe Ausnahme wie in jeder
    // anderen CSV der App (vorher hier als „'-1" entschärft — zwei Regeln)
    expect(csvFeld('-1')).toBe('"-1"')
    expect(csvFeld('-0,63')).toBe('"-0,63"')
  })

  it('csvDatei: BOM, alles gequotet, CRLF, Trenner nach Einstellung (Audit 11/2026, EXP-17)', () => {
    expect(csvDatei([['a', 'b;c'], ['1', '']])).toBe('\uFEFF"a";"b;c"\r\n"1";""\r\n')
    expect(csvDatei([['a', 'b,c']], ',')).toBe('\uFEFF"a","b,c"\r\n')
    expect(csvLesen(csvDatei([['a', 'b,c'], ['x', 'y']], ',').slice(1))).toEqual([['a', 'b,c'], ['x', 'y']])
  })

  it('Roundtrip: Einlesen ergibt die Ausgangsdaten (bis auf Formelschutz und Umbrüche)', () => {
    const zeilen = csvLesen(csvBefunde(d).slice(1))
    expect(zeilen[0]).toEqual(LABELS.columns)
    expect(zeilen.slice(1).map((z) => z[0])).toEqual(d.befunde.map((b) => b.id))
    const auszug = zeilen[1][7]
    expect(auszug).toBe(`'=SUM(A1) „Grüße" ; "quoted" / zweite Zeile`)
    expect(zeilen.slice(1).map((z) => z.slice(13, 17))).toEqual(d.befunde.map((b) => b.spalten.slice(13, 17)))
  })
})
