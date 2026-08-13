import { describe, expect, it } from 'vitest'
import {
  buildImportTemplate,
  detectSeparator,
  IMPORT_COLUMNS,
  isImportable,
  parseBool,
  parseUserImport,
  splitCsvLine,
} from './userImport'

/**
 * Der Import legt in einem Zug hundertfuenfzig Nutzer an. Getestet wird
 * deshalb vor allem, was er ABWEIST — eine Zeile, die faelschlich durchgeht,
 * erzeugt einen Nutzer, der sich nie anmelden kann, und den raeumt danach
 * jemand von Hand wieder weg.
 */

const CTX = {
  existing: [{ email: 'patrick.thorn@aviationacademy.at' }],
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
    const v = buildImportTemplate(['CL30', 'C560 XLS+'], 'aviationacademy.at')
    const zeilen = v.trim().split('\n')
    expect(zeilen).toHaveLength(3)
    expect(zeilen[0]).toContain('Name')
    expect(zeilen[0]).toContain('Role')
    expect(v).toContain('@aviationacademy.at')
  })

  it('laesst sich unveraendert wieder einlesen', () => {
    // Die Vorlage ist die Vorlage — was sie erzeugt, muss durch die Pruefung
    // kommen, sonst schickt man die Leute mit einer kaputten Datei los.
    const v = buildImportTemplate(CTX.aircraftTypes, 'aviationacademy.at')
    const r = parseUserImport(v, CTX)
    expect(r.headerError).toBe(false)
    expect(r.rows).toHaveLength(2)
    expect(r.rows.every(isImportable)).toBe(true)
    expect(r.rows[1].role).toBe('group_admin')
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
    const r = parseUserImport(datei('Patrick;patrick.thorn@aviationacademy.at;;superadmin;;;;;'), CTX)
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
