import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BEISPIEL_DOMAIN,
  buildImportTemplate,
  detectSeparator,
  EMAIL,
  IMPORT_COLUMNS,
  importOhneGruppe,
  importPlanen,
  importZielgruppen,
  isImportable,
  istBeispielAdresse,
  istBeispielZeile,
  istTabellenDatei,
  parseBool,
  parseUserImport,
  splitCsvLine,
  type ImportEingabe,
  VORLAGE_XLSX,
} from './userImport'
import type { Group, Settings, User } from './types'

/**
 * Der Import legt in einem Zug hundertfuenfzig Nutzer an. Getestet wird
 * deshalb vor allem, was er ABWEIST — eine Zeile, die faelschlich durchgeht,
 * erzeugt einen Nutzer, der sich nie anmelden kann, und den raeumt danach
 * jemand von Hand wieder weg.
 */

const CTX = {
  existing: [{ email: 'alex.beispiel@example.test' }],
  allowedDomains: ['aviationacademy.at'],
  aircraftTypes: ['CL30', 'C560 XLS+'],
}

const kopf = IMPORT_COLUMNS.join(';')
const datei = (...zeilen: string[]) => [kopf, ...zeilen].join('\n')

describe('CSV zerlegen', () => {
  it('trennt einfache Felder', () => {
    expect(splitCsvLine('a;b;c', ';')).toEqual(['a', 'b', 'c'])
  })

  it('haelt ein Trennzeichen in Anfuehrungszeichen zusammen', () => {
    // Eine Adresse mit Semikolon zerriss sonst die Zeilenstruktur.
    expect(splitCsvLine('"Wien; Stiege 2";b', ';')).toEqual(['Wien; Stiege 2', 'b'])
  })

  it('liest verdoppelte Anfuehrungszeichen als eines', () => {
    expect(splitCsvLine('"Er sagte ""ja""";b', ';')).toEqual(['Er sagte "ja"', 'b'])
  })

  it('erkennt das Trennzeichen aus der Kopfzeile', () => {
    expect(detectSeparator('Name;Email;Role')).toBe(';')
    expect(detectSeparator('Name,Email,Role')).toBe(',')
  })
})

describe('Ja/Nein', () => {
  it('versteht die ueblichen Schreibweisen', () => {
    ;['ja', 'JA', 'j', 'yes', 'true', 'wahr', '1', 'x'].forEach((v) => expect(parseBool(v)).toBe(true))
    ;['nein', 'no', 'false', '0', 'weiss nicht'].forEach((v) => expect(parseBool(v)).toBe(false))
  })

  it('nimmt bei leerer Zelle den Vorgabewert', () => {
    expect(parseBool('', true)).toBe(true)
    expect(parseBool('   ', false)).toBe(false)
  })
})

