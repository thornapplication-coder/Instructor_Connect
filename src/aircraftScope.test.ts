import { describe, expect, it } from 'vitest'
import { giltMusterbereich, imMusterbereich, musterPflicht, nachMuster, ohneMuster, sichtbarFuer } from './aircraftScope'

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

/** Kurzform fuer eine Person mit Rolle und Zuordnung. */
const person = (role: 'member' | 'group_admin' | 'training_admin' | 'superadmin', aircraftTypes: string[] = []) => ({ role, aircraftTypes })

describe('Wer traegt die Schranke', () => {
  it('bindet Mitglied und Admin ans Muster', () => {
    expect(giltMusterbereich(person('member'))).toBe(true)
    expect(giltMusterbereich(person('group_admin'))).toBe(true)
  })

  it('nimmt Superadmin und Training Admin aus', () => {
    // Beide haben Aufgaben, die den ganzen Betrieb betreffen: Der Superadmin
    // verwaltet die ATO, der Training Admin fuehrt die Ablage. Wer sie
    // einschraenkte, machte genau die Rollen blind, die den Ueberblick
    // haben muessen.
    expect(giltMusterbereich(person('superadmin'))).toBe(false)
    expect(giltMusterbereich(person('training_admin'))).toBe(false)
  })

  it('gibt ohne angemeldete Person nichts frei', () => {
    expect(giltMusterbereich(null)).toBe(false)
    expect(giltMusterbereich(undefined)).toBe(false)
  })
})

describe('sichtbarFuer', () => {
  it('schraenkt Mitglied und Admin auf ihre Muster ein', () => {
    expect(sichtbarFuer(person('member', ['CL30']), 'CL30')).toBe(true)
    expect(sichtbarFuer(person('member', ['CL30']), 'C560 XLS+')).toBe(false)
    expect(sichtbarFuer(person('group_admin', ['CL30']), 'C560 XLS+')).toBe(false)
  })

  it('zeigt Superadmin und Training Admin auch fremde Muster', () => {
    // Und zwar unabhaengig von ihrer eigenen Zuordnung — hier bewusst leer.
    expect(sichtbarFuer(person('superadmin', []), 'C560 XLS+')).toBe(true)
    expect(sichtbarFuer(person('training_admin', []), 'C560 XLS+')).toBe(true)
  })

  it('zeigt allen das Musteruebergreifende', () => {
    expect(sichtbarFuer(person('member', []), undefined)).toBe(true)
    expect(sichtbarFuer(person('superadmin', []), undefined)).toBe(true)
  })

  it('gibt ohne angemeldete Person nichts frei', () => {
    expect(sichtbarFuer(null, undefined)).toBe(false)
  })
})

describe('musterPflicht', () => {
  it('verlangt die Zuordnung nur dort, wo sie etwas bewirkt', () => {
    // Ein totes Pflichtfeld waere schlimmer als keines: Man klickt
    // irgendetwas an, und der naechste liest daraus eine Zustaendigkeit.
    expect(musterPflicht('member')).toBe(true)
    expect(musterPflicht('group_admin')).toBe(true)
    expect(musterPflicht('superadmin')).toBe(false)
    expect(musterPflicht('training_admin')).toBe(false)
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
    expect(nachMuster(person('member', ['CL30']), inhalte, (x) => x.aircraftType).map((x) => x.id)).toEqual(['a', 'c', 'd'])
  })

  it('reicht Superadmin und Training Admin die ganze Liste durch', () => {
    expect(nachMuster(person('superadmin', []), inhalte, (x) => x.aircraftType).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(nachMuster(person('training_admin', ['CL30']), inhalte, (x) => x.aircraftType).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('behaelt die Reihenfolge der Liste bei', () => {
    // Die Sortierung entsteht davor (alphabetisch, nach Datum); der Filter
    // darf sie nicht umwerfen.
    expect(nachMuster(person('member', ['CL30', 'C560 XLS+']), inhalte, (x) => x.aircraftType).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('laesst bei fehlender Zuordnung nur das Allgemeine uebrig', () => {
    expect(nachMuster(person('member', []), inhalte, (x) => x.aircraftType).map((x) => x.id)).toEqual(['c'])
  })

  it('gibt eine leere Liste zurueck, statt zu werfen', () => {
    expect(nachMuster(person('member', ['CL30']), [], (x: { aircraftType?: string }) => x.aircraftType)).toEqual([])
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
