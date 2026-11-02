import { describe, expect, it } from 'vitest'
import { darf, docCheckRolle, kachelZahl, rechteAudit, rechteSetzen, rollenAudit } from './access'
import type { DocCheckAktion, DocCheckRolle } from './types'

const nutzer = (role: 'superadmin' | 'group_admin' | 'training_admin' | 'member', flags: { a?: boolean; d?: boolean } = {}, active = true) => ({
  role,
  active,
  docCheckAccess: flags.a,
  docCheckAdmin: flags.d,
})

describe('docCheckRolle', () => {
  it('Superadmin ist automatisch DocCheck-Superadmin, ohne Schalter (Spez. 3.4)', () => {
    expect(docCheckRolle(nutzer('superadmin'))).toBe('superadmin')
  })

  it('ohne Zugang keine Rolle — auch nicht für Gruppen- oder Training-Admin', () => {
    expect(docCheckRolle(nutzer('group_admin'))).toBe('keine')
    expect(docCheckRolle(nutzer('training_admin'))).toBe('keine')
    expect(docCheckRolle(nutzer('member'))).toBe('keine')
  })

  it('Admin-Schalter ohne Zugang wirkt nicht', () => {
    expect(docCheckRolle(nutzer('member', { d: true }))).toBe('keine')
  })

  it('Zugang → Nutzer, Zugang + Admin → Admin', () => {
    expect(docCheckRolle(nutzer('member', { a: true }))).toBe('nutzer')
    expect(docCheckRolle(nutzer('member', { a: true, d: true }))).toBe('admin')
  })

  it('deaktivierte Konten und fehlende Nutzer haben keine Rolle', () => {
    expect(docCheckRolle(nutzer('superadmin', {}, false))).toBe('keine')
    expect(docCheckRolle(null)).toBe('keine')
    expect(docCheckRolle(undefined)).toBe('keine')
  })
})

describe('Rechte-Matrix (Spez. Kap. 5.1)', () => {
  // Die erwartete Tabelle steht hier noch einmal ausgeschrieben, NICHT aus
  // access.ts abgeleitet: Wer dort eine Zeile ändert, muss hier sehen, welche
  // Zusage der Spezifikation er gerade aufgibt.
  const SOLL: Record<DocCheckAktion, [nutzer: boolean, admin: boolean, superadmin: boolean]> = {
    kachel: [true, true, true],
    bibliothekLesen: [true, true, true],
    pdfAnsehen: [true, true, true],
    pdfHerunterladen: [false, true, true],
    pruefen: [true, true, true],
    bibliothekPflegen: [false, true, true],
    endgueltigLoeschen: [false, false, true],
    erinnerungBestaetigen: [false, true, true],
    konfigurieren: [false, false, true],
    protokolleLesen: [false, false, true],
  }
  const rollen: DocCheckRolle[] = ['nutzer', 'admin', 'superadmin']

  for (const [aktion, werte] of Object.entries(SOLL) as [DocCheckAktion, boolean[]][]) {
    it(`${aktion}`, () => {
      expect(rollen.map((r) => darf(r, aktion))).toEqual(werte)
      // Wer keine Berechtigung hat, darf schlicht nichts.
      expect(darf('keine', aktion)).toBe(false)
    })
  }
})

describe('rechteSetzen — Admin setzt Zugang voraus', () => {
  it('Admin einschalten schaltet Zugang mit ein', () => {
    expect(rechteSetzen({}, { docCheckAdmin: true })).toEqual({ docCheckAccess: true, docCheckAdmin: true })
  })

  it('Zugang entziehen nimmt die Pflege mit', () => {
    expect(rechteSetzen({ docCheckAccess: true, docCheckAdmin: true }, { docCheckAccess: false })).toEqual({
      docCheckAccess: false,
      docCheckAdmin: false,
    })
  })

  it('Admin ausschalten lässt den Zugang stehen', () => {
    expect(rechteSetzen({ docCheckAccess: true, docCheckAdmin: true }, { docCheckAdmin: false })).toEqual({
      docCheckAccess: true,
      docCheckAdmin: false,
    })
  })

  it('leerer Wunsch übernimmt den Bestand und bereinigt einen Altfehler', () => {
    expect(rechteSetzen({ docCheckAccess: true }, {})).toEqual({ docCheckAccess: true, docCheckAdmin: false })
    expect(rechteSetzen({ docCheckAdmin: true }, {})).toEqual({ docCheckAccess: false, docCheckAdmin: false })
  })
})