describe('Vorlage', () => {
  it('traegt die Kopfzeile und zwei Beispiele', () => {
    const v = buildImportTemplate(['CL30', 'C560 XLS+'])
    const zeilen = v.trim().split('\n')
    expect(zeilen).toHaveLength(3)
    expect(zeilen[0]).toContain('Name')
    expect(zeilen[0]).toContain('Role')
    // Beispiele auf der reservierten Domain, nie auf der echten der ATO
    // (Audit 11/2026, VERW-06).
    expect(v).toContain(`@${BEISPIEL_DOMAIN}`)
    expect(v).not.toContain('@aviationacademy.at')
  })

  it('wird unveraendert gelesen — und legt nichts an (VERW-06)', () => {
    // Die Vorlage muss durch die Pruefung kommen, sonst schickt man die
    // Leute mit einer kaputten Datei los. Seit VERW-06 heisst „durchkommen":
    // jedes Feld richtig gelesen, die Zeilen aber als Beispiel erkannt. Die
    // Anleitung sagt, sie duerften stehen bleiben — dann duerfen sie auch
    // nichts anlegen. Vorher entstanden zwei fiktive Konten, eines davon
    // Gruppen-Admin.
    const v = buildImportTemplate(CTX.aircraftTypes)
    const r = parseUserImport(v, CTX)
    expect(r.headerError).toBe(false)
    expect(r.rows).toHaveLength(2)
    expect(r.rows.map((z) => z.problems)).toEqual([['example'], ['example']])
    expect(r.rows.filter(isImportable)).toHaveLength(0)
    expect(r.rows.every(istBeispielZeile)).toBe(true)
    expect(r.rows[1]).toMatchObject({ name: 'Erika Beispiel', role: 'group_admin', aircraftTypes: ['CL30', 'C560 XLS+'], canEditDirectory: true })
    // Mit einer echten Domain waeren dieselben Zeilen uebernehmbar — das
    // Format selbst ist also gueltig, nur die Adresse macht sie zum Beispiel.
    const echt = parseUserImport(v.split(`@${BEISPIEL_DOMAIN}`).join('@aviationacademy.at'), CTX)
    expect(echt.rows.every(isImportable)).toBe(true)
  })

  it('Beispieltelefone ohne Formelschutz-Hochkomma, Rundlauf unveraendert (TPL-02)', () => {
    // Vor „+43" setzte der Formelschutz ein Hochkomma, und Excel zeigte es an.
    const v = buildImportTemplate(CTX.aircraftTypes)
    expect(v).not.toContain("'+")
    expect(v).not.toContain("'0")
    expect(parseUserImport(v, CTX).rows.map((z) => z.phone)).toEqual(['0043 664 1234567', '0043 664 7654321'])
  })

  it('erkennt jede Adresse unter .invalid als Beispiel, sonst keine', () => {
    expect(istBeispielAdresse(`max@${BEISPIEL_DOMAIN}`)).toBe(true)
    expect(istBeispielAdresse('neu@Abteilung.INVALID ')).toBe(true)
    expect(istBeispielAdresse('x@invalid')).toBe(true)
    expect(istBeispielAdresse('max@aviationacademy.at')).toBe(false)
    expect(istBeispielAdresse('max@invalid.at')).toBe(false)
    expect(istBeispielAdresse('ohne-at.invalid')).toBe(false)
  })

  it('eine Beispielzeile steht allein und blockiert keine echte Zeile mit gleicher Adresse', () => {
    const r = parseUserImport(
      datei(`Max Beispiel;max@${BEISPIEL_DOMAIN};;unbekannt;;;;;`, `Max Beispiel;max@${BEISPIEL_DOMAIN};;member;CL30;;;;`),
      CTX,
    )
    // Weder „Rolle unbekannt" noch „Domain nicht freigegeben" noch „doppelt".
    expect(r.rows.map((z) => z.problems)).toEqual([['example'], ['example']])
  })

  it('der Import legt auch dann keine Beispieladresse an, wenn sie durchgereicht wird', () => {
    const settings = { allowedDomains: [] } as unknown as Settings
    const g: Group = { id: 'g', name: 'g', aircraftType: '', purpose: '', adminIds: [], memberIds: [], retention: null, muted: false }
    const zeile: ImportEingabe = { name: 'X', email: `x@${BEISPIEL_DOMAIN}`, phone: '', role: 'member', aircraftTypes: ['CL30'], canGrade: true, isTrainee: false, canEditDirectory: false, active: true }
    expect(importPlanen({ users: [], groups: [g], settings }, [zeile], ['g'], () => 'neu').neue).toEqual([])
  })
})

