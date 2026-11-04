import { describe, expect, it } from 'vitest'
import { darf, docCheckBereinigt, docCheckMoeglich, docCheckRolle, kachelZahl, rechteErlaubt, RECHECK_JE_AUFRUF, RECHECK_STATUS, recheckAudit, recheckEintraege, rechteAudit, rechteSetzen, rollenAudit } from './access'
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
    expect(docCheckRolle(nutzer('group_admin', { d: true }))).toBe('keine')
  })

  it('Zugang → Nutzer, Zugang + Admin → Admin — bei Gruppen- und Training-Admin', () => {
    expect(docCheckRolle(nutzer('group_admin', { a: true }))).toBe('nutzer')
    expect(docCheckRolle(nutzer('group_admin', { a: true, d: true }))).toBe('admin')
    expect(docCheckRolle(nutzer('training_admin', { a: true }))).toBe('nutzer')
    expect(docCheckRolle(nutzer('training_admin', { a: true, d: true }))).toBe('admin')
  })

  it('deaktivierte Konten und fehlende Nutzer haben keine Rolle', () => {
    expect(docCheckRolle(nutzer('superadmin', {}, false))).toBe('keine')
    expect(docCheckRolle(null)).toBe('keine')
    expect(docCheckRolle(undefined)).toBe('keine')
  })
})

/**
 * Entscheidung vom 04.11.2026: DocCheck nur für Admin-Rollen. Vorher hatte
 * in der Sandbox ein Instruktor (Mika, Mitglied) Zugang zu vertraulichen
 * Herstellerunterlagen, und ein zum Mitglied herabgestufter Admin behielt
 * ihn still. Dieselbe Regel steht in der Datenbank (rls.test.ts).
 */
describe('DocCheck nur für Admin-Rollen (Entscheidung vom 04.11.2026)', () => {
  it('jede Rolle außer Mitglied kann Zugang bekommen', () => {
    expect((['superadmin', 'group_admin', 'training_admin', 'member'] as const).map(docCheckMoeglich)).toEqual([true, true, true, false])
  })

  it('beim Mitglied wirkt kein Schalter — auch kein gespeicherter aus einem alten Stand', () => {
    expect(docCheckRolle(nutzer('member', { a: true }))).toBe('keine')
    expect(docCheckRolle(nutzer('member', { a: true, d: true }))).toBe('keine')
  })

  it('Vergeben an ein Mitglied wird abgelehnt, Entfernen geht immer', () => {
    expect(rechteErlaubt('member', { docCheckAccess: true, docCheckAdmin: false })).toBe(false)
    expect(rechteErlaubt('member', { docCheckAccess: true, docCheckAdmin: true })).toBe(false)
    expect(rechteErlaubt('member', { docCheckAccess: false, docCheckAdmin: false })).toBe(true)
    expect(rechteErlaubt('group_admin', { docCheckAccess: true, docCheckAdmin: true })).toBe(true)
    expect(rechteErlaubt('training_admin', { docCheckAccess: true, docCheckAdmin: false })).toBe(true)
  })

  it('bereinigt nimmt dem Mitglied die Schalter — sonst gaebe die naechste Befoerderung den Zugang still zurueck', () => {
    const mika = { id: 'u-michael', role: 'member' as const, active: true, docCheckAccess: true, docCheckAdmin: true }
    const neu = docCheckBereinigt(mika)
    expect(neu).toEqual({ ...mika, docCheckAccess: false, docCheckAdmin: false })
    expect(mika.docCheckAccess).toBe(true) // das Original bleibt unberuehrt
    expect(docCheckRolle({ ...neu, role: 'group_admin' })).toBe('keine')
  })

  it('bereinigt laesst alles andere als DASSELBE Objekt stehen (migrateState meldet sonst bei jedem Start eine Aenderung)', () => {
    const ohne = { role: 'member' as const, active: true }
    const leer = { role: 'member' as const, active: true, docCheckAccess: false, docCheckAdmin: false }
    const chris = { role: 'group_admin' as const, active: true, docCheckAccess: true, docCheckAdmin: true }
    const sam = { role: 'training_admin' as const, active: true, docCheckAccess: true }
    for (const u of [ohne, leer, chris, sam]) expect(docCheckBereinigt(u)).toBe(u)
    // Auch ein Admin-Schalter ohne Zugang zaehlt beim Mitglied als Rest
    expect(docCheckBereinigt({ role: 'member' as const, docCheckAdmin: true })).toEqual({ role: 'member', docCheckAccess: false, docCheckAdmin: false })
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
    // Gruppenadmin → Mitglied nimmt DocCheck (Entscheidung vom 04.11.2026).
    // Hier stand vorher die Zusage „kein Ereignis, DocCheck haengt an den
    // Schaltern, nicht an der Rolle" — sie ist mit Absicht aufgegeben.
    expect(rollenAudit(chris, { ...chris, role: 'member' }, ctx).map((e) => e.wert)).toEqual(['admin → keine'])
    expect(rollenAudit(chris, { ...chris, active: false }, ctx).map((e) => e.wert)).toEqual(['admin → keine'])
    expect(rollenAudit({ ...chris, active: false }, chris, ctx).map((e) => e.wert)).toEqual(['keine → admin'])
  })

  it('ein Wechsel ohne DocCheck-Wirkung erzeugt keine Zeile', () => {
    // Ohne Zugang aendern Befoerdern, Herabstufen und Deaktivieren nichts:
    // „keine" bleibt „keine". Zugang gibt erst set_rights, mit eigener Zeile.
    const mika = { role: 'member' as const, active: true }
    expect(rollenAudit(mika, { ...mika, role: 'group_admin' }, ctx)).toEqual([])
    const sam = { role: 'training_admin' as const, active: true }
    expect(rollenAudit(sam, { ...sam, active: false }, ctx)).toEqual([])
    expect(rollenAudit(sam, { ...sam, role: 'member' }, ctx)).toEqual([])
  })

  it('ein neues Konto zaehlt von „keine" aus', () => {
    expect(rollenAudit(null, { role: 'superadmin', active: true }, ctx).map((e) => e.wert)).toEqual(['keine → superadmin'])
    expect(rollenAudit(null, { role: 'member', active: true }, ctx)).toEqual([])
  })
})

