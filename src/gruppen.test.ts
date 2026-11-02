import { describe, expect, it } from 'vitest'
import { adminKandidaten, gruppenAenderungFehler, gruppenName, gruppenNameFehler, mayAccessGroup } from './gruppen'
import type { Group, Role, User } from './types'

/**
 * Gruppennamen (Audit 11/2026, VERW-04).
 *
 * Nachgestellt: In „Ground Training" am Ende „ Vienna Base" getippt —
 * gespeichert wurde „Ground TrainingViennaBase". Die Umbenennung lief bei
 * jedem Tastendruck durch eine Pruefung, die beschnitt und leere Namen
 * verwarf. Die Pruefung gehoert ans Ende der Eingabe, und sie steht EINMAL.
 */

const gruppen = [
  { id: 'g-auto', name: 'Autothrottle' },
  { id: 'g-defects', name: 'SIM Defects' },
]

describe('gruppenName', () => {
  it('laesst Mehrwortnamen stehen und nimmt nur die Raender weg', () => {
    expect(gruppenName('  Ground Training Vienna Base ')).toBe('Ground Training Vienna Base')
    expect(gruppenName('Ops  Team')).toBe('Ops  Team')
  })
})

describe('gruppenNameFehler', () => {
  it('nimmt einen neuen Mehrwortnamen an', () => {
    expect(gruppenNameFehler(gruppen, null, 'Ground Training Vienna Base')).toBeNull()
    expect(gruppenNameFehler(gruppen, 'g-auto', 'Ground Training Vienna Base ')).toBeNull()
  })

  it('weist einen leeren Namen ab — auch einen aus lauter Leerzeichen', () => {
    expect(gruppenNameFehler(gruppen, null, '')).toBe('leer')
    expect(gruppenNameFehler(gruppen, 'g-auto', '   ')).toBe('leer')
  })

  it('weist einen vergebenen Namen ohne Ruecksicht auf Gross-/Kleinschreibung ab', () => {
    expect(gruppenNameFehler(gruppen, null, 'sim defects')).toBe('vergeben')
    expect(gruppenNameFehler(gruppen, 'g-auto', ' SIM DEFECTS ')).toBe('vergeben')
  })

  it('zaehlt den eigenen Namen nicht als vergeben', () => {
    expect(gruppenNameFehler(gruppen, 'g-defects', 'SIM Defects')).toBeNull()
    expect(gruppenNameFehler(gruppen, 'g-defects', 'sim defects')).toBeNull()
  })

  it('vergleicht auch gespeicherte Namen ohne ihre Randleerzeichen', () => {
    // Altbestand vor dieser Regel konnte Raender tragen.
    expect(gruppenNameFehler([{ id: 'x', name: 'Ops ' }], null, 'ops')).toBe('vergeben')
  })
})

/**
 * Mitglieder und Admins (Audit 11/2026, VERW-09, VERW-11).
 *
 * Nachgestellt als Chris (Gruppenadmin): In „Ground Training" den eigenen
 * Mitglieder-Chip angeklickt — danach adminIds [] und memberIds
 * ['u-patrick'], kein Dialog, und die Gruppe war aus seiner Liste
 * verschwunden. ChatInfo nahm die eigene Person immer schon aus.
 */