describe('Pruefung je Zeile', () => {
  it('nimmt eine vollstaendige Zeile an', () => {
    const r = parseUserImport(datei('Anna Neu;anna.neu@aviationacademy.at;+43 1;member;CL30;ja;nein;nein;ja'), CTX)
    const z = r.rows[0]
    expect(z.problems).toEqual([])
    expect(z.role).toBe('member')
    expect(z.aircraftTypes).toEqual(['CL30'])
    expect(z.canGrade).toBe(true)
    expect(z.active).toBe(true)
  })

  it('weist eine Domain ab, die sich nie anmelden koennte', () => {
    const r = parseUserImport(datei('Anna;anna@gmail.com;;member;;;;;'), CTX)
    expect(r.rows[0].problems).toContain('emailDomain')
    expect(isImportable(r.rows[0])).toBe(false)
  })

  it('weist eine bereits vergebene Adresse ab', () => {
    const r = parseUserImport(datei('Alex;alex.beispiel@example.test;;superadmin;;;;;'), CTX)
    expect(r.rows[0].problems).toContain('emailTaken')
  })

  it('erkennt dieselbe Adresse zweimal IN der Datei', () => {
    const r = parseUserImport(
      datei('A;doppelt@aviationacademy.at;;member;CL30;;;;', 'B;doppelt@aviationacademy.at;;member;CL30;;;;'),
      CTX,
    )
    expect(r.rows[0].problems).toEqual([])
    expect(r.rows[1].problems).toContain('emailDuplicate')
  })

  it('weist eine unbekannte Rolle ab, statt zu raten', () => {
    const r = parseUserImport(datei('Anna;anna@aviationacademy.at;;Chefpilot;;;;;'), CTX)
    expect(r.rows[0].problems).toContain('role')
    expect(r.rows[0].role).toBeNull()
  })

  it('versteht die ueblichen Schreibweisen der Rollen', () => {
    const r = parseUserImport(
      datei(
        'A;a@aviationacademy.at;;Admin;;;;;',
        'B;b@aviationacademy.at;;Training Admin;;;;;',
        'C;c@aviationacademy.at;;Instructor;;;;;',
        'D;d@aviationacademy.at;;SUPERADMIN;;;;;',
      ),
      CTX,
    )
    expect(r.rows.map((x) => x.role)).toEqual(['group_admin', 'training_admin', 'member', 'superadmin'])
  })

  /**
   * Ein unbekanntes Muster ist im Admin-Panel in zwei Klicks nachgetragen.
   * Die ganze Zeile daran scheitern zu lassen waere unverhaeltnismaessig —
   * verschwiegen wird es trotzdem nicht.
   */
  it('verwirft ein unbekanntes Muster, blockiert die Zeile aber nicht', () => {
    const r = parseUserImport(datei('Anna;anna@aviationacademy.at;;member;"CL30; Boeing 737";ja;;;'), CTX)
    const z = r.rows[0]
    expect(z.aircraftTypes).toEqual(['CL30'])
    expect(z.unknownAircraft).toEqual(['Boeing 737'])
    expect(z.problems).toEqual(['aircraft'])
    expect(isImportable(z)).toBe(true)
  })

  it('meldet eine unpassende Kopfzeile, statt Unsinn zu lesen', () => {
    const r = parseUserImport('Vorname;Nachname\nA;B', CTX)
    expect(r.headerError).toBe(true)
    expect(r.rows).toEqual([])
  })

  it('ueberspringt leere Zeilen und behaelt die Zeilennummer aus Excel', () => {
    const r = parseUserImport(datei('', 'Anna;anna@aviationacademy.at;;member;;;;;'), CTX)
    expect(r.rows).toHaveLength(1)
    // Kopf = 1, Leerzeile = 2, Anna = 3
    expect(r.rows[0].line).toBe(3)
  })

  it('kommt mit dem BOM klar, das Excel schreibt', () => {
    const r = parseUserImport('﻿' + datei('Anna;anna@aviationacademy.at;;member;CL30;;;;'), CTX)
    expect(r.headerError).toBe(false)
    expect(r.rows[0].problems).toEqual([])
  })

  it('liest auch komma-getrennte Dateien', () => {
    const r = parseUserImport('Name,Email,Role,AircraftTypes\nAnna,anna@aviationacademy.at,member,CL30', CTX)
    expect(r.separator).toBe(',')
    expect(r.rows[0].problems).toEqual([])
  })

  it('setzt canGrade sinnvoll vor, wenn die Spalte leer bleibt', () => {
    const r = parseUserImport(
      datei('A;a@aviationacademy.at;;member;;;;;', 'B;b@aviationacademy.at;;training_admin;;;;;'),
      CTX,
    )
    // Ein Mitglied ist im Regelfall Instruktor, ein Training Admin nie.
    expect(r.rows[0].canGrade).toBe(true)
    expect(r.rows[1].canGrade).toBe(false)
  })

  /**
   * Das Semikolon trennt in deutschem Excel die SPALTEN. Wer mehrere Muster
   * in eine Zelle tippt, ist trotzdem sicher — Excel setzt dann
   * Anfuehrungszeichen, und die liest der Parser. Die Vorlage benutzt
   * deshalb einen Schraegstrich, aber beides muss funktionieren.
   */
  it('liest mehrere Muster in Anfuehrungszeichen und mit Komma', () => {
    const inAnfuehrung = parseUserImport(datei('B;b@aviationacademy.at;;member;"CL30; C560 XLS+";;;;'), CTX)
    expect(inAnfuehrung.rows[0].aircraftTypes).toEqual(['CL30', 'C560 XLS+'])
    const mitKomma = parseUserImport('Name,Email,Role,AircraftTypes\nA,a@aviationacademy.at,member,"CL30; C560 XLS+"', CTX)
    expect(mitKomma.rows[0].aircraftTypes).toEqual(['CL30', 'C560 XLS+'])
  })

  /**
   * Musterkennungen enthalten selbst Schraegstriche und Kommas („ATR 42/72",
   * „C525 CJ1+"). Ein blindes Zerlegen der Zelle machte daraus „ATR 42" und
   * „72" — zwei Muster, die es nicht gibt, und der Nutzer stand ohne sein
   * einziges Muster da.
   */
  it('zerlegt eine Musterkennung mit Schraegstrich NICHT', () => {
    const ctx = { ...CTX, aircraftTypes: ['ATR 42/72', 'CL30'] }
    const r = parseUserImport(datei('A;a@aviationacademy.at;;member;ATR 42/72;;;;'), ctx)
    expect(r.rows[0].aircraftTypes).toEqual(['ATR 42/72'])
    expect(r.rows[0].unknownAircraft).toEqual([])
  })

  it('nennt dasselbe Muster nur einmal, auch wenn es doppelt in der Zelle steht', () => {
    const r = parseUserImport(datei('A;a@aviationacademy.at;;member;"CL30; cl30";;;;'), CTX)
    expect(r.rows[0].aircraftTypes).toEqual(['CL30'])
  })

  it('streift das Hochkomma des Formelschutzes ab', () => {
    // Der Export setzt es vor „+43 …", damit Excel keine Formel sieht. Ohne
    // Abstreifen stand es anschliessend in der Telefonnummer.
    const r = parseUserImport(datei("Anna;anna@aviationacademy.at;'+43 664 1;member;;;;;"), CTX)
    expect(r.rows[0].phone).toBe('+43 664 1')
  })

  it('laesst ohne freigegebene Domains jede Adresse zu', () => {
    const r = parseUserImport(datei('Anna;anna@gmail.com;;member;CL30;;;;'), { ...CTX, allowedDomains: [] })
    expect(r.rows[0].problems).toEqual([])
  })
})

