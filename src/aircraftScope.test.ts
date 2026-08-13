import { describe, expect, it } from 'vitest'
import { imMusterbereich, nachMuster, ohneMuster } from './aircraftScope'

/**
 * Diese Regel entscheidet, wer was sieht — sie ist damit die Stelle, an der
 * ein Fehler entweder zu viel zeigt oder etwas verschwinden lässt, ohne dass
 * jemand merkt warum. Beide Richtungen stehen hier auf dem Prüfstand.
 *
 * Die wichtigste Zusage ist die Auslegung von „kein Muster": Sie bedeutet
 * „betrifft alle" und nicht „betrifft niemanden". Andersherum verschwände
 * beim Umstieg der gesamte Bestand an allgemeinen Einträgen und
 * musterübergreifenden Gruppen auf einen Schlag — still.
 */

describe('imMusterbereich', () => {
  it('zeigt Inhalte des eigenen Musters', () => {
    expect(imMusterbereich(['CL30'], 'CL30')).toBe(true)
  })

  it('verbirgt Inhalte eines fremden Musters', () => {
    expect(imMusterbereich(['CL30'], 'C560 XLS+')).toBe(false)
  })

  it('kommt mit mehreren eigenen Mustern zurecht', () => {
    // Die Zuordnung ist eine Mehrfachauswahl — das ist der Normalfall bei
    // Instruktoren, die zwei Flotten fliegen, und bei Verwaltern.
    const eigene = ['C560 XLS+', 'CL30']
    expect(imMusterbereich(eigene, 'CL30')).toBe(true)
    expect(imMusterbereich(eigene, 'C560 XLS+')).toBe(true)
    expect(imMusterbereich(eigene, 'ATR 72')).toBe(false)
  })

  describe('„kein Muster" heisst „betrifft alle"', () => {
    it.each([undefined, null, '', '   '])('zeigt Inhalte ohne Musterangabe (%p)', (muster) => {
      expect(imMusterbereich(['CL30'], muster)).toBe(true)
    })

    it('zeigt sie auch jemandem ganz ohne Zuordnung', () => {
      expect(imMusterbereich([], undefined)).toBe(true)
      expect(imMusterbereich(undefined, undefined)).toBe(true)
    })
  })

  it('zeigt einem Konto ohne Zuordnung nichts Musterbezogenes', () => {
    // Genau deshalb ist die Zuordnung beim Anlegen Pflicht und die Migration
    // traegt sie nach: Ein solches Konto waere fuer nichts zustaendig.
    expect(imMusterbereich([], 'CL30')).toBe(false)
    expect(imMusterbereich(undefined, 'CL30')).toBe(false)
  })
})

describe('nachMuster', () => {
  const inhalte = [
    { id: 'a', aircraftType: 'CL30' },
    { id: 'b', aircraftType: 'C560 XLS+' },
    { id: 'c', aircraftType: undefined },
    { id: 'd', aircraftType: 'CL30' },
  ]

  it('laesst das eigene Muster und das Allgemeine stehen', () => {
    expect(nachMuster(['CL30'], inhalte, (x) => x.aircraftType).map((x) => x.id)).toEqual(['a', 'c', 'd'])
  })

  it('behaelt die Reihenfolge der Liste bei', () => {
    // Die Sortierung entsteht davor (alphabetisch, nach Datum); der Filter
    // darf sie nicht umwerfen.
    expect(nachMuster(['CL30', 'C560 XLS+'], inhalte, (x) => x.aircraftType).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('laesst bei fehlender Zuordnung nur das Allgemeine uebrig', () => {
    expect(nachMuster([], inhalte, (x) => x.aircraftType).map((x) => x.id)).toEqual(['c'])
  })

  it('gibt eine leere Liste zurueck, statt zu werfen', () => {
    expect(nachMuster(['CL30'], [], (x: { aircraftType?: string }) => x.aircraftType)).toEqual([])
  })
})

describe('ohneMuster', () => {
  it('erkennt ein Konto ohne Zuordnung', () => {
    expect(ohneMuster({ aircraftTypes: [] })).toBe(true)
    expect(ohneMuster({})).toBe(true)
  })

  it('erkennt ein zugeordnetes Konto', () => {
    expect(ohneMuster({ aircraftTypes: ['CL30'] })).toBe(false)
  })
})
