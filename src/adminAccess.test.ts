import { describe, expect, it } from 'vitest'
import {
  ADMIN_TABS,
  adminTabsFor,
  adminTabsFuer,
  hatAdminPanel,
  isAdminUser,
  isGroupAdmin,
  istSperre,
  PERSON_PERMS,
  personenRechtWirksam,
  personenRechtWirkt,
  rechteLink,
  suchAusQuery,
  userHasPerm,
  userMayModule,
} from './adminAccess'
import { PERM_KEYS, type Group, type PermKey, type Role, type Settings, type User } from './types'

/**
 * Diese Liste entscheidet, wer welchen Verwaltungsbereich oeffnet. Ein Fehler
 * darin gibt entweder jemandem zu viel — oder er zeigt eine Kachel, hinter
 * der eine Absage steht. Genau das war der Fall: Die Freigabe stand zweimal
 * in derselben Datei, einmal fuer die Reiter und einmal fuer den
 * Zugangsriegel, und die beiden waren sich nicht einig.
 */

/** Rechte, wie sie vor VERW-03 stillschweigend angenommen wurden. */
const MIT = { gradingAlle: true }
const OHNE = { gradingAlle: false }

describe('adminTabsFor', () => {
  it('gibt dem Superadmin alle Bereiche', () => {
    expect(adminTabsFor('superadmin', MIT)).toEqual([...ADMIN_TABS])
  })

  it('gibt dem Training Admin den Grading-Bereich', () => {
    // Der Verlauf je Pilot und die Standardisierung sind seine Aufgabe.
    expect(adminTabsFor('training_admin', MIT)).toEqual(['grading'])
  })

  it('gibt die Logbuch-Auswertung nur dem Superadmin', () => {
    // Der Training Admin oeffnet einzelne Logbuecher ueber die Kachel; der
    // Ueberblick ueber alle Zeiten aller Instruktoren ist Leitungsaufgabe.
    expect(adminTabsFor('superadmin', MIT)).toContain('logbook')
    expect(adminTabsFor('training_admin', MIT)).not.toContain('logbook')
    expect(adminTabsFor('group_admin', MIT)).not.toContain('logbook')
  })

  it('gibt dem Gruppenadmin Chats und Feedback — und nichts vom Grading', () => {
    expect(adminTabsFor('group_admin', MIT)).toEqual(['groups', 'feedback'])
  })

  it('gibt dem Mitglied nichts', () => {
    expect(adminTabsFor('member', MIT)).toEqual([])
    expect(adminTabsFor(undefined, MIT)).toEqual([])
    expect(adminTabsFor(null, MIT)).toEqual([])
  })

  it('reicht dem Superadmin eine Kopie, keine gemeinsame Liste', () => {
    // Sonst aendert ein Aufrufer, der sortiert oder kuerzt, die Freigabe
    // aller anderen gleich mit.
    const a = adminTabsFor('superadmin', MIT)
    a.pop()
    expect(adminTabsFor('superadmin', MIT)).toHaveLength(ADMIN_TABS.length)
  })

  it('nennt jeden Bereich hoechstens einmal', () => {
    for (const rolle of ['superadmin', 'training_admin', 'group_admin', 'member'] as const) {
      const tabs = adminTabsFor(rolle, MIT)
      expect(new Set(tabs).size).toBe(tabs.length)
    }
  })

  it('erfindet keinen Bereich, den es nicht gibt', () => {
    for (const rolle of ['superadmin', 'training_admin', 'group_admin'] as const) {
      expect(adminTabsFor(rolle, MIT).every((x) => (ADMIN_TABS as readonly string[]).includes(x))).toBe(true)
    }
  })
})

