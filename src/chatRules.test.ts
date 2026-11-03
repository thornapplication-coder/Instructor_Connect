import { describe, expect, it } from 'vitest'
import {
  anhangZuGross,
  nachrichtAbgewiesen,
  prozentAnteile,
  spaetestesUmfrageEnde,
  stimmenJeOption,
  VERLAUF_SCHRITT,
  verlaufFenster,
  umfrageAblaufFehler,
  umfrageAbgewiesen,
  umfrageEndeAus,
  utcTag,
  utcZeit,
  type UmfrageEntwurf,
} from './chatRules'
import { RETENTION_MS, type Group, type User } from './types'

/**
 * Chat-Regeln, die Store und Ansicht gemeinsam fragen.
 *
 * Audit 11/2026, KERN-08: Vier Aktionen scheiterten ohne Rueckmeldung, und
 * bei der Nachricht war der getippte Text danach weg — der Store wies ab,
 * die Ansicht leerte trotzdem. Jeder Ablehnungsgrund steht hier mit einem
 * Gutfall daneben, damit eine Regel nicht still zu streng wird.
 *
 * Audit 11/2026, KERN-09: Eine laut Anzeige noch 12 Tage gueltige Umfrage
 * verschwand nach 7 Tagen samt Stimmen — die Aufbewahrung der Gruppe
 * loescht ab Erstellung, die Gueltigkeit spielt dabei keine Rolle.
 */

const nutzer = (id: string, extra: Partial<User> = {}): User => ({
  id, name: id, email: `${id}@example.test`, phone: '', role: 'member', canEditDirectory: false, canGrade: false,
  isTrainee: false, aircraftTypes: ['CL30'], active: true, ...extra,
})
const gruppe: Group = { id: 'g', name: 'Autothrottle', purpose: '', aircraftType: 'CL30', adminIds: [], memberIds: ['drin', 'gesperrt'], retention: null }

const drin = nutzer('drin')
const T = Date.UTC(2026, 10, 3, 12, 0)
const h = 3600_000
const d = 24 * h

describe('nachrichtAbgewiesen (KERN-08)', () => {
  it('Gutfall: Mitglied, Text, kein Anhang', () => {
    expect(nachrichtAbgewiesen(drin, gruppe, 'Hallo', undefined, 25)).toBeNull()
  })

  it('Gutfall: nur ein Anhang, kein Text — und genau an der Grenze', () => {
    expect(nachrichtAbgewiesen(drin, gruppe, '', { sizeMB: 25 }, 25)).toBeNull()
  })

  it('gesperrt: die Sperre des Admins gilt auch fuer Mitglieder und geht vor', () => {
    expect(nachrichtAbgewiesen(nutzer('gesperrt', { chatBlocked: true }), gruppe, 'Hallo', undefined, 25)).toBe('gesperrt')
  })

  it('keinMitglied: Nichtmitglied, fremdes Muster, inaktiv, abgemeldet oder Gruppe weg', () => {
    expect(nachrichtAbgewiesen(nutzer('aussen'), gruppe, 'Hallo', undefined, 25)).toBe('keinMitglied')
    expect(nachrichtAbgewiesen(nutzer('drin', { aircraftTypes: ['C560 XLS+'] }), gruppe, 'Hallo', undefined, 25)).toBe('keinMitglied')
    expect(nachrichtAbgewiesen(nutzer('drin', { active: false }), gruppe, 'Hallo', undefined, 25)).toBe('keinMitglied')
    expect(nachrichtAbgewiesen(null, gruppe, 'Hallo', undefined, 25)).toBe('keinMitglied')
    expect(nachrichtAbgewiesen(drin, undefined, 'Hallo', undefined, 25)).toBe('keinMitglied')
  })

  it('leer: nur Leerzeichen und kein Anhang', () => {
    expect(nachrichtAbgewiesen(drin, gruppe, '   ', undefined, 25)).toBe('leer')
  })

  it('anhangZuGross: ueber dem Limit der Einstellungen — auch mit Text', () => {
    expect(nachrichtAbgewiesen(drin, gruppe, 'Bild dazu', { sizeMB: 3.2 }, 3)).toBe('anhangZuGross')
  })
})

describe('anhangZuGross — schon beim Anfuegen gefragt (KERN-08)', () => {
  it('ohne Anhang nie, an der Grenze nicht, darueber ja', () => {
    expect(anhangZuGross(undefined, 1)).toBe(false)
    expect(anhangZuGross({ sizeMB: 3 }, 3)).toBe(false)
    expect(anhangZuGross({ sizeMB: 3.2 }, 3)).toBe(true)
  })
})

