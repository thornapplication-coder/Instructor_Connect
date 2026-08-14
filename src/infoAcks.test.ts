import { describe, expect, it } from 'vitest'
import { ackStand, ackZiele, infoEntryAppliesTo } from './infoAcks'
import type { Group, Role } from './types'

/**
 * Diese Regel entscheidet, wer in einem NACHWEISDOKUMENT als saeumig steht.
 * Ein Fehler hier kostet nicht Bequemlichkeit, sondern nennt jemanden vor der
 * Behoerde als jemanden, der eine Pflicht nicht erfuellt hat — waehrend die
 * App ihm den Eintrag gar nicht zeigt.
 *
 * Getestet wurde sie lange gar nicht: Sie lag als Hilfsfunktion in
 * `InstructorInfo.tsx`, und beide Wachen des Projekts globen auf `src/*.ts`.
 * Aufgefallen ist das auf Nachfrage — „hast du das kontrolliert?" —, nicht
 * beim Bauen.
 */

const wer = (id: string, name: string, role: Role, aircraftTypes: string[], active = true) =>
  ({ id, name, active, role, aircraftTypes })

const KEINE_GRUPPEN: Group[] = []
/** Im Normalfall darf jeder ins Modul; die Ausnahme wird einzeln geprueft. */
const jeder = () => true

const patrick = wer('u1', 'Patrick Thorn', 'superadmin', ['CL30', 'C560 XLS+'])
const christian = wer('u2', 'Christian Terler', 'group_admin', ['CL30'])
const michael = wer('u3', 'Michael Holy', 'member', ['C560 XLS+'])
const steven = wer('u4', 'Steven Fermie', 'training_admin', [])
const ALLE = [michael, christian, patrick, steven]

describe('Wer muss bestaetigen', () => {
  it('bei einem Eintrag mit Muster nur die, die es sehen', () => {
    // Der Fall aus der Nachfrage: Ein Admin schreibt einen Eintrag und haengt
    // ein Muster daran. Wer fuer dieses Muster nicht freigeschaltet ist,
    // sieht den Eintrag nicht — und darf deshalb auch nicht als saeumig
    // gefuehrt werden.
    const ziele = ackZiele({ aircraftType: 'C560 XLS+' }, ALLE, KEINE_GRUPPEN, jeder)
    expect(ziele.map((u) => u.name)).toEqual(['Michael Holy', 'Patrick Thorn', 'Steven Fermie'])
    expect(ziele.map((u) => u.id)).not.toContain(christian.id)
  })

  it('bei einem Eintrag ohne Muster alle', () => {
    // „Ohne Muster" heisst „betrifft alle" — dieselbe Auslegung wie ueberall.
    expect(ackZiele({}, ALLE, KEINE_GRUPPEN, jeder)).toHaveLength(4)
    expect(ackZiele({ aircraftType: '' }, ALLE, KEINE_GRUPPEN, jeder)).toHaveLength(4)
  })

  it('nimmt Superadmin und Training Admin nie wegen des Musters heraus', () => {
    // Beide stehen ausserhalb der Schranke — auch ohne eigene Zuordnung.
    const ziele = ackZiele({ aircraftType: 'ATR 42/72' }, ALLE, KEINE_GRUPPEN, jeder).map((u) => u.name)
    expect(ziele).toEqual(['Patrick Thorn', 'Steven Fermie'])
  })

  it('laesst ein stillgelegtes Konto aus', () => {
    // Wer sich nicht anmelden kann, kann nichts bestaetigen; er stuende sonst
    // fuer immer als offen in der Liste.
    const still = [...ALLE, wer('u5', 'Anna Ruhend', 'member', ['C560 XLS+'], false)]
    expect(ackZiele({ aircraftType: 'C560 XLS+' }, still, KEINE_GRUPPEN, jeder).map((u) => u.id)).not.toContain('u5')
  })

  it('laesst aus, wer das Modul gar nicht betreten darf', () => {
    // Der Training Admin ohne freigeschaltete Instructor Info: Genau dieser
    // Fall stand frueher in jeder Quote als dauerhaft saeumig.
    const nurNichtSteven = (u: { id: string }) => u.id !== steven.id
    expect(ackZiele({}, ALLE, KEINE_GRUPPEN, nurNichtSteven).map((u) => u.id)).not.toContain(steven.id)
  })

  it('beachtet die Zielgruppen des Eintrags', () => {
    const gruppen: Group[] = [
      { id: 'g1', name: 'CL30 Crew', memberIds: ['u2'], adminIds: [], purpose: '', createdAt: 0 } as unknown as Group,
    ]
    expect(ackZiele({ groupIds: ['g1'] }, ALLE, gruppen, jeder).map((u) => u.name)).toEqual(['Christian Terler'])
  })

  it('verlangt Muster UND Zielgruppe, nicht eines von beiden', () => {
    // Christian ist in der Gruppe, aber nicht im Muster — beides muss passen.
    const gruppen: Group[] = [
      { id: 'g1', name: 'Gemischt', memberIds: ['u2', 'u3'], adminIds: [], purpose: '', createdAt: 0 } as unknown as Group,
    ]
    expect(ackZiele({ groupIds: ['g1'], aircraftType: 'C560 XLS+' }, ALLE, gruppen, jeder).map((u) => u.name)).toEqual(['Michael Holy'])
  })

  it('sortiert alphabetisch, damit die Kontrollliste lesbar ist', () => {
    expect(ackZiele({}, ALLE, KEINE_GRUPPEN, jeder).map((u) => u.name)).toEqual([
      'Christian Terler',
      'Michael Holy',
      'Patrick Thorn',
      'Steven Fermie',
    ])
  })

  it('kommt mit einem leeren Bestand zurecht', () => {
    expect(ackZiele({ aircraftType: 'CL30' }, [], KEINE_GRUPPEN, jeder)).toEqual([])
  })
})

