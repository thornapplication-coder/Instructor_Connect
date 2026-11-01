import { describe, expect, it } from 'vitest'
import { csvBefunde, csvFeld } from './csv'
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
    expect(csvFeld('-1')).toBe(`"'-1"`)
    expect(csvFeld('@x')).toBe(`"'@x"`)
    expect(csvFeld('a"b')).toBe('"a""b"')
    expect(csvFeld('a\r\nb\nc')).toBe('"a / b / c"')
    expect(csvBefunde(d, ',').split('\r\n')[0]).toMatch(/^﻿"ID","Document",/)
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