/**
 * Die Musterpflicht — und die Zusage, die dabei bewusst aufgegeben wurde.
 *
 * Bis hierher galt: „Ein unbekanntes Muster blockiert NICHT." Das bleibt
 * richtig, solange noch ein Muster uebrig bleibt. Bleibt keines, ist das
 * Ergebnis kein unvollstaendiger Nutzer, sondern ein blinder — er sieht
 * weder Lesson Plan noch Instructor Info noch musterbezogenen Chat.
 *
 * Der Anlege-Dialog verweigert genau dieses Konto. Der Import legte es an,
 * und die Vorschau meldete die Zeile gruen — auf dem Weg, der nicht einen
 * Nutzer anlegt, sondern hundertfuenfzig. Aufgefallen ist das beim
 * Gegenlesen, nicht im Betrieb.
 */
describe('Musterpflicht beim Import', () => {
  it('blockiert eine member-Zeile ohne Muster', () => {
    const r = parseUserImport(datei('Anna;anna@aviationacademy.at;;member;;ja;;;'), CTX)
    expect(r.rows[0].problems).toEqual(['aircraftMissing'])
    expect(isImportable(r.rows[0])).toBe(false)
  })

  it('blockiert auch den Gruppen-Admin — er ist ans Muster gebunden', () => {
    const r = parseUserImport(datei('Erika;erika@aviationacademy.at;;admin;;ja;;;'), CTX)
    expect(isImportable(r.rows[0])).toBe(false)
  })

  it('laesst superadmin und training admin ohne Muster durch', () => {
    // Fuer sie waere die Spalte ein totes Pflichtfeld: Ihre Sicht haengt
    // nicht am Muster, eine Eintragung aendert daran nichts.
    const r = parseUserImport(
      datei('S;s@aviationacademy.at;;superadmin;;;;;', 'T;t@aviationacademy.at;;training admin;;;;;'),
      CTX,
    )
    expect(r.rows.map((x) => x.problems)).toEqual([[], []])
    expect(r.rows.every(isImportable)).toBe(true)
  })

  it('blockiert, wenn das EINZIGE genannte Muster unbekannt ist', () => {
    // Hier laufen beide Regeln zusammen: Die unbekannte Kennung wird
    // verworfen (kein Blocker), aber danach ist die Liste leer (Blocker).
    const r = parseUserImport(datei('Anna;anna@aviationacademy.at;;member;Boeing 737;;;;'), CTX)
    expect(r.rows[0].unknownAircraft).toEqual(['Boeing 737'])
    expect(r.rows[0].problems).toEqual(['aircraft', 'aircraftMissing'])
    expect(isImportable(r.rows[0])).toBe(false)
  })

  it('laesst eine Zeile durch, bei der nach dem Verwerfen ein Muster bleibt', () => {
    // Die alte Abwaegung gilt unveraendert: nachtragen im Panel ist zumutbar.
    const r = parseUserImport(datei('Anna;anna@aviationacademy.at;;member;"CL30; Boeing 737";;;;'), CTX)
    expect(r.rows[0].problems).toEqual(['aircraft'])
    expect(isImportable(r.rows[0])).toBe(true)
  })

  it('meldet die fehlende Rolle, nicht das fehlende Muster', () => {
    // Ohne Rolle ist gar nicht entscheidbar, ob die Pflicht gilt — dann darf
    // die Zeile nicht mit zwei Vorwuerfen dastehen, von denen einer geraten ist.
    const r = parseUserImport(datei('Anna;anna@aviationacademy.at;;Chefpilot;;;;;'), CTX)
    expect(r.rows[0].problems).toEqual(['role'])
  })
})

