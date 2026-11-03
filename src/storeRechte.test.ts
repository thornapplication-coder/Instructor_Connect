import { describe, expect, it } from 'vitest'
import {
  darfAbstimmen,
  darfFeedbackBearbeiten,
  darfGruppeAnlegen,
  darfInfoVerwalten,
  darfKontakteVerwalten,
  darfLessonPlansVerwalten,
  darfSchreiben,
  darfStummschalten,
  darfUmfrageSchliessen,
  darfVerwaltung,
  feedbackFuer,
  type VerwaltungsAktion,
} from './storeRechte'
import { PERM_KEYS, type FeedbackEntry, type Group, type PermKey, type Role, type Settings, type User } from './types'

/**
 * Schreibende Store-Aktionen fragen den Handelnden (Audit 11/2026, VERW-23,
 * KERN-19). Die Matrix ist — wie bei access.ts — Zeile fuer Zeile
 * ausgeschrieben: Mit Phase 1b wird sie Vorlage fuer RLS, und wer eine Zelle
 * aendert, soll sehen, welche Zusage er gerade aufgibt.
 *
 * Besetzung: Mitglied und Gruppenadmin fliegen CL30, die Gruppe ist eine
 * CL30-Gruppe. Der Superadmin ist NICHT Mitglied (das war der Fall aus dem
 * Betrieb: er stimmte trotzdem ab). Der Training Admin hat keinen Chat.
 */

const matrix = (p: Partial<Record<PermKey, boolean>> = {}): Record<PermKey, boolean> =>
  Object.fromEntries(PERM_KEYS.map((k) => [k, p[k] ?? false])) as Record<PermKey, boolean>

/** Gruppenadmin darf Info, Lesson Plans, Kontakte; Training Admin hat das
 *  volle Archiv (also ein Panel), sonst nichts. */
const S = {
  permissions: {
    group_admin: matrix({ grading_create: true, info_manage: true, lessons_manage: true, contacts_manage: true }),
    training_admin: matrix({ grading_view_all: true }),
  },
} as Settings

/** Dieselbe Matrix, aber ohne die Inhaltsrechte — fuer die Gegenrichtung. */
const OHNE_RECHTE = {
  permissions: { group_admin: matrix(), training_admin: matrix() },
} as Settings

const person = (id: string, role: Role, p: Partial<User> = {}): User => ({
  id,
  name: id,
  email: `${id}@example.test`,
  phone: '',
  role,
  canEditDirectory: false,
  canGrade: false,
  isTrainee: false,
  aircraftTypes: ['CL30'],
  active: true,
  ...p,
})

const mitglied = person('mitglied', 'member')
const gruppenadmin = person('gruppenadmin', 'group_admin')
const superadmin = person('super', 'superadmin', { aircraftTypes: [] })
const trainingAdmin = person('ta', 'training_admin', { aircraftTypes: [] })
const aussen = person('aussen', 'member')
const fremd = person('fremd', 'group_admin', { aircraftTypes: ['C560 XLS+'] })

const gruppe: Group = {
  id: 'g1',
  name: 'CL30',
  purpose: '',
  aircraftType: 'CL30',
  adminIds: ['gruppenadmin', 'fremd'],
  memberIds: ['mitglied', 'gruppenadmin', 'fremd'],
  retention: null,
}

const ROLLEN: [string, User][] = [
  ['Mitglied', mitglied],
  ['Gruppenadmin', gruppenadmin],
  ['Training Admin', trainingAdmin],
  ['Superadmin', superadmin],
]

describe('darfVerwaltung — Rolle × Aktion', () => {
  //                                 Mitglied  Gruppenadmin  Training Admin  Superadmin
  const TABELLE: [VerwaltungsAktion, boolean, boolean, boolean, boolean][] = [
    ['nutzerAnlegen', /*         */ false, /*   */ false, /*        */ false, /*    */ true],
    ['nutzerAendern', /*         */ false, /*   */ false, /*        */ false, /*    */ true],
    ['einstellungen', /*         */ false, /*   */ false, /*        */ false, /*    */ true],
    ['feedback', /*              */ false, /*   */ true, /*         */ false, /*    */ true],
  ]
  for (const [aktion, ...erwartet] of TABELLE) {
    it(aktion, () => {
      expect(ROLLEN.map(([, u]) => darfVerwaltung(S, u, aktion))).toEqual(erwartet)
    })
  }

  it('addUser legt aus einer offen gebliebenen Ansicht keinen Superadmin mehr an (VERW-23)', () => {
    // Der Gruppenadmin hat ein Panel (Gruppen, Feedback) — die
    // Benutzerverwaltung gehoert nicht dazu.
    expect(darfVerwaltung(S, gruppenadmin, 'nutzerAnlegen')).toBe(false)
  })

  it('ohne Handelnden oder deaktiviert: nichts', () => {
    expect(darfVerwaltung(S, null, 'einstellungen')).toBe(false)
    expect(darfVerwaltung(S, undefined, 'feedback')).toBe(false)
    expect(darfVerwaltung(S, { ...superadmin, active: false }, 'nutzerAnlegen')).toBe(false)
  })
})

