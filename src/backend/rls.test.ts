import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { AKTIONEN, darf, docCheckRolle } from '../modules/doccheck/access'
import type { Role, User } from '../types'
import { zuAenderung, zuNutzer, type ProfilZeile } from './profil'

/**
 * Rollentest der Datenbank (Phase 1b, Etappe 1) gegen ECHTES Postgres
 * (PGlite, Postgres als WebAssembly) — läuft in `npm test` und in der CI
 * ohne Docker. Geprüft wird, was die Datenbank durchsetzt, nicht, was die
 * Oberfläche zeigt: Die Oberfläche ist Bedienkomfort, RLS ist die Grenze.
 *
 * Die Migrationen werden so geladen, wie sie später in Supabase laufen;
 * nur das, was Supabase mitbringt (auth.users, auth.uid(), Rollen), kommt
 * aus supabase/tests/auth_stub.sql.
 */

const wurzel = fileURLToPath(new URL('../../supabase/', import.meta.url))
const migrationen = readdirSync(`${wurzel}migrations`).filter((f) => f.endsWith('.sql')).sort()

const ID = {
  super: '00000000-0000-0000-0000-000000000001',
  super2: '00000000-0000-0000-0000-000000000002',
  admin: '00000000-0000-0000-0000-000000000003', // Mitglied mit DocCheck admin
  nutzer: '00000000-0000-0000-0000-000000000004', // Mitglied mit DocCheck access
  ohne: '00000000-0000-0000-0000-000000000005', // Mitglied ohne DocCheck
  inaktiv: '00000000-0000-0000-0000-000000000006', // deaktiviert, hatte DocCheck
  gruppe: '00000000-0000-0000-0000-000000000007', // group_admin ohne DocCheck
}

let db: PGlite

/** Als Dienst (Migration, Einladung) — ohne Nutzer, RLS umgangen. */
async function alsDienst() {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
}