describe('spaetestesUmfrageEnde (KERN-09)', () => {
  it('24 Stunden, 7 Tage, 30 und 90 Tage: ab jetzt gerechnet', () => {
    expect(spaetestesUmfrageEnde(T, '24h')).toBe(T + 24 * h)
    expect(spaetestesUmfrageEnde(T, '7d')).toBe(T + 7 * d)
    expect(spaetestesUmfrageEnde(T, '30d')).toBe(T + RETENTION_MS['30d'])
    expect(spaetestesUmfrageEnde(T, '90d')).toBe(T + 90 * d)
  })

  it('„nie loeschen": keine Grenze', () => {
    expect(spaetestesUmfrageEnde(T, 'never')).toBeUndefined()
  })
})

describe('umfrageAblaufFehler (KERN-08, KERN-09)', () => {
  it('fehlt: ohne Ablauf oder mit unbrauchbarem Wert', () => {
    expect(umfrageAblaufFehler(undefined, T, '7d')).toBe('ablaufFehlt')
    expect(umfrageAblaufFehler(Number.NaN, T, '7d')).toBe('ablaufFehlt')
  })

  it('vorbei: in der Vergangenheit oder genau jetzt — die Umfrage kaeme geschlossen zur Welt', () => {
    expect(umfrageAblaufFehler(T - 1, T, '7d')).toBe('ablaufVorbei')
    expect(umfrageAblaufFehler(T, T, '7d')).toBe('ablaufVorbei')
  })

  it('genau am Rand der Aufbewahrung: erlaubt; eine Millisekunde darueber: abgewiesen', () => {
    expect(umfrageAblaufFehler(T + 7 * d, T, '7d')).toBeNull()
    expect(umfrageAblaufFehler(T + 7 * d + 1, T, '7d')).toBe('ablaufNachAufbewahrung')
  })

  it('der Fall aus dem Audit: 7 Tage Aufbewahrung, Ablauf in 18 Tagen', () => {
    expect(umfrageAblaufFehler(T + 18 * d, T, '7d')).toBe('ablaufNachAufbewahrung')
  })

  it('24 Stunden: morgen frueh ja, uebermorgen nein', () => {
    expect(umfrageAblaufFehler(T + 20 * h, T, '24h')).toBeNull()
    expect(umfrageAblaufFehler(T + 30 * h, T, '24h')).toBe('ablaufNachAufbewahrung')
  })

  it('„nie loeschen": jeder kuenftige Ablauf geht', () => {
    expect(umfrageAblaufFehler(T + 365 * d, T, 'never')).toBeNull()
  })
})

describe('umfrageAbgewiesen — Dialog und Store fragen dieselbe Regel (KERN-08)', () => {
  const gut: UmfrageEntwurf = { question: 'Passt Freitag?', type: 'yesno', options: [], validUntil: T + 2 * d }

  it('Gutfall: Ja/Nein und Mehrfachauswahl mit zwei Optionen', () => {
    expect(umfrageAbgewiesen(gut, T, '7d')).toBeNull()
    expect(umfrageAbgewiesen({ ...gut, type: 'multi', options: ['Montag', 'Dienstag'] }, T, '7d')).toBeNull()
  })

  it('frageLeer', () => {
    expect(umfrageAbgewiesen({ ...gut, question: '  ' }, T, '7d')).toBe('frageLeer')
  })

  it('zuWenigOptionen: leere Optionen zaehlen nicht', () => {
    expect(umfrageAbgewiesen({ ...gut, type: 'multi', options: ['Montag', ' '] }, T, '7d')).toBe('zuWenigOptionen')
  })

  it('der Ablauf geht durch dieselbe Pruefung', () => {
    expect(umfrageAbgewiesen({ ...gut, validUntil: undefined }, T, '7d')).toBe('ablaufFehlt')
    expect(umfrageAbgewiesen({ ...gut, validUntil: T - d }, T, '7d')).toBe('ablaufVorbei')
    expect(umfrageAbgewiesen({ ...gut, validUntil: T + 12 * d }, T, '7d')).toBe('ablaufNachAufbewahrung')
  })
})