describe('gruppenAenderungFehler', () => {
  const ground = { memberIds: ['u-patrick', 'u-christian'], adminIds: ['u-christian'] }
  const chris = { id: 'u-christian', role: 'group_admin' as const }
  const alex = { id: 'u-patrick', role: 'superadmin' as const }

  it('ein Gruppenadmin kann sich nicht selbst als Mitglied entfernen', () => {
    expect(gruppenAenderungFehler(chris, ground, ['u-patrick'], ground.adminIds)).toBe('selbstEntfernt')
  })

  it('ein Gruppenadmin kann sich nicht selbst die Adminrechte nehmen — auch nicht, wenn ein zweiter Admin bleibt', () => {
    const zwei = { ...ground, adminIds: ['u-christian', 'u-patrick'] }
    expect(gruppenAenderungFehler(chris, zwei, zwei.memberIds, ['u-patrick'])).toBe('selbstEntfernt')
  })

  it('andere entfernen und ernennen geht', () => {
    expect(gruppenAenderungFehler(chris, ground, ['u-christian'], ground.adminIds)).toBeNull()
    expect(gruppenAenderungFehler(chris, ground, ground.memberIds, ['u-christian', 'u-patrick'])).toBeNull()
  })

  it('der Superadmin darf, bekommt aber „ohneAdmin" gemeldet, wenn der letzte Admin geht', () => {
    expect(gruppenAenderungFehler(alex, ground, ['u-patrick'], ground.adminIds)).toBe('ohneAdmin')
    expect(gruppenAenderungFehler(alex, ground, ground.memberIds, [])).toBe('ohneAdmin')
    // Sich selbst herausnehmen ist fuer ihn kein Fehler: Er verwaltet jede Gruppe.
    const selbst = { memberIds: ['u-patrick', 'u-christian'], adminIds: ['u-patrick', 'u-christian'] }
    expect(gruppenAenderungFehler(alex, selbst, ['u-christian'], selbst.adminIds)).toBeNull()
  })

  it('eine Gruppe, die schon keinen Admin hatte, meldet nichts neu', () => {
    const verwaist = { memberIds: ['u-patrick'], adminIds: [] }
    expect(gruppenAenderungFehler(alex, verwaist, ['u-patrick', 'u-michael'], [])).toBeNull()
    // Ein Admin, der nicht (mehr) Mitglied ist, zaehlt nicht als Admin.
    expect(gruppenAenderungFehler(alex, { memberIds: ['u-patrick'], adminIds: ['weg'] }, ['u-patrick'], [])).toBeNull()
  })

  it('ohne angemeldete Person gilt nur die Admin-Regel', () => {
    expect(gruppenAenderungFehler(null, ground, ['u-patrick'], ground.adminIds)).toBe('ohneAdmin')
  })
})

describe('adminKandidaten', () => {
  it('nur aktive Mitglieder sind Kandidaten', () => {
    const users = [
      { id: 'u-patrick', active: true },
      { id: 'u-christian', active: true },
      { id: 'u-max', active: true }, // kein Mitglied
      { id: 'u-alt', active: false }, // Mitglied, aber deaktiviert
    ]
    const g = { memberIds: ['u-patrick', 'u-christian', 'u-alt'] }
    expect(adminKandidaten(g, users).map((u) => u.id)).toEqual(['u-patrick', 'u-christian'])
  })
})

describe('mayAccessGroup — verlegt aus store.tsx (Audit 11/2026, KERN-19)', () => {
  const u = (id: string, role: Role, aircraftTypes: string[]): User => ({
    id, name: id, email: `${id}@example.test`, phone: '', role, canEditDirectory: false, canGrade: false, isTrainee: false, aircraftTypes, active: true,
  })
  const cl30: Group = { id: 'g', name: 'CL30', purpose: '', aircraftType: 'CL30', adminIds: ['admin'], memberIds: ['drin', 'admin', 'c560'], retention: null, muted: false }

  it('Mitglied und Admin im eigenen Muster: ja', () => {
    expect(mayAccessGroup(u('drin', 'member', ['CL30']), cl30)).toBe(true)
    expect(mayAccessGroup(u('admin', 'group_admin', ['CL30']), cl30)).toBe(true)
  })

  it('Mitglied fremden Musters: nein — die Mitgliedschaft allein oeffnet nichts', () => {
    expect(mayAccessGroup(u('c560', 'member', ['C560 XLS+']), cl30)).toBe(false)
  })

  it('Superadmin auch ohne Mitgliedschaft, Nichtmitglied nicht, niemand ohne Anmeldung', () => {
    expect(mayAccessGroup(u('super', 'superadmin', []), cl30)).toBe(true)
    expect(mayAccessGroup(u('aussen', 'member', ['CL30']), cl30)).toBe(false)
    expect(mayAccessGroup(null, cl30)).toBe(false)
  })

  it('Gruppe ohne Muster: fuer jedes Mitglied', () => {
    expect(mayAccessGroup(u('c560', 'member', ['C560 XLS+']), { ...cl30, aircraftType: '' })).toBe(true)
  })
})