/** Als angemeldeter Nutzer — genau wie eine Anfrage mit JWT bei Supabase. */
async function als(id: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`)
}

async function fehler(sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, params)
    return ''
  } catch (e) {
    return (e as Error).message
  }
}

async function einladen(id: string, email: string, x: { role?: Role; active?: boolean; access?: boolean; admin?: boolean } = {}) {
  await alsDienst()
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
  await db.query('update public.profiles set role = $2, active = $3, doccheck_access = $4, doccheck_admin = $5 where id = $1', [id, x.role ?? 'member', x.active ?? true, x.access ?? false, x.admin ?? false])
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(readFileSync(`${wurzel}tests/auth_stub.sql`, 'utf8'))
  for (const m of migrationen) await db.exec(readFileSync(`${wurzel}migrations/${m}`, 'utf8'))
  await einladen(ID.super, 'alex@example.test', { role: 'superadmin' })
  await einladen(ID.admin, 'chris@example.test', { access: true, admin: true })
  await einladen(ID.nutzer, 'mika@example.test', { access: true })
  await einladen(ID.ohne, 'sam@example.test')
  await einladen(ID.inaktiv, 'alt@example.test', { active: false, access: true })
  await einladen(ID.gruppe, 'gruppe@example.test', { role: 'group_admin' })
})

describe('Rollentest: Matrix der Datenbank = Matrix in access.ts (Spez. 5.1)', () => {
  it('jede Aktion mit jeder Rolle', async () => {
    await alsDienst()
    const profile = (await db.query<{ id: string; role: Role; active: boolean; doccheck_access: boolean; doccheck_admin: boolean }>('select id, role, active, doccheck_access, doccheck_admin from public.profiles')).rows
    const abweichungen: string[] = []
    for (const p of profile) {
      const rolle = docCheckRolle({ role: p.role, active: p.active, docCheckAccess: p.doccheck_access, docCheckAdmin: p.doccheck_admin })
      await als(p.id)
      const sqlRolle = (await db.query<{ r: string }>('select doccheck.role() as r')).rows[0].r
      if (sqlRolle !== rolle) abweichungen.push(`${p.id}: Rolle ${sqlRolle} ≠ ${rolle}`)
      for (const a of AKTIONEN) {
        const sql = (await db.query<{ ok: boolean }>('select doccheck.can($1) as ok', [a])).rows[0].ok
        if (sql !== darf(rolle, a)) abweichungen.push(`${rolle} / ${a}: Datenbank ${sql}, access.ts ${darf(rolle, a)}`)
      }
    }
    expect(abweichungen).toEqual([])
    // Alle Rollen kamen vor — sonst prüfte der Test weniger, als er behauptet
    expect(profile.map((p) => docCheckRolle({ role: p.role, active: p.active, docCheckAccess: p.doccheck_access, docCheckAdmin: p.doccheck_admin })).sort()).toEqual(['admin', 'keine', 'keine', 'keine', 'nutzer', 'superadmin'])
  })

  it('die Tabelle enthält genau die Aktionen der Matrix', async () => {
    await alsDienst()
    const aktionen = (await db.query<{ action: string }>('select distinct action from doccheck.permissions order by 1')).rows.map((r) => r.action)
    expect(aktionen).toEqual([...AKTIONEN].sort())
  })
})

describe('Profile', () => {
  it('Aktive sehen Aktive; nur der Superadmin sieht Deaktivierte; Deaktivierte sehen nichts', async () => {
    const sicht = async (id: string) => {
      await als(id)
      return (await db.query<{ email: string }>('select email from public.profiles order by email')).rows.map((r) => r.email)
    }
    expect(await sicht(ID.ohne)).not.toContain('alt@example.test')
    expect(await sicht(ID.ohne)).toHaveLength(5)
    expect(await sicht(ID.super)).toContain('alt@example.test')
    expect(await sicht(ID.inaktiv)).toEqual([])
  })

  it('eigene Kontaktdaten ja; eigene Rolle, Muster, Rechte nein', async () => {
    await als(ID.ohne)
    await db.query("update public.profiles set name = 'Sam', phone = '+43' where id = $1", [ID.ohne])
    expect(await fehler("update public.profiles set role = 'superadmin' where id = $1", [ID.ohne])).toContain('IC-RIGHTS')
    expect(await fehler("update public.profiles set aircraft_types = '{C560}' where id = $1", [ID.ohne])).toContain('IC-RIGHTS')
    // Fremde Zeilen: keine Policy → nichts geändert
    const r = await db.query("update public.profiles set name = 'X' where id = $1", [ID.nutzer])
    expect(r.affectedRows).toBe(0)
    await alsDienst()
    expect((await db.query<{ name: string }>('select name from public.profiles where id = $1', [ID.ohne])).rows[0].name).toBe('Sam')
  })

  it('DocCheck-Rechte nie per UPDATE — auch nicht vom Superadmin', async () => {
    await als(ID.super)
    expect(await fehler('update public.profiles set doccheck_access = true where id = $1', [ID.ohne])).toMatch(/permission denied/)
    await als(ID.ohne)
    expect(await fehler('update public.profiles set doccheck_admin = true where id = $1', [ID.ohne])).toMatch(/permission denied/)
  })

  it('Superadmin pflegt Nutzer, ändert aber nicht die eigene Rolle; der letzte Superadmin bleibt', async () => {
    await als(ID.super)
    await db.query("update public.profiles set aircraft_types = '{C560}', can_grade = true where id = $1", [ID.ohne])
    expect(await fehler("update public.profiles set role = 'member' where id = $1", [ID.super])).toContain('IC-SELF')
    expect(await fehler('update public.profiles set active = false where id = $1', [ID.super])).toContain('IC-SELF')
    // Auch außerhalb einer Nutzersitzung: der letzte aktive Superadmin bleibt
    await alsDienst()
    expect(await fehler("update public.profiles set role = 'member' where id = $1", [ID.super])).toContain('IC-LAST-SUPERADMIN')
    // Mit einem zweiten Superadmin geht es
    await einladen(ID.super2, 'zweit@example.test', { role: 'superadmin' })
    await als(ID.super2)
    await db.query("update public.profiles set role = 'group_admin' where id = $1", [ID.super])
    // Herabgestuft: fremde Zeilen sind per RLS schlicht nicht änderbar (0 Zeilen, kein Fehler)
    await als(ID.super)
    expect((await db.query("update public.profiles set role = 'member' where id = $1", [ID.super2])).affectedRows).toBe(0)
    // zurück für die übrigen Tests
    await alsDienst()
    await db.query("update public.profiles set role = 'superadmin' where id = $1", [ID.super])
    await db.query('delete from auth.users where id = $1', [ID.super2])
  })

  it('Einladung legt ein Profil mit minimalen Rechten an', async () => {
    await alsDienst()
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000009', 'neu@example.test', '{"name":"Neu"}')`)
    const p = (await db.query('select name, role, active, doccheck_access from public.profiles where email = $1', ['neu@example.test'])).rows[0]
    expect(p).toEqual({ name: 'Neu', role: 'member', active: true, doccheck_access: false })
    await db.query("delete from auth.users where email = 'neu@example.test'")
  })
})