describe('ackStand', () => {
  it('zaehlt nur Bestaetigungen von Zielpersonen', () => {
    // Eine Bestaetigung von jemandem, der gar nicht zur Zielgruppe gehoert
    // (etwa nach einem Musterentzug), darf die Quote nicht ueber die Zahl der
    // Ziele heben — „4 von 3 bestaetigt" ist keine Aussage.
    const ziele = ackZiele({ aircraftType: 'C560 XLS+' }, ALLE, KEINE_GRUPPEN, jeder)
    expect(ackStand(ziele, { u3: 1000, u2: 2000 })).toBe(1)
  })

  it('ist ohne Bestaetigungen null', () => {
    expect(ackStand([michael], undefined)).toBe(0)
    expect(ackStand([michael], {})).toBe(0)
  })
})

describe('infoEntryAppliesTo', () => {
  const gruppen: Group[] = [
    { id: 'g1', name: 'A', memberIds: ['u2'], adminIds: [], purpose: '', createdAt: 0 } as unknown as Group,
  ]

  it('gilt ohne Zielgruppen fuer alle', () => {
    expect(infoEntryAppliesTo({}, 'u9', gruppen)).toBe(true)
    expect(infoEntryAppliesTo({ groupIds: [] }, 'u9', gruppen)).toBe(true)
  })

  it('gilt mit Zielgruppe nur fuer deren Mitglieder', () => {
    expect(infoEntryAppliesTo({ groupIds: ['g1'] }, 'u2', gruppen)).toBe(true)
    expect(infoEntryAppliesTo({ groupIds: ['g1'] }, 'u3', gruppen)).toBe(false)
  })

  it('uebersteht eine geloeschte Zielgruppe', () => {
    // Die Gruppe ist weg, der Verweis steht noch: kein Absturz, nur niemand.
    expect(infoEntryAppliesTo({ groupIds: ['weg'] }, 'u2', gruppen)).toBe(false)
  })
})
