import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { AKTIONEN, darf, docCheckRolle, RECHECK_STATUS, recheckEintraege } from '../modules/doccheck/access'
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
  it('volle Profilzeile nur für sich selbst und den Superadmin; alle anderen über das Verzeichnis (Datenminimierung)', async () => {
    const sicht = async (id: string, quelle: string) => {
      await als(id)
      return (await db.query<{ email: string }>(`select email from ${quelle} order by email`)).rows.map((r) => r.email)
    }
    expect(await sicht(ID.ohne, 'public.profiles')).toEqual(['sam@example.test'])
    expect(await sicht(ID.super, 'public.profiles')).toContain('alt@example.test')
    expect(await sicht(ID.inaktiv, 'public.profiles')).toEqual([])
    // Verzeichnis: alle Aktiven, ohne Deaktivierte — und ohne Rechte-Spalten
    expect(await sicht(ID.ohne, 'public.directory')).toHaveLength(5)
    expect(await sicht(ID.ohne, 'public.directory')).not.toContain('alt@example.test')
    expect(await sicht(ID.inaktiv, 'public.directory')).toEqual([])
    await als(ID.ohne)
    expect(await fehler('select doccheck_access from public.directory')).toMatch(/does not exist/)
    // anon (nicht angemeldet) sieht nichts — trotz der Supabase-Standardrechte
    await db.exec(`reset role; set role anon;`)
    expect(await fehler('select * from public.profiles')).toMatch(/permission denied/)
    expect(await fehler('select * from public.directory')).toMatch(/permission denied/)
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

  it('DocCheck-Rechte und E-Mail nie per UPDATE — auch nicht vom Superadmin, auch nicht mit Supabase-Standardrechten', async () => {
    await als(ID.super)
    expect(await fehler('update public.profiles set doccheck_access = true where id = $1', [ID.ohne])).toMatch(/permission denied/)
    expect(await fehler("update public.profiles set email = 'x@y.test' where id = $1", [ID.ohne])).toMatch(/permission denied/)
    // Angriff aus der Sicherheitsprüfung: früher öffnete eine selbst gesetzte Sitzungseinstellung den Trigger
    await als(ID.ohne)
    await db.query("select set_config('doccheck.rights_call', 'on', false)")
    expect(await fehler('update public.profiles set doccheck_admin = true where id = $1', [ID.ohne])).toMatch(/permission denied/)
    // Zweite Absicherung: Selbst wenn jemand das Spaltenrecht versehentlich vergibt, hält der Trigger
    await alsDienst()
    await db.exec('grant update (doccheck_access, doccheck_admin) on public.profiles to authenticated')
    await als(ID.ohne)
    expect(await fehler('update public.profiles set doccheck_admin = true where id = $1', [ID.ohne])).toContain('IC-DOCCHECK')
    await alsDienst()
    await db.exec('revoke update (doccheck_access, doccheck_admin) on public.profiles from authenticated')
  })

  it('E-Mail kommt aus der Anmeldung', async () => {
    await alsDienst()
    await db.query("update auth.users set email = 'sam.neu@example.test' where id = $1", [ID.ohne])
    expect((await db.query('select email from public.profiles where id = $1', [ID.ohne])).rows[0]).toEqual({ email: 'sam.neu@example.test' })
    await db.query("update auth.users set email = 'sam@example.test' where id = $1", [ID.ohne])
  })

  it('Superadmin pflegt Nutzer, ändert aber nicht die eigene Rolle; der letzte Superadmin bleibt', async () => {
    await als(ID.super)
    await db.query("update public.profiles set aircraft_types = '{C560}', can_grade = true where id = $1", [ID.ohne])
    expect(await fehler("update public.profiles set role = 'member' where id = $1", [ID.super])).toContain('IC-SELF')
    expect(await fehler('update public.profiles set active = false where id = $1', [ID.super])).toContain('IC-SELF')
    // Auch außerhalb einer Nutzersitzung: der letzte aktive Superadmin bleibt
    await alsDienst()
    expect(await fehler("update public.profiles set role = 'member' where id = $1", [ID.super])).toContain('IC-LAST-SUPERADMIN')
    // Auch nicht durch Löschen des Kontos (Kaskade aus auth.users) — Sicherheitsprüfung 01.11.2026
    expect(await fehler('delete from auth.users where id = $1', [ID.super])).toContain('IC-LAST-SUPERADMIN')
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
    // Kein direktes UPDATE — auch der Superadmin nicht, sonst ginge es am Audit vorbei
    expect(await fehler(`update doccheck.settings set data = '{"x":1}'`)).toMatch(/permission denied/)
    expect(await fehler(`select doccheck.update_settings('{"gateSperrt":true}')`)).toContain('IC-RIGHTS')
    await als(ID.super)
    await db.query(`select doccheck.update_settings('{"gateSperrt":true,"features":{"recheck":true}}')`)
    await db.query(`select doccheck.update_settings('{"features":{"chat":false}}')`)
    expect(await fehler(`update doccheck.settings set data = '{}'`)).toMatch(/permission denied/)
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

  it('Re-Check bestätigen: wer prüfen darf; nur strukturierte Einträge, kein freier Text; Deaktivierte nicht', async () => {
    const eintraege = JSON.stringify([{ ref: '12', status: 'Resolved' }, { ref: 'A-3', status: 'Not resolved' }])
    await als(ID.ohne)
    expect(await fehler('select doccheck.log_recheck($1, $2)', ['fl.xlsx', eintraege])).toContain('IC-RIGHTS')
    await als(ID.inaktiv)
    expect(await fehler('select doccheck.log_recheck($1, $2)', ['fl.xlsx', eintraege])).toContain('IC-RIGHTS')
    await als(ID.nutzer)
    await db.query('select doccheck.log_recheck($1, $2)', ['fl\u0007.xlsx', eintraege])
    // Freier Text statt Nummer oder Status — abgewiesen (Sicherheitsprüfung: Audit ließ sich beliebig beschreiben)
    expect(await fehler('select doccheck.log_recheck($1, $2)', ['fl.xlsx', JSON.stringify([{ ref: 'Closed by Alex Beispiel (superadmin)', status: 'Resolved' }])])).toContain('IC-INPUT')
    expect(await fehler('select doccheck.log_recheck($1, $2)', ['fl.xlsx', JSON.stringify([{ ref: '1', status: 'Erledigt laut Chef' }])])).toContain('IC-INPUT')
    expect(await fehler('select doccheck.log_recheck($1, $2)', ['fl.xlsx', '[]'])).toContain('IC-INPUT')
    expect(await fehler('select doccheck.log_recheck($1, $2)', ['fl.xlsx', JSON.stringify(Array.from({ length: 501 }, (_, i) => ({ ref: String(i), status: 'Resolved' })))])).toContain('IC-INPUT')
    await als(ID.super)
    const r = (await db.query<{ actor: string; target: string; value: string }>("select actor, target, value from doccheck.audit where action = 'recheckBestaetigt'")).rows
    expect(r).toEqual([{ actor: ID.nutzer, target: 'fl.xlsx', value: '12: Resolved, A-3: Not resolved' }])
  })

  it('Sandbox und Datenbank wenden dieselbe Regel an: was recheckEintraege durchlässt, nimmt log_recheck an, was es ersetzt, weist es ab (Audit 11/2026, SEC-06)', async () => {
    // Als DocCheck-Admin: Die Mengenbegrenzung unten zählt die Zeilen des Nutzers
    await als(ID.admin)
    const refs = ['12', 'A-3', 'F_01.2', 'TM/4#2', 'x'.repeat(20), 'F 001', 'Ä1', 'x'.repeat(21), '', 'F-001\n', 'CONFIDENTIAL OEM remark about TOTAL 16:00']
    for (const ref of refs) {
      const [e] = recheckEintraege([{ ref, zeile: 5, status: 'Resolved' }])
      const roh = JSON.stringify([{ ref, status: 'Resolved' }])
      if (e.ref === ref) await db.query('select doccheck.log_recheck($1, $2)', ['fl.xlsx', roh])
      else expect(await fehler('select doccheck.log_recheck($1, $2)', ['fl.xlsx', roh])).toContain('IC-INPUT')
      // Der Ersatz selbst geht immer durch — mit Backend scheitert derselbe Klick nicht mehr an IC-INPUT
      await db.query('select doccheck.log_recheck($1, $2)', ['fl.xlsx', JSON.stringify([e])])
    }
    // Jeder Status der Sandbox-Liste wird angenommen
    await db.query('select doccheck.log_recheck($1, $2)', ['fl.xlsx', JSON.stringify(RECHECK_STATUS.map((status) => ({ ref: '1', status })))])
  })

  it('Mengenbegrenzung: höchstens 60 Audit-Zeilen je Minute und Nutzer', async () => {
    await als(ID.nutzer)
    const e = JSON.stringify([{ ref: '1', status: 'Resolved' }])
    for (let i = 0; i < 59; i++) await db.query('select doccheck.log_recheck($1, $2)', ['fl.xlsx', e])
    expect(await fehler('select doccheck.log_recheck($1, $2)', ['fl.xlsx', e])).toContain('IC-RATE')
  })

  it('Rollenwechsel mit DocCheck-Wirkung schreibt eine Audit-Zeile, mit dem Superadmin als Akteur (Audit 11/2026, VERW-15)', async () => {
    // Vorher: Chris zum Superadmin gemacht, Alex herabgestuft — das
    // DocCheck-Protokoll blieb leer. Die Schalter protokolliert set_rights;
    // Rolle und Status aendern die DocCheck-Rolle aber ebenso.
    await alsDienst()
    const ab = (await db.query<{ n: number }>('select coalesce(max(id), 0)::int as n from doccheck.audit')).rows[0].n
    await als(ID.super)
    // group_admin ohne DocCheck → superadmin → zurueck
    expect((await db.query("update public.profiles set role = 'superadmin' where id = $1", [ID.gruppe])).affectedRows).toBe(1)
    expect((await db.query("update public.profiles set role = 'group_admin' where id = $1", [ID.gruppe])).affectedRows).toBe(1)
    // Deaktivieren nimmt dem DocCheck-Admin die Rolle, Aktivieren gibt sie zurueck
    expect((await db.query('update public.profiles set active = false where id = $1', [ID.admin])).affectedRows).toBe(1)
    expect((await db.query('update public.profiles set active = true where id = $1', [ID.admin])).affectedRows).toBe(1)
    // Ohne DocCheck-Wirkung: Sam (kein Zugang) wird Gruppenadmin und wieder Mitglied
    expect((await db.query("update public.profiles set role = 'group_admin' where id = $1", [ID.ohne])).affectedRows).toBe(1)
    expect((await db.query("update public.profiles set role = 'member' where id = $1", [ID.ohne])).affectedRows).toBe(1)
    // Schalter ueber set_rights: weiter als 'zugang'/'admin', nicht doppelt als 'rolle'
    await db.query('select doccheck.set_rights($1, true, false)', [ID.ohne])
    await db.query('select doccheck.set_rights($1, false, false)', [ID.ohne])
    // Wer die Rolle nicht aendern darf, erzeugt auch keine Zeile
    await als(ID.admin)
    expect(await fehler("update public.profiles set role = 'superadmin' where id = $1", [ID.admin])).toContain('IC-RIGHTS')
    expect((await db.query("update public.profiles set role = 'superadmin' where id = $1", [ID.gruppe])).affectedRows).toBe(0)
    await alsDienst()
    const zeilen = (await db.query<{ actor: string; action: string; target: string; value: string }>('select actor, action, target, value from doccheck.audit where id > $1 order by id', [ab])).rows
    expect(zeilen).toEqual([
      { actor: ID.super, action: 'rolle', target: ID.gruppe, value: 'keine → superadmin' },
      { actor: ID.super, action: 'rolle', target: ID.gruppe, value: 'superadmin → keine' },
      { actor: ID.super, action: 'rolle', target: ID.admin, value: 'admin → keine' },
      { actor: ID.super, action: 'rolle', target: ID.admin, value: 'keine → admin' },
      { actor: ID.super, action: 'zugang', target: ID.ohne, value: 'false → true' },
      { actor: ID.super, action: 'zugang', target: ID.ohne, value: 'true → false' },
    ])
    // Niemand ruft die Triggerfunktion direkt auf — sonst liessen sich Zeilen erfinden
    await als(ID.super)
    expect(await fehler('select doccheck.rolle_aus($1, true, false, false)', ['superadmin'])).toMatch(/permission denied/)
  })

  it('Konto löschen geht (Löschrecht); Audit-Zeilen bleiben ohne Personenbezug', async () => {
    await alsDienst()
    // Nach Zeilen-ID, nicht nach Anzahl: Seit Rollenwechsel protokolliert
    // werden (VERW-15), gibt es auch Zeilen ohne Akteur aus Aenderungen des
    // Dienstes selbst (Einladung). Gemeint ist: GENAU die Zeilen dieses
    // Kontos bleiben, nur ohne Personenbezug.
    const ids = (await db.query<{ id: number }>('select id from doccheck.audit where actor = $1', [ID.nutzer])).rows.map((r) => r.id)
    expect(ids.length).toBeGreaterThan(0)
    await db.query('delete from auth.users where id = $1', [ID.nutzer])
    const danach = (await db.query<{ actor: string | null }>('select actor from doccheck.audit where id = any($1)', [ids])).rows
    expect(danach).toHaveLength(ids.length)
    expect(danach.every((r) => r.actor === null)).toBe(true)
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
    // DocCheck-Rechte und E-Mail kamen NICHT über das UPDATE (E-Mail gehört der Anmeldung)
    expect(zuNutzer(z)).toMatchObject({ ...alles, email: 'gruppe@example.test', docCheckAccess: false, docCheckAdmin: false })
  })
})