describe('DocCheck', () => {
  it('Rechte setzen: nur Superadmin; admin setzt access voraus; Audit je tatsächlicher Änderung; Superadmin bleibt unberührt', async () => {
    await als(ID.admin)
    expect(await fehler('select doccheck.set_rights($1, true, false)', [ID.ohne])).toContain('IC-RIGHTS')
    await als(ID.super)
    await db.query('select doccheck.set_rights($1, false, true)', [ID.ohne])
    await db.query('select doccheck.set_rights($1, true, true)', [ID.ohne]) // keine Änderung → kein Audit
    await db.query('select doccheck.set_rights($1, false, false)', [ID.super])
    expect(await fehler('select doccheck.set_rights($1, true, false)', ['00000000-0000-0000-0000-0000000000ff'])).toContain('IC-NOT-FOUND')
    const audit = (await db.query<{ action: string; target: string; value: string; actor: string }>("select action, target, value, actor from doccheck.audit where action in ('zugang','admin') order by id")).rows
    expect(audit).toEqual([
      { action: 'zugang', target: ID.ohne, value: 'false → true', actor: ID.super },
      { action: 'admin', target: ID.ohne, value: 'false → true', actor: ID.super },
    ])
    await alsDienst()
    expect((await db.query('select doccheck_access, doccheck_admin from public.profiles where id = $1', [ID.super])).rows[0]).toEqual({ doccheck_access: false, doccheck_admin: false })
    // zurücksetzen
    await als(ID.super)
    await db.query('select doccheck.set_rights($1, false, false)', [ID.ohne])
  })

  it('Audit-Log: nur Superadmin liest; niemand schreibt direkt', async () => {
    await als(ID.admin)
    expect((await db.query('select * from doccheck.audit')).rows).toEqual([])
    expect(await fehler("insert into doccheck.audit (actor, action, target, value) values ($1, 'feature', 'x', 'y')", [ID.admin])).toMatch(/permission denied/)
    await als(ID.super)
    expect((await db.query('select * from doccheck.audit')).rows.length).toBeGreaterThan(0)
  })

  it('Einstellungen: lesen mit Zugang, ändern nur Superadmin — mit Audit je Schalter und Schlüssel', async () => {
    await als(ID.ohne)
    expect((await db.query('select data from doccheck.settings')).rows).toEqual([])
    await als(ID.nutzer)
    expect((await db.query('select data from doccheck.settings')).rows).toHaveLength(1)
    expect((await db.query(`update doccheck.settings set data = '{"x":1}'`)).affectedRows).toBe(0)
    expect(await fehler(`select doccheck.update_settings('{"gateSperrt":true}')`)).toContain('IC-RIGHTS')
    await als(ID.super)
    await db.query(`select doccheck.update_settings('{"gateSperrt":true,"features":{"recheck":true}}')`)
    await db.query(`select doccheck.update_settings('{"features":{"chat":false}}')`)
    const d = (await db.query<{ data: Record<string, unknown> }>('select data from doccheck.settings')).rows[0].data
    expect(d).toEqual({ gateSperrt: true, features: { recheck: true, chat: false } })
    const a = (await db.query<{ action: string; target: string; value: string }>("select action, target, value from doccheck.audit where action in ('feature','einstellung') order by id")).rows
    expect(a).toEqual([
      { action: 'feature', target: 'recheck', value: 'default → true' },
      { action: 'einstellung', target: 'gateSperrt', value: 'null → true' },
      { action: 'feature', target: 'chat', value: 'default → false' },
    ])
  })

  it('Bibliothek: lesen alle mit Zugang, pflegen Admin, endgültig löschen nur Superadmin; Stand bestätigen mit Audit', async () => {
    await als(ID.nutzer)
    expect(await fehler("insert into doccheck.documents (doc_type, title, revision) values ('AFM', 'X', '1')")).toMatch(/row-level security/)
    await als(ID.admin)
    const id = (await db.query<{ id: string }>("insert into doccheck.documents (doc_type, title, revision) values ('AFM', 'SBX AFM', 'Rev 12') returning id")).rows[0].id
    await als(ID.nutzer)
    expect((await db.query('select title from doccheck.documents')).rows).toEqual([{ title: 'SBX AFM' }])
    expect(await fehler('select doccheck.confirm_revision($1)', [id])).toContain('IC-RIGHTS')
    await als(ID.ohne)
    expect((await db.query('select title from doccheck.documents')).rows).toEqual([])
    await als(ID.admin)
    await db.query('select doccheck.confirm_revision($1)', [id])
    expect(await fehler('select doccheck.confirm_revision($1)', ['00000000-0000-0000-0000-0000000000ff'])).toContain('IC-NOT-FOUND')
    expect((await db.query('delete from doccheck.documents where id = $1', [id])).affectedRows).toBe(0)
    await als(ID.super)
    expect((await db.query<{ action: string }>("select action from doccheck.audit where action = 'standBestaetigt'")).rows).toHaveLength(1)
    expect((await db.query('delete from doccheck.documents where id = $1', [id])).affectedRows).toBe(1)
  })

  it('Re-Check bestätigen: wer prüfen darf; Text gekürzt; Deaktivierte nicht', async () => {
    await als(ID.ohne)
    expect(await fehler("select doccheck.log_recheck('fl.xlsx', '1: Resolved')")).toContain('IC-RIGHTS')
    await als(ID.inaktiv)
    expect(await fehler("select doccheck.log_recheck('fl.xlsx', '1: Resolved')")).toContain('IC-RIGHTS')
    await als(ID.nutzer)
    await db.query('select doccheck.log_recheck($1, $2)', ['fl.xlsx', 'x'.repeat(400)])
    await als(ID.super)
    const r = (await db.query<{ actor: string; value: string }>("select actor, value from doccheck.audit where action = 'recheckBestaetigt'")).rows[0]
    expect([r.actor, r.value.length]).toEqual([ID.nutzer, 300])
  })
})

describe('Zuordnung der App passt zur Migration', () => {
  it('jede Spalte aus zuAenderung ist für den Superadmin änderbar; zuNutzer liest echte Zeilen', async () => {
    const alles: Partial<User> = { name: 'Max', phone: '+43 1', email: 'max@example.test', role: 'training_admin', active: true, aircraftTypes: ['C560', 'CL30'], canGrade: true, isTrainee: true, canEditDirectory: true, chatBlocked: true, docCheckAccess: true, docCheckAdmin: true }
    const patch = zuAenderung(alles)
    const spalten = Object.keys(patch)
    await als(ID.super)
    const r = await db.query(`update public.profiles set ${spalten.map((s, i) => `${s} = $${i + 2}`).join(', ')} where id = $1`, [ID.gruppe, ...Object.values(patch)])
    expect(r.affectedRows).toBe(1)
    const z = (await db.query<ProfilZeile>('select * from public.profiles where id = $1', [ID.gruppe])).rows[0]
    // DocCheck-Rechte kamen NICHT über das UPDATE
    expect(zuNutzer(z)).toMatchObject({ ...alles, docCheckAccess: false, docCheckAdmin: false })
  })
})

