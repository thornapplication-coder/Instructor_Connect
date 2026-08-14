import { describe, expect, it } from 'vitest'
import { ADMIN_TABS, adminTabsFor, hatAdminPanel, istSperre, PERSON_PERMS } from './adminAccess'

/**
 * Diese Liste entscheidet, wer welchen Verwaltungsbereich oeffnet. Ein Fehler
 * darin gibt entweder jemandem zu viel — oder er zeigt eine Kachel, hinter
 * der eine Absage steht. Genau das war der Fall: Die Freigabe stand zweimal
 * in derselben Datei, einmal fuer die Reiter und einmal fuer den
 * Zugangsriegel, und die beiden waren sich nicht einig.
 */

describe('adminTabsFor', () => {
  it('gibt dem Superadmin alle Bereiche', () => {
    expect(adminTabsFor('superadmin')).toEqual([...ADMIN_TABS])
  })

  it('gibt dem Training Admin den Grading-Bereich', () => {
    // Der Verlauf je Pilot und die Standardisierung sind seine Aufgabe.
    expect(adminTabsFor('training_admin')).toEqual(['grading'])
  })

  it('gibt dem Gruppenadmin Chats und Feedback — und nichts vom Grading', () => {
    expect(adminTabsFor('group_admin')).toEqual(['groups', 'feedback'])
  })

  it('gibt dem Mitglied nichts', () => {
    expect(adminTabsFor('member')).toEqual([])
    expect(adminTabsFor(undefined)).toEqual([])
    expect(adminTabsFor(null)).toEqual([])
  })

  it('reicht dem Superadmin eine Kopie, keine gemeinsame Liste', () => {
    // Sonst aendert ein Aufrufer, der sortiert oder kuerzt, die Freigabe
    // aller anderen gleich mit.
    const a = adminTabsFor('superadmin')
    a.pop()
    expect(adminTabsFor('superadmin')).toHaveLength(ADMIN_TABS.length)
  })

  it('nennt jeden Bereich hoechstens einmal', () => {
    for (const rolle of ['superadmin', 'training_admin', 'group_admin', 'member'] as const) {
      const tabs = adminTabsFor(rolle)
      expect(new Set(tabs).size).toBe(tabs.length)
    }
  })

  it('erfindet keinen Bereich, den es nicht gibt', () => {
    for (const rolle of ['superadmin', 'training_admin', 'group_admin'] as const) {
      expect(adminTabsFor(rolle).every((x) => (ADMIN_TABS as readonly string[]).includes(x))).toBe(true)
    }
  })
})

describe('hatAdminPanel', () => {
  it('trennt genau die Rollen mit Bereichen von denen ohne', () => {
    // Die Kachel auf der Startseite und der Zugangsriegel im Panel muessen
    // dieselbe Antwort bekommen — sonst fuehrt die Kachel ins Leere.
    expect(hatAdminPanel('superadmin')).toBe(true)
    expect(hatAdminPanel('training_admin')).toBe(true)
    expect(hatAdminPanel('group_admin')).toBe(true)
    expect(hatAdminPanel('member')).toBe(false)
    expect(hatAdminPanel(undefined)).toBe(false)
  })
})

describe('Rechte an der Person', () => {
  it('fuehrt die vier, die nicht an der Rolle haengen', () => {
    expect([...PERSON_PERMS]).toEqual(['canGrade', 'isTrainee', 'canEditDirectory', 'chatBlocked'])
  })

  it('erkennt die eine Sperre unter den Erlaubnissen', () => {
    // Ein Haken bei „Chat gesperrt" nimmt etwas weg statt etwas zu geben.
    expect(istSperre('chatBlocked')).toBe(true)
    expect(PERSON_PERMS.filter(istSperre)).toEqual(['chatBlocked'])
  })
})