describe('recheckAudit — Nummer und Status, nie Befundtext (wie doccheck.log_recheck, Audit 11/2026, SEC-06)', () => {
  let n = 0
  const ctx = { von: 'u-p', at: 1000, id: () => `r${n++}` }

  it('Text in der Nummernspalte wird zur Zeile der Liste; eine echte Nummer bleibt', () => {
    // Nachgestellt wie beim Prüfer: Die Spalte „No." trug Befundtext
    const z = recheckAudit('id-text.csv', [{ ref: 'CONFIDENTIAL OEM remark about TOTAL 16:00 in module overview', zeile: 2, status: 'Not verifiable' }, { ref: 'F-001', zeile: 3, status: 'Resolved' }], ctx)
    expect(z).toEqual([{ id: expect.any(String), at: 1000, von: 'u-p', aktion: 'recheckBestaetigt', ziel: 'id-text.csv', wert: '#2: Not verifiable, F-001: Resolved' }])
  })

  it('dieselbe Regel wie die Datenbank: Zeichen, Länge, Status aus fester Liste', () => {
    const e = (ref: string, zeile = 7) => recheckEintraege([{ ref, zeile, status: 'Resolved' }])[0].ref
    expect(['12', 'A-3', 'F_01.2', 'TM/4#2', 'x'.repeat(20)].map((r) => e(r))).toEqual(['12', 'A-3', 'F_01.2', 'TM/4#2', 'x'.repeat(20)])
    // Leerzeichen, Umlaut, zu lang, leer, Zeilenumbruch: Zeile statt Nummer
    expect(['F 001', 'Ä1', 'x'.repeat(21), '', 'F-001\n'].map((r) => e(r))).toEqual(['#7', '#7', '#7', '#7', '#7'])
    // Keine sinnvolle Zeile: „#0", nie „#NaN" (das sähe aus wie eine Nummer)
    expect(e('F 001', Number.NaN)).toBe('#0')
    expect(e('F 001', -3)).toBe('#0')
    // Status außerhalb der Liste fällt weg — ohne gültigen Eintrag keine Zeile
    expect(recheckEintraege([{ ref: '1', zeile: 2, status: 'Erledigt laut Chef' }])).toEqual([])
    expect(recheckAudit('fl.xlsx', [{ ref: '1', zeile: 2, status: 'Erledigt laut Chef' }], ctx)).toEqual([])
    expect(RECHECK_STATUS.every((st) => recheckEintraege([{ ref: '1', zeile: 2, status: st }]).length === 1)).toBe(true)
  })

  it('höchstens 500 Einträge je Zeile — mehr werden mehrere Zeilen, keiner geht verloren', () => {
    const viele = Array.from({ length: RECHECK_JE_AUFRUF + 1 }, (_, i) => ({ ref: String(i + 1), zeile: i + 2, status: 'Resolved' }))
    const z = recheckAudit('fl.xlsx', viele, ctx)
    expect(z).toHaveLength(2)
    expect(z[1].wert).toBe('501: Resolved')
    // Wert höchstens 2000 Zeichen, Listenname ohne Steuerzeichen und höchstens 200 — wie left()/regexp_replace in der Migration
    expect(z[0].wert).toHaveLength(2000)
    expect(recheckAudit('fl\u0007\u009f.xlsx', [viele[0]], ctx)[0].ziel).toBe('fl.xlsx')
    expect([...recheckAudit(`${'ä'.repeat(250)}.xlsx`, [viele[0]], ctx)[0].ziel]).toHaveLength(200)
    expect(new Set(z.map((x) => x.id)).size).toBe(2)
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