describe('Ein Adressmuster fuer Dialog und Import (Audit 11/2026, VERW-12)', () => {
  // Der Dialog hatte ein eigenes, lockereres Muster: „a@b.c" ging dort durch
  // und wurde vom Import abgewiesen. Jetzt fragen beide EMAIL.
  it('gilt fuer beide Wege gleich', () => {
    expect(EMAIL.test('mika.beispiel@example.test')).toBe(true)
    expect(EMAIL.test('a@b.c')).toBe(false)
    expect(EMAIL.test('kein at.example.test')).toBe(false)
    const zeile = parseUserImport(datei('X;a@b.c;;member;CL30;;;;'), { ...CTX, allowedDomains: [] }).rows[0]
    expect(zeile.problems).toContain('emailFormat')
  })

  it('versteht einen gespeicherten Altbestand „@Example.Test" wie die Anmeldung', () => {
    const zeile = parseUserImport(datei('X;x@example.test;;member;CL30;;;;'), { ...CTX, allowedDomains: ['@Example.Test'] }).rows[0]
    expect(zeile.problems).not.toContain('emailDomain')
  })
})

describe('Import nur mit Gruppe (Audit 11/2026, VERW-07)', () => {
  // Der Import legte Konten ganz ohne Gruppe an, waehrend der Dialog
  // „Benutzer anlegen" genau das verweigert. Gezaehlt werden — wie ueberall —
  // nur Gruppen, die die Person betreten kann.
  const settings = { allowedDomains: ['aviationacademy.at'] } as unknown as Settings
  const gruppe = (id: string, aircraftType: string): Group => ({ id, name: id, aircraftType, purpose: '', adminIds: [], memberIds: ['alt'], retention: null, muted: false })
  const cl30 = gruppe('g-cl30', 'CL30')
  const allgemein = gruppe('g-alle', '')
  const zeile = (p: Partial<ImportEingabe> = {}): ImportEingabe => ({
    name: ' Max Beispiel ',
    email: 'max@aviationacademy.at',
    phone: '',
    role: 'member',
    aircraftTypes: ['CL30'],
    canGrade: true,
    isTrainee: false,
    canEditDirectory: false,
    active: true,
    ...p,
  })
  const bestand = (users: User[] = []) => ({ users, groups: [cl30, allgemein], settings })
  let n = 0
  const id = () => `neu-${++n}`

  it('ohne Gruppe wird nichts angelegt', () => {
    const plan = importPlanen(bestand(), [zeile(), zeile({ email: 'erika@aviationacademy.at', role: 'group_admin' })], [], id)
    expect(plan.neue).toEqual([])
    expect(plan.groups).toEqual([cl30, allgemein])
  })

  it('mit Gruppe stehen alle neuen Konten in memberIds', () => {
    n = 0
    const plan = importPlanen(bestand(), [zeile(), zeile({ email: 'erika@aviationacademy.at', role: 'group_admin' })], ['g-cl30'], id)
    expect(plan.neue.map((u) => u.id)).toEqual(['neu-1', 'neu-2'])
    expect(plan.groups.find((g) => g.id === 'g-cl30')!.memberIds).toEqual(['alt', 'neu-1', 'neu-2'])
    // Bereinigt wie vorher im Store: Rand weg, Adresse klein.
    expect(plan.neue[0]).toMatchObject({ name: 'Max Beispiel', email: 'max@aviationacademy.at' })
  })

  it('setzt niemanden in eine Gruppe fremden Musters — wer keine erreichbare hat, entsteht nicht', () => {
    const c560 = zeile({ email: 'c560@aviationacademy.at', aircraftTypes: ['C560 XLS+'] })
    expect(importOhneGruppe(settings, { ...c560, role: 'member' }, [cl30, allgemein], ['g-cl30'])).toBe(true)
    expect(importPlanen(bestand(), [c560], ['g-cl30'], id).neue).toEqual([])
    // Mit der musteruebergreifenden Gruppe dazu: angelegt, aber nur dort Mitglied.
    n = 0
    const plan = importPlanen(bestand(), [c560], ['g-cl30', 'g-alle'], id)
    expect(plan.neue).toHaveLength(1)
    expect(plan.groups.find((g) => g.id === 'g-cl30')!.memberIds).toEqual(['alt'])
    expect(plan.groups.find((g) => g.id === 'g-alle')!.memberIds).toEqual(['alt', 'neu-1'])
    expect(importZielgruppen(settings, { ...c560, role: 'member' }, [cl30, allgemein], ['g-cl30', 'g-alle']).map((g) => g.id)).toEqual(['g-alle'])
  })

  it('der Training Admin hat keinen Chat und braucht keine Gruppe', () => {
    const ta = zeile({ email: 'ta@aviationacademy.at', role: 'training_admin', aircraftTypes: [] })
    expect(importOhneGruppe(settings, ta, [cl30], [])).toBe(false)
    const plan = importPlanen(bestand(), [ta], ['g-alle'], id)
    expect(plan.neue).toHaveLength(1)
    // ... und landet auch nicht in einer Gruppe, die er nicht betreten kann.
    expect(plan.groups.find((g) => g.id === 'g-alle')!.memberIds).toEqual(['alt'])
  })

  it('weist auch hier ab, was die Vorschau schon abweist — der Bestand kann sich inzwischen geaendert haben', () => {
    const vorhanden = { id: 'x', email: 'max@aviationacademy.at' } as User
    expect(importPlanen(bestand([vorhanden]), [zeile()], ['g-alle'], id).neue).toEqual([])
    expect(importPlanen(bestand(), [zeile({ email: 'x@gmail.com' })], ['g-alle'], id).neue).toEqual([])
    expect(importPlanen(bestand(), [zeile({ aircraftTypes: [] })], ['g-alle'], id).neue).toEqual([])
    expect(importPlanen(bestand(), [zeile({ email: ' ' })], ['g-alle'], id).neue).toEqual([])
    // Zweimal dieselbe Adresse in der Datei: nur einmal angelegt.
    expect(importPlanen(bestand(), [zeile(), zeile({ email: 'MAX@aviationacademy.at' })], ['g-alle'], id).neue).toHaveLength(1)
  })

  it('eine Zeile ohne erkannte Rolle bekommt keine Zielgruppe', () => {
    expect(importZielgruppen(settings, { role: null, aircraftTypes: ['CL30'], canGrade: false, canEditDirectory: false }, [cl30], ['g-cl30'])).toEqual([])
    expect(importOhneGruppe(settings, { role: null, aircraftTypes: ['CL30'], canGrade: false, canEditDirectory: false }, [cl30], [])).toBe(false)
  })
})