describe('Feedback: Sicht und Schreibrecht geben dieselbe Antwort', () => {
  const eintrag = (authorId: string, aircraftType?: string): Pick<FeedbackEntry, 'authorId' | 'aircraftType'> => ({ authorId, aircraftType })
  const groups = [gruppe]

  it('Superadmin: jede Rueckmeldung', () => {
    expect(darfFeedbackBearbeiten(S, superadmin, eintrag('aussen', 'C560 XLS+'), groups)).toBe(true)
  })

  it('Gruppenadmin: nur seine Leute, nur im eigenen Muster', () => {
    expect(darfFeedbackBearbeiten(S, gruppenadmin, eintrag('mitglied', 'CL30'), groups)).toBe(true)
    expect(darfFeedbackBearbeiten(S, gruppenadmin, eintrag('mitglied'), groups)).toBe(true)
    // Nicht in einer seiner Gruppen
    expect(darfFeedbackBearbeiten(S, gruppenadmin, eintrag('aussen', 'CL30'), groups)).toBe(false)
    // Seine Leute, aber fremdes Muster
    expect(darfFeedbackBearbeiten(S, gruppenadmin, eintrag('mitglied', 'C560 XLS+'), groups)).toBe(false)
  })

  it('Mitglied als Chat-Admin einer Gruppe hat trotzdem keinen Feedback-Bereich', () => {
    const chatAdmin = { ...gruppe, adminIds: ['mitglied'] }
    expect(feedbackFuer(mitglied, [eintrag('gruppenadmin', 'CL30')], [chatAdmin])).toHaveLength(1)
    expect(darfFeedbackBearbeiten(S, mitglied, eintrag('gruppenadmin', 'CL30'), [chatAdmin])).toBe(false)
  })

  it('Training Admin: kein Feedback-Bereich', () => {
    expect(darfFeedbackBearbeiten(S, trainingAdmin, eintrag('mitglied', 'CL30'), groups)).toBe(false)
  })

  it('feedbackFuer — die Rechnung, die vorher als visibleFeedback im Store stand', () => {
    const alle = [eintrag('mitglied', 'CL30'), eintrag('mitglied', 'C560 XLS+'), eintrag('aussen'), eintrag('mitglied')]
    expect(feedbackFuer(superadmin, alle, groups)).toEqual(alle)
    expect(feedbackFuer(gruppenadmin, alle, groups)).toEqual([alle[0], alle[3]])
    expect(feedbackFuer(null, alle, groups)).toEqual([])
  })
})

describe('Inhalte — Rolle × Muster des Inhalts', () => {
  //                          Mitglied  Gruppenadmin  Training Admin  Superadmin
  const INFO: [string | undefined, boolean, boolean, boolean, boolean][] = [
    ['CL30', /*           */ false, /*   */ true, /*         */ false, /*    */ true],
    ['C560 XLS+', /*      */ false, /*   */ false, /*        */ false, /*    */ true],
    [undefined, /*        */ false, /*   */ true, /*         */ false, /*    */ true],
  ]
  for (const [muster, ...erwartet] of INFO) {
    it(`Info-Eintrag ${muster ?? 'ohne Muster'}`, () => {
      expect(ROLLEN.map(([, u]) => darfInfoVerwalten(S, u, muster))).toEqual(erwartet)
    })
    it(`Lesson Plan ${muster ?? 'ohne Muster'}`, () => {
      expect(ROLLEN.map(([, u]) => darfLessonPlansVerwalten(S, u, muster))).toEqual(erwartet)
    })
  }

  it('Training Admin mit info_manage/lessons_manage: jedes Muster (keine Musterschranke)', () => {
    const mit = { permissions: { group_admin: matrix(), training_admin: matrix({ info_manage: true, lessons_manage: true }) } } as Settings
    expect(darfInfoVerwalten(mit, trainingAdmin, 'C560 XLS+')).toBe(true)
    expect(darfLessonPlansVerwalten(mit, trainingAdmin, 'CL30')).toBe(true)
  })

  it('ohne Recht aus der Matrix: auch im eigenen Muster nicht', () => {
    expect(darfInfoVerwalten(OHNE_RECHTE, gruppenadmin, 'CL30')).toBe(false)
    expect(darfLessonPlansVerwalten(OHNE_RECHTE, gruppenadmin, 'CL30')).toBe(false)
  })

  it('Kontakte: beim Mitglied entscheidet das Personenrecht, sonst die Matrix', () => {
    expect(ROLLEN.map(([, u]) => darfKontakteVerwalten(S, u))).toEqual([false, true, false, true])
    expect(darfKontakteVerwalten(S, { ...mitglied, canEditDirectory: true })).toBe(true)
    expect(darfKontakteVerwalten(OHNE_RECHTE, gruppenadmin)).toBe(false)
  })

  it('deaktiviert: nichts', () => {
    const aus = { ...superadmin, active: false }
    expect(darfInfoVerwalten(S, aus, undefined)).toBe(false)
    expect(darfLessonPlansVerwalten(S, aus, undefined)).toBe(false)
    expect(darfKontakteVerwalten(S, aus)).toBe(false)
  })
})