describe('rechteAudit', () => {
  let n = 0
  const ctx = { von: 'u-super', ziel: 'u-x', at: 1000, id: () => `a${n++}` }

  it('protokolliert nur, was sich wirklich ändert', () => {
    expect(rechteAudit({ docCheckAccess: true }, { docCheckAccess: true, docCheckAdmin: false }, ctx)).toEqual([])
  })

  it('beide Schalter → zwei Zeilen mit vorher → nachher', () => {
    const z = rechteAudit({}, { docCheckAccess: true, docCheckAdmin: true }, ctx)
    expect(z.map((e) => [e.aktion, e.wert, e.von, e.ziel, e.at])).toEqual([
      ['zugang', 'false → true', 'u-super', 'u-x', 1000],
      ['admin', 'false → true', 'u-super', 'u-x', 1000],
    ])
    expect(new Set(z.map((e) => e.id)).size).toBe(2)
  })
})

/**
 * Rollen- und Statuswechsel mit DocCheck-Wirkung (Audit 11/2026, VERW-15).
 *
 * Nachgestellt: Chris (Gruppenadmin, DocCheck admin) zum Superadmin
 * gemacht, Alex zum Mitglied herabgestuft — das DocCheck-Protokoll blieb
 * leer. Spez. 3.4: Jede Änderung einer Berechtigung wird protokolliert.
 */
describe('rollenAudit', () => {
  let n = 0
  const ctx = { von: 'u-patrick', ziel: 'u-christian', at: 2000, id: () => `r${n++}` }
  const chris = { role: 'group_admin' as const, active: true, docCheckAccess: true, docCheckAdmin: true }

  it('group_admin → superadmin erzeugt die Zeile admin → superadmin', () => {
    const z = rollenAudit(chris, { ...chris, role: 'superadmin' }, ctx)
    expect(z.map((e) => [e.aktion, e.wert, e.von, e.ziel, e.at])).toEqual([['rolle', 'admin → superadmin', 'u-patrick', 'u-christian', 2000]])
  })

  it('Herabstufen und Deaktivieren erzeugen ihre Zeile', () => {
    const alex = { role: 'superadmin' as const, active: true }
    expect(rollenAudit(alex, { ...alex, role: 'member' }, ctx).map((e) => e.wert)).toEqual(['superadmin → keine'])
    expect(rollenAudit(chris, { ...chris, active: false }, ctx).map((e) => e.wert)).toEqual(['admin → keine'])
    expect(rollenAudit({ ...chris, active: false }, chris, ctx).map((e) => e.wert)).toEqual(['keine → admin'])
  })

  it('ein Wechsel ohne DocCheck-Wirkung erzeugt keine Zeile', () => {
    // Mitglied → Gruppenadmin: DocCheck haengt an den Schaltern, nicht an
    // dieser Rolle. Ohne Zugang bleibt deaktivieren ebenfalls „keine".
    expect(rollenAudit(chris, { ...chris, role: 'member' }, ctx)).toEqual([])
    const sam = { role: 'training_admin' as const, active: true }
    expect(rollenAudit(sam, { ...sam, active: false }, ctx)).toEqual([])
  })

  it('ein neues Konto zaehlt von „keine" aus', () => {
    expect(rollenAudit(null, { role: 'superadmin', active: true }, ctx).map((e) => e.wert)).toEqual(['keine → superadmin'])
    expect(rollenAudit(null, { role: 'member', active: true }, ctx)).toEqual([])
  })
})

describe('kachelZahl (Spez. 3.2)', () => {
  it('Nutzer sieht nur Nachprüf-Empfehlungen, keine Erinnerungen', () => {
    expect(kachelZahl('nutzer', 2, 5)).toBe(2)
  })

  it('Admin und Superadmin sehen zusätzlich fällige Erinnerungen', () => {
    expect(kachelZahl('admin', 2, 5)).toBe(7)
    expect(kachelZahl('superadmin', 0, 1)).toBe(1)
  })

  it('ohne Berechtigung keine Zahl', () => {
    expect(kachelZahl('keine', 3, 3)).toBe(0)
  })
})