/**
 * Excel statt CSV (Audit 11/2026, VERW-19): Die eigene Excel-Vorlage
 * hochgeladen ergab „Kopfzeile passt nicht … bitte die Vorlage verwenden".
 */
describe('istTabellenDatei', () => {
  const bytes = (...b: number[]) => new Uint8Array(b)
  const csv = new TextEncoder().encode('Name;Email;Role\n')

  it('erkennt die mitgelieferte Excel-Vorlage am Inhalt, auch ohne Endung', () => {
    const vorlage = new Uint8Array(readFileSync(`public/${VORLAGE_XLSX}`)).slice(0, 4)
    expect(istTabellenDatei(VORLAGE_XLSX, vorlage)).toBe(true)
    expect(istTabellenDatei('benutzer', vorlage)).toBe(true)
    expect(istTabellenDatei('benutzer.csv', vorlage)).toBe(true)
  })

  it('erkennt Excel-Endungen unabhaengig vom Inhalt', () => {
    for (const name of ['liste.xlsx', 'LISTE.XLSX', 'liste.xls', 'liste.xlsm', 'liste.ods ']) expect(istTabellenDatei(name, csv), name).toBe(true)
  })

  it('erkennt das alte Office-Format (xls) an seiner Signatur', () => {
    expect(istTabellenDatei('export', bytes(0xd0, 0xcf, 0x11, 0xe0))).toBe(true)
  })

  it('laesst CSV durch — auch eine, die zufaellig mit „P" beginnt', () => {
    expect(istTabellenDatei('benutzer.csv', csv)).toBe(false)
    expect(istTabellenDatei('benutzer.csv', new TextEncoder().encode('PK;Name\n'))).toBe(false)
    expect(istTabellenDatei('benutzer.csv', bytes(0x50, 0x4b))).toBe(false)
    expect(istTabellenDatei('leer.csv', bytes())).toBe(false)
  })
})