describe('Gruppe anlegen — Rolle × Muster', () => {
  //                          Mitglied  Gruppenadmin  Training Admin  Superadmin
  const TABELLE: [string | undefined, boolean, boolean, boolean, boolean][] = [
    ['CL30', /*           */ false, /*   */ true, /*         */ false, /*    */ true],
    // Der Anleger wird Mitglied — eine Gruppe fremden Musters koennte er
    // danach selbst nicht betreten.
    ['C560 XLS+', /*      */ false, /*   */ false, /*        */ false, /*    */ true],
    [undefined, /*        */ false, /*   */ true, /*         */ false, /*    */ true],
  ]
  for (const [muster, ...erwartet] of TABELLE) {
    it(`${muster ?? 'ohne Muster'}`, () => {
      expect(ROLLEN.map(([, u]) => darfGruppeAnlegen(S, u, muster))).toEqual(erwartet)
    })
  }

  it('deaktiviert oder abgemeldet: nichts', () => {
    expect(darfGruppeAnlegen(S, { ...superadmin, active: false }, undefined)).toBe(false)
    expect(darfGruppeAnlegen(S, null, undefined)).toBe(false)
  })
})

describe('Chat — Fall × Aktion', () => {
  const umfrageVon = (authorId: string) => ({ authorId })
  const gesperrt = { ...mitglied, chatBlocked: true }
  const superMitglied = { ...superadmin, id: 'super-drin' }
  const mitSuper = { ...gruppe, memberIds: [...gruppe.memberIds, 'super-drin'] }

  //                                              schreiben  abstimmen  schliessen(fremde)  stumm
  const FAELLE: [string, User, Group, boolean, boolean, boolean, boolean][] = [
    ['Mitglied', /*                    */ mitglied, gruppe, true, /*  */ true, /*  */ false, /*       */ true],
    ['Mitglied mit Chat-Sperre', /*    */ gesperrt, gruppe, false, /* */ true, /*  */ false, /*       */ true],
    ['Gruppenadmin', /*                */ gruppenadmin, gruppe, true, true, /*     */ true, /*        */ true],
    ['Superadmin ohne Mitgliedschaft', superadmin, gruppe, false, /*  */ false, /* */ true, /*        */ true],
    ['Superadmin als Mitglied', /*     */ superMitglied, mitSuper, true, true, /*  */ true, /*        */ true],
    ['Training Admin', /*              */ trainingAdmin, gruppe, false, false, /*  */ false, /*       */ false],
    ['Nichtmitglied', /*               */ aussen, gruppe, false, /*   */ false, /* */ false, /*       */ false],
    // Admin und Mitglied, aber fremdes Muster: kommt nicht hinein (Altbestand).
    ['Admin fremden Musters', /*       */ fremd, gruppe, false, /*    */ false, /* */ false, /*       */ false],
  ]
  for (const [fall, u, g, schreiben, abstimmen, schliessen, stumm] of FAELLE) {
    it(fall, () => {
      expect({
        schreiben: darfSchreiben(u, g),
        abstimmen: darfAbstimmen(u, g),
        schliessen: darfUmfrageSchliessen(u, umfrageVon('jemand'), g),
        stumm: darfStummschalten(u, g),
      }).toEqual({ schreiben, abstimmen, schliessen, stumm })
    })
  }

  it('die eigene Umfrage schliesst der Autor — solange er in der Gruppe ist', () => {
    expect(darfUmfrageSchliessen(mitglied, umfrageVon('mitglied'), gruppe)).toBe(true)
    const raus = { ...gruppe, memberIds: gruppe.memberIds.filter((m) => m !== 'mitglied') }
    expect(darfUmfrageSchliessen(mitglied, umfrageVon('mitglied'), raus)).toBe(false)
  })

  it('deaktiviert oder abgemeldet: nichts', () => {
    const aus = { ...mitglied, active: false }
    expect([darfSchreiben(aus, gruppe), darfAbstimmen(aus, gruppe), darfUmfrageSchliessen(aus, umfrageVon('mitglied'), gruppe), darfStummschalten(aus, gruppe)]).toEqual([false, false, false, false])
    expect([darfSchreiben(null, gruppe), darfAbstimmen(null, gruppe), darfUmfrageSchliessen(null, umfrageVon('x'), gruppe), darfStummschalten(null, gruppe)]).toEqual([false, false, false, false])
  })
})
