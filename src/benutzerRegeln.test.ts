import { describe, expect, it } from 'vitest'
import { einzelAenderung, type GruppenKontext } from './benutzerRegeln'
import type { Role, Settings, User } from './types'

/**
 * Aenderungen an einem einzelnen Nutzer (Audit 11/2026, VERW-01 und VERW-10).
 *
 * - VERW-01: Der Superadmin stufte sich mit einem Klick selbst zum Mitglied
 *   herab und stand vor „kein Zugriff". Die Datenbank verbietet das
 *   (profiles_guard, IC-SELF) — auch dann, wenn ein zweiter aktiver
 *   Superadmin es wieder richten koennte.
 * - VERW-10: Der Store liess Verbotenes still fallen. Jetzt nennt dieselbe
 *   Funktion, die den Patch beschneidet, auch den Grund.
 */

const nutzer = (id: string, role: Role, p: Partial<User> = {}): User => ({
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

const alex = nutzer('alex', 'superadmin', { aircraftTypes: [] })
const chris = nutzer('chris', 'superadmin')
const mika = nutzer('mika', 'member', { aircraftTypes: ['C560 XLS+'] })
const sam = nutzer('sam', 'training_admin', { aircraftTypes: [] })

describe('Die eigene Rolle bleibt (IC-SELF, profiles_guard)', () => {
  it('auch wenn ein zweiter aktiver Superadmin existiert', () => {
    const erg = einzelAenderung([alex, chris, mika], alex, { role: 'member' }, 'alex')
    expect(erg.patch).toEqual({})
    expect(erg.abgelehnt).toEqual(['selbstRolle'])
  })

  it('eine fremde Rolle ist aenderbar', () => {
    const erg = einzelAenderung([alex, chris, mika], chris, { role: 'group_admin' }, 'alex')
    expect(erg.patch).toEqual({ role: 'group_admin' })
    expect(erg.abgelehnt).toEqual([])
  })

  it('dieselbe Rolle noch einmal ist keine Aenderung und lehnt nichts ab', () => {
    expect(einzelAenderung([alex], alex, { role: 'superadmin' }, 'alex')).toEqual({ patch: {}, abgelehnt: [], gruppeFehlt: false })
  })
})

describe('Je Ablehnungsgrund ein Fall', () => {
  it('selbstDeaktivieren: das eigene Konto bleibt aktiv', () => {
    const erg = einzelAenderung([alex, chris], alex, { active: false }, 'alex')
    expect(erg.patch).toEqual({})
    expect(erg.abgelehnt).toEqual(['selbstDeaktivieren'])
  })

  it('letzterSuperadmin: weder herabstufen noch deaktivieren', () => {
    const allein = [alex, mika]
    expect(einzelAenderung(allein, alex, { role: 'member' }, 'jemand').abgelehnt).toEqual(['letzterSuperadmin'])
    expect(einzelAenderung(allein, alex, { active: false }, 'jemand').abgelehnt).toEqual(['letzterSuperadmin'])
    // Ein inaktiver zweiter Superadmin zaehlt nicht.
    const mitInaktivem = [alex, { ...chris, active: false }]
    expect(einzelAenderung(mitInaktivem, alex, { active: false }, 'jemand').abgelehnt).toEqual(['letzterSuperadmin'])
  })

  it('letztesMuster: niemand wird blind geschaltet — weder per Muster noch per Rolle', () => {
    expect(einzelAenderung([alex, mika], mika, { aircraftTypes: [] }, 'alex')).toMatchObject({ patch: {}, abgelehnt: ['letztesMuster'] })
    // Superadmin ohne Muster herabgestuft: dieselbe Blindheit, anderer Weg.
    expect(einzelAenderung([alex, chris], alex, { role: 'member' }, 'chris')).toMatchObject({ patch: {}, abgelehnt: ['letztesMuster'] })
  })

  it('letzteGruppe: wer sein Muster verliert, verliert dessen Gruppen — nicht die letzte', () => {
    const kontext: GruppenKontext = {
      settings: {} as Settings,
      groups: [{ aircraftType: 'C560 XLS+', memberIds: ['mika'] }],
    }
    const mitZwei = { ...mika, aircraftTypes: ['C560 XLS+', 'CL30'] }
    const erg = einzelAenderung([alex, mitZwei], mitZwei, { aircraftTypes: ['CL30'] }, 'alex', kontext)
    expect(erg.patch).toEqual({})
    expect(erg.abgelehnt).toEqual(['letzteGruppe'])
    // Mit einer musteruebergreifenden Gruppe bleibt etwas erreichbar.
    const mitAllgemein: GruppenKontext = { ...kontext, groups: [...kontext.groups, { aircraftType: '', memberIds: ['mika'] }] }
    expect(einzelAenderung([alex, mitZwei], mitZwei, { aircraftTypes: ['CL30'] }, 'alex', mitAllgemein)).toEqual({
      patch: { aircraftTypes: ['CL30'] },
      abgelehnt: [],
      gruppeFehlt: false,
    })
  })

  it('mehrere Gruende zugleich: „ich selbst" zuerst', () => {
    const erg = einzelAenderung([alex, mika], alex, { role: 'member', active: false }, 'alex')
    expect(erg.abgelehnt).toEqual(['selbstRolle', 'selbstDeaktivieren'])
    expect(erg.patch).toEqual({})
  })
})

describe('Gueltige Aenderungen', () => {
  it('gehen ohne Ablehnung durch', () => {
    const erg = einzelAenderung([alex, chris, mika], mika, { active: false, isTrainee: true, aircraftTypes: ['CL30'] }, 'alex')
    expect(erg).toEqual({ patch: { active: false, isTrainee: true, aircraftTypes: ['CL30'] }, abgelehnt: [], gruppeFehlt: false })
  })

  it('ein Superadmin darf gehen, solange ein zweiter aktiv bleibt', () => {
    expect(einzelAenderung([alex, chris], chris, { active: false }, 'alex').abgelehnt).toEqual([])
  })

  it('Training Admin → Mitglied ohne Gruppe: erlaubt, aber benannt (sonst Sackgasse)', () => {
    // Der Training Admin hat keinen Chat und kann keiner Gruppe angehoeren —
    // die Herabstufung zu verbieten, liesse sich nie aufloesen.
    const kontext: GruppenKontext = { settings: {} as Settings, groups: [{ aircraftType: '', memberIds: [] }] }
    const mitMuster = { ...sam, aircraftTypes: ['CL30'] }
    const erg = einzelAenderung([alex, mitMuster], mitMuster, { role: 'member' }, 'alex', kontext)
    expect(erg.patch).toEqual({ role: 'member' })
    expect(erg.abgelehnt).toEqual([])
    expect(erg.gruppeFehlt).toBe(true)
  })

  it('ein Altkonto ohne erreichbare Gruppe bleibt aenderbar', () => {
    const kontext: GruppenKontext = { settings: {} as Settings, groups: [] }
    const erg = einzelAenderung([alex, mika], mika, { isTrainee: true }, 'alex', kontext)
    expect(erg.patch).toEqual({ isTrainee: true })
    expect(erg.abgelehnt).toEqual([])
    expect(erg.gruppeFehlt).toBe(true)
  })
})
