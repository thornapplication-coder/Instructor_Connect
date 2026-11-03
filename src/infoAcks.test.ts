import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ackListeDateiName, ackStand, ackZiele, gueltigkeitFehler, infoEntryAppliesTo, infoGesehenBis, infoIsExpired, infoIsPublished, infoIstNeu, INFO_NEU_MS, infoPublishedAt, neuesteFremdeVeroeffentlichung } from './infoAcks'
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

const patrick = wer('u1', 'Alex Beispiel', 'superadmin', ['CL30', 'C560 XLS+'])
const christian = wer('u2', 'Chris Beispiel', 'group_admin', ['CL30'])
const michael = wer('u3', 'Mika Beispiel', 'member', ['C560 XLS+'])
const steven = wer('u4', 'Sam Beispiel', 'training_admin', [])
const ALLE = [michael, christian, patrick, steven]

describe('Wer muss bestaetigen', () => {
  it('bei einem Eintrag mit Muster nur die, die es sehen', () => {
    // Der Fall aus der Nachfrage: Ein Admin schreibt einen Eintrag und haengt
    // ein Muster daran. Wer fuer dieses Muster nicht freigeschaltet ist,
    // sieht den Eintrag nicht — und darf deshalb auch nicht als saeumig
    // gefuehrt werden.
    const ziele = ackZiele({ aircraftType: 'C560 XLS+' }, ALLE, KEINE_GRUPPEN, jeder)
    expect(ziele.map((u) => u.name)).toEqual(['Alex Beispiel', 'Mika Beispiel', 'Sam Beispiel'])
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
    expect(ziele).toEqual(['Alex Beispiel', 'Sam Beispiel'])
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
    expect(ackZiele({ groupIds: ['g1'] }, ALLE, gruppen, jeder).map((u) => u.name)).toEqual(['Chris Beispiel'])
  })

  it('verlangt Muster UND Zielgruppe, nicht eines von beiden', () => {
    // Chris ist in der Gruppe, aber nicht im Muster — beides muss passen.
    const gruppen: Group[] = [
      { id: 'g1', name: 'Gemischt', memberIds: ['u2', 'u3'], adminIds: [], purpose: '', createdAt: 0 } as unknown as Group,
    ]
    expect(ackZiele({ groupIds: ['g1'], aircraftType: 'C560 XLS+' }, ALLE, gruppen, jeder).map((u) => u.name)).toEqual(['Mika Beispiel'])
  })

  it('sortiert alphabetisch, damit die Kontrollliste lesbar ist', () => {
    expect(ackZiele({}, ALLE, KEINE_GRUPPEN, jeder).map((u) => u.name)).toEqual([
      'Alex Beispiel',
      'Chris Beispiel',
      'Mika Beispiel',
      'Sam Beispiel',
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

/*
 * Veroeffentlichung und Neu-Marke (Audit 11/2026, KERN-11).
 *
 * Nachgestellt: Chris legt einen Eintrag „Gueltig ab +10 Tage" an. Alex
 * (Superadmin) sieht ihn als Verwalter, oeffnet Instructor Info — und
 * gespeichert wird als „gesehen" das Datum in zehn Tagen. Ein danach sofort
 * gueltiger Eintrag bekam keine Neu-Marke mehr, und die Karte des
 * geplanten trug „Neu" und „Geplant" zugleich.
 *
 * Gerechnet wird in Ortszeit wie im Store (`validFrom` ist ein Kalendertag).
 */
const tag = (iso: string, uhr = '00:00:00') => new Date(`${iso}T${uhr}`).getTime()
const JETZT = tag('2026-11-03', '12:00:00')

describe('infoIsPublished / infoIsExpired / infoPublishedAt — verlegt aus store.tsx', () => {
  it('ohne „Gueltig ab" sofort veroeffentlicht, mit kuenftigem Datum nicht', () => {
    expect(infoIsPublished({}, JETZT)).toBe(true)
    expect(infoIsPublished({ validFrom: '2026-11-03' }, JETZT)).toBe(true)
    expect(infoIsPublished({ validFrom: '2026-11-13' }, JETZT)).toBe(false)
    // Unlesbares Datum sperrt nichts weg.
    expect(infoIsPublished({ validFrom: 'kaputt' }, JETZT)).toBe(true)
  })

  it('abgelaufen erst nach dem letzten Gueltigkeitstag', () => {
    expect(infoIsExpired({}, JETZT)).toBe(false)
    expect(infoIsExpired({ validUntil: '2026-11-03' }, JETZT)).toBe(false)
    expect(infoIsExpired({ validUntil: '2026-11-02' }, JETZT)).toBe(true)
    expect(infoIsExpired({ validUntil: 'kaputt' }, JETZT)).toBe(false)
  })

  it('veroeffentlicht ab dem spaeteren von Erstellung und „Gueltig ab"', () => {
    const erstellt = tag('2026-11-01', '09:00:00')
    expect(infoPublishedAt({ createdAt: erstellt })).toBe(erstellt)
    expect(infoPublishedAt({ createdAt: erstellt, validFrom: '2026-11-05' })).toBe(tag('2026-11-05'))
    expect(infoPublishedAt({ createdAt: erstellt, validFrom: '2026-10-01' })).toBe(erstellt)
    expect(infoPublishedAt({ createdAt: erstellt, validFrom: 'kaputt' })).toBe(erstellt)
  })
})

describe('neuesteFremdeVeroeffentlichung (KERN-11)', () => {
  const sofort = { authorId: 'u-christian', createdAt: JETZT - 3600_000 }
  const geplant = { authorId: 'u-christian', createdAt: JETZT - 7200_000, validFrom: '2026-11-13' }

  it('ein geplanter Eintrag zaehlt nicht', () => {
    expect(neuesteFremdeVeroeffentlichung([geplant], 'u-patrick', JETZT)).toBe(0)
  })

  it('ein sofort gueltiger zaehlt — auch neben einem geplanten', () => {
    expect(neuesteFremdeVeroeffentlichung([geplant, sofort], 'u-patrick', JETZT)).toBe(sofort.createdAt)
  })

  it('eigene Eintraege zaehlen nicht', () => {
    expect(neuesteFremdeVeroeffentlichung([sofort], 'u-christian', JETZT)).toBe(0)
  })

  it('ein kuenftiger Zeitstempel schiebt „gesehen" nie ueber jetzt hinaus', () => {
    const vorgedatiert = { authorId: 'u-christian', createdAt: JETZT + 3600_000 }
    expect(neuesteFremdeVeroeffentlichung([vorgedatiert], 'u-patrick', JETZT)).toBe(JETZT)
  })

  it('ab seinem Startdatum zaehlt der geplante Eintrag mit seinem Startdatum', () => {
    const spaeter = tag('2026-11-13', '08:00:00')
    expect(neuesteFremdeVeroeffentlichung([geplant, sofort], 'u-patrick', spaeter)).toBe(tag('2026-11-13'))
  })
})

describe('infoGesehenBis — ein Gesehen-Zeitpunkt aus der Zukunft gilt nicht (KERN-11)', () => {
  it('gueltig bleibt, was nicht in der Zukunft liegt', () => {
    expect(infoGesehenBis(JETZT - 1, JETZT)).toBe(JETZT - 1)
    expect(infoGesehenBis(JETZT, JETZT)).toBe(JETZT)
  })

  it('Zukunft oder fehlend: noch nichts gesehen', () => {
    expect(infoGesehenBis(tag('2026-11-13'), JETZT)).toBe(0)
    expect(infoGesehenBis(undefined, JETZT)).toBe(0)
  })
})

describe('infoIstNeu (KERN-11)', () => {
  it('geplant: nie „Neu" — die Karte trug „Neu" und „Geplant" zugleich', () => {
    expect(infoIstNeu({ createdAt: JETZT - 3600_000, validFrom: '2026-11-13' }, JETZT)).toBe(false)
  })

  it('veroeffentlicht: „Neu" bis knapp vor 14 Tagen, danach nicht mehr', () => {
    const v = JETZT - 3600_000
    expect(infoIstNeu({ createdAt: v }, JETZT)).toBe(true)
    expect(infoIstNeu({ createdAt: v }, v + INFO_NEU_MS - 1)).toBe(true)
    expect(infoIstNeu({ createdAt: v }, v + INFO_NEU_MS)).toBe(false)
  })

  it('ab Veroeffentlichung, nicht ab Erstellung: ein vorbereiteter Eintrag geht mit Marke online', () => {
    const erstellt = tag('2026-10-01')
    expect(infoIstNeu({ createdAt: erstellt, validFrom: '2026-11-02' }, JETZT)).toBe(true)
  })

  it('ein vorgedatierter Zeitstempel (Erstellung nach jetzt) ist nicht „Neu"', () => {
    expect(infoIstNeu({ createdAt: JETZT + 1000 }, JETZT)).toBe(false)
  })
})

describe('gueltigkeitFehler — „Gültig bis" vor „Gültig ab" (KERN-12)', () => {
  it('bis vor ab: Fehler — der Eintrag waere zugleich abgelaufen und geplant und erschiene nie', () => {
    expect(gueltigkeitFehler('2026-11-06', '2026-10-27')).toBe('bisVorAb')
    // Ein Tag davor genuegt; ueber den Monatswechsel und den Jahreswechsel.
    expect(gueltigkeitFehler('2026-11-01', '2026-10-31')).toBe('bisVorAb')
    expect(gueltigkeitFehler('2027-01-01', '2026-12-31')).toBe('bisVorAb')
  })

  it('gleicher Tag: erlaubt — der Eintrag gilt genau diesen Tag', () => {
    expect(gueltigkeitFehler('2026-11-06', '2026-11-06')).toBeNull()
    // Gegenprobe ueber die Zeitregeln: an diesem Tag veroeffentlicht und nicht abgelaufen.
    const mittag = new Date('2026-11-06T12:00:00').getTime()
    expect(infoIsPublished({ validFrom: '2026-11-06' }, mittag)).toBe(true)
    expect(infoIsExpired({ validUntil: '2026-11-06' }, mittag)).toBe(false)
  })

  it('bis nach ab: erlaubt', () => {
    expect(gueltigkeitFehler('2026-10-27', '2026-11-06')).toBeNull()
  })

  it('je ein fehlender Wert: nichts zu vergleichen (leeres bis = UFN, leeres ab = ab Veroeffentlichung)', () => {
    expect(gueltigkeitFehler('', '2026-10-27')).toBeNull()
    expect(gueltigkeitFehler('2026-11-06', '')).toBeNull()
    expect(gueltigkeitFehler(undefined, '2026-10-27')).toBeNull()
    expect(gueltigkeitFehler('2026-11-06', undefined)).toBeNull()
    expect(gueltigkeitFehler(undefined, undefined)).toBeNull()
  })

  it('andere Schreibweise wird nicht verglichen — ihre Textfolge sagt nichts ueber die Zeitfolge', () => {
    expect(gueltigkeitFehler('06.11.2026', '27.10.2026')).toBeNull()
  })
})

/**
 * Downloadname der Kontrollliste (Audit 11/2026, EXM-10/FN-01).
 *
 * Der Name entstand mit `/[^\w-]+/` ohne u-Flag — Beleg des Pruefers:
 * „read-confirmations_-nderung-L-rmschutzverfahren-bung-2026.csv". Und ohne
 * Stand-Datum wurde der naechste Auszug zur „(1)"-Kopie. Das Datum ist der
 * ORTSTAG (die CI laeuft in UTC, deshalb stellt der Test Wien ein).
 */
describe('ackListeDateiName — Umlaute und Stand-Datum (EXM-10/FN-01)', () => {
  let vorher: string | undefined
  beforeEach(() => {
    vorher = process.env.TZ
    process.env.TZ = 'Europe/Vienna'
  })
  afterEach(() => {
    if (vorher === undefined) delete process.env.TZ
    else process.env.TZ = vorher
  })
  // 23:30Z am 02.11. ist in Wien schon 00:30 am 03.11.
  const SPAET = Date.UTC(2026, 10, 2, 23, 30)

  it('behaelt Umlaute — das Beispiel aus dem Befund', () => {
    expect(ackListeDateiName('Änderung Lärmschutzverfahren Übung 2026', SPAET)).toBe(
      'read-confirmations_Änderung-Lärmschutzverfahren-Übung-2026_2026-11-03.csv',
    )
  })

  it('traegt den Ortstag des Exports, nicht den UTC-Tag', () => {
    expect(ackListeDateiName('Standard Briefing', SPAET)).toBe('read-confirmations_Standard-Briefing_2026-11-03.csv')
    // Zwei Auszuege an verschiedenen Tagen heissen verschieden.
    const tagDrauf = SPAET + 24 * 60 * 60 * 1000
    expect(ackListeDateiName('Standard Briefing', tagDrauf)).toBe('read-confirmations_Standard-Briefing_2026-11-04.csv')
  })

  it('laesst keine Pfadzeichen stehen, und ein langer Titel verliert nie das Datum', () => {
    const name = ackListeDateiName('NEW TM — Ops/Training: „Rev. 5"*', SPAET)
    expect(name).toBe('read-confirmations_NEW-TM-Ops-Training-Rev.-5_2026-11-03.csv')
    expect(name).not.toMatch(/[\\/:*?"<>|]/)
    const lang = ackListeDateiName('Überarbeitung '.repeat(20), SPAET)
    expect(lang.endsWith('_2026-11-03.csv')).toBe(true)
    expect(Array.from(lang.slice(0, -'.csv'.length)).length).toBeLessThanOrEqual(120)
  })

  it('ein Titel ohne Buchstaben laesst nur Inhalt und Datum stehen', () => {
    expect(ackListeDateiName('///', SPAET)).toBe('read-confirmations_2026-11-03.csv')
  })
})