describe('Datum und Uhrzeit des Dialogs — UTC', () => {
  it('liest Datum und Uhrzeit als UTC', () => {
    expect(umfrageEndeAus('2026-11-21', '14:30')).toBe(Date.UTC(2026, 10, 21, 14, 30))
  })

  it('ohne Uhrzeit gilt das Tagesende 23:59', () => {
    expect(umfrageEndeAus('2026-11-21', '')).toBe(Date.UTC(2026, 10, 21, 23, 59))
  })

  it('ohne oder mit unvollstaendigem Datum kein Zeitpunkt', () => {
    expect(umfrageEndeAus('', '12:00')).toBeUndefined()
    expect(umfrageEndeAus('2026-11', '12:00')).toBeUndefined()
  })

  it('utcTag fuer min/max: der UTC-Kalendertag, nicht der oertliche', () => {
    expect(utcTag(Date.UTC(2026, 10, 21, 23, 30))).toBe('2026-11-21')
    expect(utcTag(Date.UTC(2026, 10, 22, 0, 30))).toBe('2026-11-22')
  })

  it('utcZeit: DD.MM.YYYY HH:MM UTC', () => {
    expect(utcZeit(Date.UTC(2026, 0, 5, 7, 3))).toBe('05.01.2026 07:03 UTC')
  })
})

describe('prozentAnteile — Summe 100 (KERN-15)', () => {
  const summe = (a: number[]) => a.reduce((x, y) => x + y, 0)

  it('drei gleich starke Optionen: zusammen 100, nicht 99 — der Rest geht an die erste', () => {
    expect(prozentAnteile([1, 1, 1])).toEqual([34, 33, 33])
    expect(summe(prozentAnteile([1, 1, 1]))).toBe(100)
  })

  it('[1, 2] → [33, 67]', () => {
    expect(prozentAnteile([1, 2])).toEqual([33, 67])
  })

  it('je einzeln gerundet waeren es 101 % — hier 100', () => {
    // 12,5 / 37,5 / 50: Math.round je Option ergab 13 + 38 + 50.
    expect(prozentAnteile([1, 3, 4])).toEqual([13, 37, 50])
  })

  it('ohne Stimmen: alles 0, nichts verteilt', () => {
    expect(prozentAnteile([0, 0])).toEqual([0, 0])
    expect(prozentAnteile([])).toEqual([])
  })

  it('[2, 0, 0] → [100, 0, 0]', () => {
    expect(prozentAnteile([2, 0, 0])).toEqual([100, 0, 0])
  })

  it('viele Optionen: immer genau 100', () => {
    for (const stimmen of [[1, 1, 1, 1, 1, 1, 1], [5, 3, 2, 1], [7, 7, 7], [1, 1, 1, 1, 1, 1]]) {
      expect(summe(prozentAnteile(stimmen))).toBe(100)
    }
  })
})

describe('stimmenJeOption', () => {
  it('zaehlt je Index; Stimmen ausserhalb der Optionen zaehlen nicht', () => {
    expect(stimmenJeOption(3, { a: 0, b: 2, c: 2, d: 5, e: -1 })).toEqual([1, 0, 2])
    expect(stimmenJeOption(2, {})).toEqual([0, 0])
  })
})

describe('verlaufFenster — lange Verlaeufe schrittweise (TEC-10)', () => {
  const liste = Array.from({ length: 400 }, (_, i) => i)

  it('zeigt die juengsten Eintraege und nennt, wie viele davor liegen', () => {
    const f = verlaufFenster(liste, VERLAUF_SCHRITT)
    expect(f.sichtbar).toHaveLength(VERLAUF_SCHRITT)
    expect(f.sichtbar[0]).toBe(400 - VERLAUF_SCHRITT)
    expect(f.sichtbar.at(-1)).toBe(399)
    expect(f.verborgen).toBe(400 - VERLAUF_SCHRITT)
  })

  it('kurzer Verlauf: alles, nichts verborgen — dieselbe Liste, keine Kopie', () => {
    const kurz = [1, 2, 3]
    const f = verlaufFenster(kurz, VERLAUF_SCHRITT)
    expect(f.sichtbar).toBe(kurz)
    expect(f.verborgen).toBe(0)
  })

  it('mehr gezeigt als vorhanden, genau so viele, keine oder Unsinn', () => {
    expect(verlaufFenster(liste, 1000).verborgen).toBe(0)
    expect(verlaufFenster(liste, 400).verborgen).toBe(0)
    expect(verlaufFenster(liste, 0)).toEqual({ sichtbar: [], verborgen: 400 })
    expect(verlaufFenster(liste, -5).verborgen).toBe(400)
    expect(verlaufFenster(liste, 2.7).sichtbar).toEqual([398, 399])
  })
})