describe('hatAdminPanel', () => {
  it('trennt genau die Rollen mit Bereichen von denen ohne', () => {
    // Die Kachel auf der Startseite und der Zugangsriegel im Panel muessen
    // dieselbe Antwort bekommen — sonst fuehrt die Kachel ins Leere.
    expect(hatAdminPanel('superadmin', MIT)).toBe(true)
    expect(hatAdminPanel('training_admin', MIT)).toBe(true)
    expect(hatAdminPanel('group_admin', MIT)).toBe(true)
    expect(hatAdminPanel('member', MIT)).toBe(false)
    expect(hatAdminPanel(undefined, MIT)).toBe(false)
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

/* ---------- Testdaten fuer die Rechtefragen ---------- */

const matrix = (p: Partial<Record<PermKey, boolean>> = {}): Record<PermKey, boolean> =>
  Object.fromEntries(PERM_KEYS.map((k) => [k, p[k] ?? false])) as Record<PermKey, boolean>

/** Nur der Teil der Einstellungen, den die Rechtefragen lesen. */
const einstellungen = (
  group_admin: Partial<Record<PermKey, boolean>> = {},
  training_admin: Partial<Record<PermKey, boolean>> = {},
): Settings => ({ permissions: { group_admin: matrix(group_admin), training_admin: matrix(training_admin) } }) as Settings

const person = (role: Role, p: Partial<User> = {}): User => ({
  id: `u-${role}`,
  name: role,
  email: `${role}@example.test`,
  phone: '',
  role,
  canEditDirectory: false,
  canGrade: false,
  isTrainee: false,
  aircraftTypes: ['CL30'],
  active: true,
  ...p,
})

describe('Training Admin ohne vollen Archivzugriff (Audit 11/2026, VERW-03)', () => {
  // Entzog der Superadmin ihm „Alle Grading-Formulare sehen", fehlte die
  // Kachel auf der Startseite — das Panel zeigte trotzdem alle Formulare
  // samt CSV-Export. Zwei Wege, zwei Antworten auf dieselbe Rechtefrage.
  it('hat ohne grading_view_all keinen Grading-Bereich und damit kein Panel', () => {
    expect(adminTabsFor('training_admin', OHNE)).toEqual([])
    expect(hatAdminPanel('training_admin', OHNE)).toBe(false)
  })

  it('behaelt mit dem Recht den Grading-Bereich', () => {
    expect(adminTabsFor('training_admin', MIT)).toEqual(['grading'])
  })

  it('aendert an Superadmin und Gruppenadmin nichts', () => {
    expect(adminTabsFor('superadmin', OHNE)).toEqual([...ADMIN_TABS])
    expect(adminTabsFor('group_admin', OHNE)).toEqual(['groups', 'feedback'])
  })

  it('liest die Matrix ueber adminTabsFuer selbst — Startseite und Panel bekommen dieselbe Antwort', () => {
    const ta = person('training_admin')
    expect(adminTabsFuer(einstellungen({}, { grading_view_all: true }), ta)).toEqual(['grading'])
    expect(adminTabsFuer(einstellungen({}, { grading_view_all: false }), ta)).toEqual([])
    expect(isAdminUser(einstellungen({}, { grading_view_all: false }), ta)).toBe(false)
    expect(isAdminUser(einstellungen({}, { grading_view_all: true }), ta)).toBe(true)
    // Der Superadmin braucht keinen Matrixeintrag, er darf immer alles.
    expect(adminTabsFuer(einstellungen(), person('superadmin'))).toEqual([...ADMIN_TABS])
    expect(isAdminUser(einstellungen(), person('member'))).toBe(false)
    expect(isAdminUser(einstellungen(), null)).toBe(false)
  })
})

describe('userHasPerm — verlegt aus store.tsx (Audit 11/2026, VERW-02)', () => {
  it('gibt ohne Person nichts frei', () => {
    expect(userHasPerm(einstellungen(), null, 'grading_create')).toBe(false)
    expect(userHasPerm(einstellungen(), undefined, 'grading_view_all')).toBe(false)
  })

  it('gibt dem Superadmin alles — auch ohne Matrix und ohne Flags', () => {
    for (const k of PERM_KEYS) expect(userHasPerm(einstellungen(), person('superadmin'), k)).toBe(true)
  })

  it('steuert beim Mitglied genau zwei Rechte ueber die Flags, den Rest nie', () => {
    const m = person('member', { canGrade: true, canEditDirectory: true })
    expect(userHasPerm(einstellungen(), m, 'grading_create')).toBe(true)
    expect(userHasPerm(einstellungen(), m, 'contacts_manage')).toBe(true)
    expect(userHasPerm(einstellungen(), m, 'grading_view_all')).toBe(false)
    expect(userHasPerm(einstellungen(), m, 'info_manage')).toBe(false)
    expect(userHasPerm(einstellungen(), person('member'), 'grading_create')).toBe(false)
  })

  it('liest bei Admin und Training Admin die Matrix', () => {
    const s = einstellungen({ info_manage: true }, { grading_view_all: true })
    expect(userHasPerm(s, person('group_admin'), 'info_manage')).toBe(true)
    expect(userHasPerm(s, person('group_admin'), 'grading_view_all')).toBe(false)
    expect(userHasPerm(s, person('training_admin'), 'grading_view_all')).toBe(true)
    expect(userHasPerm(s, person('training_admin'), 'info_manage')).toBe(false)
  })

  it('faellt bei fehlendem Matrixeintrag auf „nein"', () => {
    const s = { permissions: {} } as Settings
    expect(userHasPerm(s, person('group_admin'), 'info_manage')).toBe(false)
  })
})

describe('userMayModule — verlegt aus store.tsx', () => {
  it('oeffnet Grading mit Anlegen ODER vollem Archiv', () => {
    expect(userMayModule(einstellungen(), person('member', { canGrade: true }), 'grading')).toBe(true)
    expect(userMayModule(einstellungen(), person('member'), 'grading')).toBe(false)
    expect(userMayModule(einstellungen({}, { grading_view_all: true }), person('training_admin'), 'grading')).toBe(true)
  })

  it('laesst alle Rollen ausser dem Training Admin in die uebrigen Module', () => {
    for (const r of ['member', 'group_admin', 'superadmin'] as const) {
      expect(userMayModule(einstellungen(), person(r), 'chat')).toBe(true)
      expect(userMayModule(einstellungen(), person(r), 'notes')).toBe(true)
    }
  })

  it('oeffnet dem Training Admin Info, Lesson Plans und Verzeichnis nur ueber die Matrix — Chat und Notizen nie', () => {
    const ta = person('training_admin')
    expect(userMayModule(einstellungen(), ta, 'info')).toBe(false)
    const s = einstellungen({}, { info_manage: true, lessons_manage: true, contacts_manage: true })
    expect(userMayModule(s, ta, 'info')).toBe(true)
    expect(userMayModule(s, ta, 'lessons')).toBe(true)
    expect(userMayModule(s, ta, 'contacts')).toBe(true)
    expect(userMayModule(s, ta, 'chat')).toBe(false)
    expect(userMayModule(s, ta, 'notes')).toBe(false)
    expect(userMayModule(s, null, 'chat')).toBe(false)
  })
})

describe('isGroupAdmin — verlegt aus store.tsx', () => {
  const g = { id: 'g', adminIds: ['u-group_admin'], memberIds: [] } as unknown as Group
  it('kennt den eingetragenen Admin und den Superadmin, sonst niemanden', () => {
    expect(isGroupAdmin(person('group_admin'), g)).toBe(true)
    expect(isGroupAdmin(person('superadmin'), g)).toBe(true)
    expect(isGroupAdmin(person('member'), g)).toBe(false)
    expect(isGroupAdmin(null, g)).toBe(false)
  })
})

describe('Wirkt das Personenrecht bei dieser Rolle? (Audit 11/2026, VERW-02)', () => {
  // Bei Admin, Training Admin und Superadmin waren „Darf bewerten" und
  // „Darf Who to call bearbeiten" bedienbar, ohne etwas zu aendern. Wer einem
  // Admin das Bewerten entzog, glaubte es entzogen zu haben.
  it('Tabelle Rolle × Personenrecht, ausgeschrieben', () => {
    const tabelle: Record<Role, Record<(typeof PERSON_PERMS)[number], boolean>> = {
      member: { canGrade: true, isTrainee: true, canEditDirectory: true, chatBlocked: true },
      group_admin: { canGrade: false, isTrainee: true, canEditDirectory: false, chatBlocked: true },
      training_admin: { canGrade: false, isTrainee: true, canEditDirectory: false, chatBlocked: true },
      superadmin: { canGrade: false, isTrainee: true, canEditDirectory: false, chatBlocked: true },
    }
    for (const [rolle, zeile] of Object.entries(tabelle) as [Role, Record<string, boolean>][]) {
      for (const perm of PERSON_PERMS) expect(personenRechtWirkt(rolle, perm), `${rolle}/${perm}`).toBe(zeile[perm])
    }
  })

  it('stimmt mit userHasPerm ueberein: Das Flag aendert das Ergebnis genau dann, wenn es wirkt', () => {
    // Die Tabelle oben ist eine Behauptung; hier wird sie an der Regel
    // gemessen, die tatsaechlich entscheidet. Laeuft eine von beiden weg,
    // wird dieser Fall rot.
    const s = einstellungen({ grading_create: true, contacts_manage: false }, { grading_create: false, contacts_manage: true })
    const paare = [
      ['canGrade', 'grading_create'],
      ['canEditDirectory', 'contacts_manage'],
    ] as const
    for (const rolle of ['member', 'group_admin', 'training_admin', 'superadmin'] as const) {
      for (const [flag, recht] of paare) {
        const an = userHasPerm(s, person(rolle, { [flag]: true }), recht)
        const aus = userHasPerm(s, person(rolle, { [flag]: false }), recht)
        expect(an !== aus, `${rolle}/${flag}`).toBe(personenRechtWirkt(rolle, flag))
      }
    }
  })

  it('Gruppenadmin mit canGrade=false behaelt grading_create aus der Matrix — die Zelle ist gesperrt und zeigt das', () => {
    const chris = person('group_admin', { canGrade: false, canEditDirectory: false })
    const s = einstellungen({ grading_create: true, contacts_manage: true })
    expect(personenRechtWirkt(chris.role, 'canGrade')).toBe(false)
    expect(userHasPerm(s, chris, 'grading_create')).toBe(true)
    // Gezeigt wird der WIRKSAME Wert, nicht das gespeicherte Flag.
    expect(personenRechtWirksam(s, chris, 'canGrade')).toBe(true)
    expect(personenRechtWirksam(s, chris, 'canEditDirectory')).toBe(true)
    expect(personenRechtWirksam(einstellungen(), chris, 'canGrade')).toBe(false)
  })

  it('zeigt bei Trainee und Chat-Sperre das Flag der Person', () => {
    expect(personenRechtWirksam(einstellungen(), person('group_admin', { isTrainee: true }), 'isTrainee')).toBe(true)
    expect(personenRechtWirksam(einstellungen(), person('superadmin', { chatBlocked: true }), 'chatBlocked')).toBe(true)
    expect(personenRechtWirksam(einstellungen(), person('member'), 'chatBlocked')).toBe(false)
    expect(personenRechtWirksam(einstellungen(), person('member', { canGrade: true }), 'canGrade')).toBe(true)
  })
})

describe('„Rechte dieser Person" filtert auf die Person (Audit 11/2026, VERW-22)', () => {
  // Der Link fuehrte auf die ungefilterte Rechte-Seite; man suchte die Person
  // ein zweites Mal. Jetzt traegt er die E-Mail mit, die Seite belegt daraus
  // ihre Suche vor.
  it('Rundlauf: die E-Mail kommt unveraendert an — auch mit + und Umlaut', () => {
    for (const email of ['anna.berger@example.test', 'a+b@example.test', 'jörg@example.test']) {
      expect(suchAusQuery(`#${rechteLink(email)}`)).toBe(email)
      // Ohne fuehrendes # (Router-Pfad) gleich.
      expect(suchAusQuery(rechteLink(email))).toBe(email)
    }
  })

  it('zeigt den Link auf die Rechte-Seite', () => {
    expect(rechteLink('a+b@example.test')).toBe('/admin/permissions?q=a%2Bb%40example.test')
  })

  it('ohne ?q= bleibt die Suche leer — die Seite zeigt wie bisher alle', () => {
    expect(suchAusQuery('#/admin/permissions')).toBe('')
    expect(suchAusQuery('')).toBe('')
    expect(suchAusQuery('#/admin/permissions?x=1')).toBe('')
    expect(suchAusQuery('#/admin/permissions?q=')).toBe('')
  })

  it('schneidet Rand-Leerzeichen ab, damit die Suche nicht ins Leere laeuft', () => {
    expect(suchAusQuery('#/admin/permissions?q=%20anna%20')).toBe('anna')
  })
})
