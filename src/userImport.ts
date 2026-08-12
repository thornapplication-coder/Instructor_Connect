import { csvRow } from './csv'
import type { Role, User } from './types'

/**
 * Nutzer aus einer Tabelle anlegen.
 *
 * Wer eine ATO mit hundertfuenfzig Instruktoren aufsetzt, legt sie nicht
 * einzeln von Hand an. Vorlage herunterladen, in Excel ausfuellen, als CSV
 * speichern, hochladen — und VOR dem Anlegen sieht man Zeile fuer Zeile,
 * was in Ordnung ist und was nicht.
 *
 * Warum CSV und nicht .xlsx: Ein Excel-Leser im Browser kostet rund 400 KB
 * zusaetzlich. Die App muss im Simulator ohne Netz starten, und ein
 * Massenimport passiert ein paar Mal im Jahr. Excel oeffnet und schreibt CSV
 * selbst („Speichern unter → CSV UTF-8"), die Vorlage traegt ein BOM, damit
 * Umlaute stimmen.
 *
 * Hier liegt nur die reine Logik: Vorlage bauen, Datei lesen, pruefen. Kein
 * React, kein Store — damit sie prueffbar bleibt.
 */

/**
 * Spalten der Vorlage, in genau dieser Reihenfolge.
 *
 * ACHTUNG: Dieselben Spalten stehen auch in der mitgelieferten
 * Excel-Vorlage (`public/Instructor-Connect-Benutzer-Vorlage.xlsx`). Wer
 * hier etwas aendert, aendert sie dort mit — die CSV-Vorlage entsteht aus
 * dieser Liste, die Excel-Datei ist eine statische Bequemlichkeit.
 */
export const IMPORT_COLUMNS = [
  'Name',
  'Email',
  'Phone',
  'Role',
  'AircraftTypes',
  'CanGrade',
  'IsTrainee',
  'CanEditDirectory',
  'Active',
] as const

/**
 * Rollen, wie sie in der Tabelle stehen duerfen.
 *
 * Absichtlich grosszuegig: Wer „Admin" schreibt, meint den Gruppen-Admin,
 * und wer „Instructor" schreibt, meint ein Mitglied. Eine Einladung, die an
 * einer Schreibweise scheitert, hilft niemandem — falsch zuordnen darf sie
 * deshalb trotzdem nicht, unbekannte Werte werden abgewiesen.
 */
const ROLE_ALIASES: Record<string, Role> = {
  superadmin: 'superadmin',
  'super admin': 'superadmin',
  admin: 'group_admin',
  group_admin: 'group_admin',
  'group admin': 'group_admin',
  training_admin: 'training_admin',
  'training admin': 'training_admin',
  trainingadmin: 'training_admin',
  member: 'member',
  instructor: 'member',
  mitglied: 'member',
}

export type ImportProblem =
  | 'name'
  | 'email'
  | 'emailFormat'
  | 'emailDomain'
  | 'emailTaken'
  | 'emailDuplicate'
  | 'role'
  | 'aircraft'

export interface ImportRow {
  /** Zeilennummer in der Datei, 1-basiert inkl. Kopfzeile — damit der
   *  Hinweis auf dieselbe Zeile zeigt, die in Excel zu sehen ist. */
  line: number
  name: string
  email: string
  phone: string
  role: Role | null
  aircraftTypes: string[]
  canGrade: boolean
  isTrainee: boolean
  canEditDirectory: boolean
  active: boolean
  /** Leer = uebernehmbar. Sonst der Grund, je Feld. */
  problems: ImportProblem[]
  /** Unbekannte Muster — kein Fehler, aber sie werden verworfen. */
  unknownAircraft: string[]
}

export interface ImportResult {
  rows: ImportRow[]
  /** Kopfzeile fehlte oder passte nicht — dann ist die ganze Datei unbrauchbar. */
  headerError: boolean
  separator: string
}

/* ===================== Vorlage ===================== */

/**
 * Vorlage mit Kopfzeile und zwei Beispielzeilen.
 *
 * Die Beispiele sind bewusst ausgefuellt statt leer: Sie zeigen die
 * Schreibweise der Rollen, wie mehrere Muster getrennt werden und dass
 * Ja/Nein-Spalten „ja"/„nein" vertragen.
 */
export function buildImportTemplate(aircraftTypes: string[], domain: string): string {
  const muster = aircraftTypes.slice(0, 2)
  // Mehrere Muster mit Semikolon trennen. `csvRow` setzt die Zelle dann in
  // Anfuehrungszeichen, und genau die liest der Parser wieder ein — die Zeile
  // zerreisst also nicht. Ein Schraegstrich waere hier falsch: Musterkennungen
  // enthalten selbst welche („ATR 42/72").
  const beispielMuster = muster.length > 0 ? muster.join('; ') : 'CL30; C560 XLS+'
  return (
    csvRow([...IMPORT_COLUMNS]) +
    csvRow(['Max Beispiel', `max.beispiel@${domain}`, '+43 664 1234567', 'member', beispielMuster, 'ja', 'nein', 'nein', 'ja']) +
    csvRow(['Erika Beispiel', `erika.beispiel@${domain}`, '+43 664 7654321', 'admin', beispielMuster, 'ja', 'nein', 'ja', 'ja'])
  )
}

/* ===================== Lesen ===================== */

/** Ja/Nein in allen Schreibweisen, die in solchen Tabellen vorkommen. */
export function parseBool(raw: string, fallback = false): boolean {
  const v = raw.trim().toLowerCase()
  if (!v) return fallback
  return ['ja', 'j', 'yes', 'y', 'true', 'wahr', '1', 'x'].includes(v)
}

/**
 * Eine CSV-Zeile in Felder zerlegen — nach RFC 4180, also mit
 * Anfuehrungszeichen und verdoppelten Anfuehrungszeichen darin.
 *
 * Von Hand statt mit einer Bibliothek, weil das Gegenstueck (`csvEsc`)
 * ebenfalls hier im Projekt liegt: Beide Seiten muessen dieselbe Regel
 * kennen, sonst zerreisst ein Name wie O'Brien oder eine Adresse mit
 * Semikolon die Zeilenstruktur.
 */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let feld = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          feld += '"'
          i++
        } else inQuotes = false
      } else feld += c
    } else if (c === '"') inQuotes = true
    else if (c === sep) {
      out.push(feld)
      feld = ''
    } else feld += c
  }
  out.push(feld)
  return out.map((f) => f.trim())
}

/** Trennzeichen aus der Kopfzeile ableiten: deutsches Excel schreibt ';'. */
export function detectSeparator(headerLine: string): string {
  return headerLine.split(';').length >= headerLine.split(',').length ? ';' : ','
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Datei einlesen und Zeile fuer Zeile pruefen.
 *
 * Geprueft wird gegen den vorhandenen Bestand (`existing`), gegen die
 * erlaubten Domains und gegen die Musterliste — also gegen genau das, was
 * spaeter ueber die Anmeldung entscheidet. Eine Zeile, die hier gruen ist,
 * kann sich anschliessend auch wirklich anmelden; das ist der Zweck der
 * Vorschau.
 */
export function parseUserImport(
  text: string,
  ctx: { existing: Pick<User, 'email'>[]; allowedDomains: string[]; aircraftTypes: string[] },
): ImportResult {
  // BOM entfernen — Excel schreibt es, und sonst hiesse die erste Spalte
  // „﻿Name" und die Kopfzeile passte nie.
  const zeilen = text.replace(/^﻿/, '').split(/\r?\n/)
  const kopfZeile = zeilen.find((z) => z.trim() !== '') ?? ''
  const separator = detectSeparator(kopfZeile)
  const kopf = splitCsvLine(kopfZeile, separator).map((h) => h.toLowerCase())
  const spalte = (name: string) => kopf.indexOf(name.toLowerCase())
  const headerError = spalte('Name') < 0 || spalte('Email') < 0 || spalte('Role') < 0
  if (headerError) return { rows: [], headerError: true, separator }

  const vergeben = new Set(ctx.existing.map((u) => u.email.trim().toLowerCase()))
  const inDatei = new Set<string>()
  const musterBekannt = new Map(ctx.aircraftTypes.map((a) => [a.toLowerCase(), a]))
  const kopfIndex = zeilen.indexOf(kopfZeile)

  const rows: ImportRow[] = []
  zeilen.forEach((zeile, i) => {
    if (i <= kopfIndex || zeile.trim() === '') return
    const f = splitCsvLine(zeile, separator)
    const wert = (name: string) => {
      const idx = spalte(name)
      // Fuehrendes Hochkomma abstreifen: Das setzt der Formelschutz beim
      // Export vor Werte wie „+43 664 …", damit Excel darin keine Formel
      // sieht. Es gehoert nicht zum Wert — ohne diese Zeile stand es
      // anschliessend in der Telefonnummer.
      return idx >= 0 ? (f[idx] ?? '').replace(/^'/, '') : ''
    }
    const name = wert('Name')
    const email = wert('Email').toLowerCase()
    const rolleRoh = wert('Role').toLowerCase()
    const role = ROLE_ALIASES[rolleRoh] ?? null

    // Erst die GANZE Zelle als ein Muster versuchen, dann erst trennen:
    // Musterkennungen enthalten Schraegstriche und Kommas („ATR 42/72"),
    // und ein blindes Zerlegen machte daraus „ATR 42" und „72" — zwei
    // Muster, die es nicht gibt. Getrennt wird deshalb nur, wenn die Zelle
    // als Ganzes keinem bekannten Muster entspricht.
    const musterZelle = wert('AircraftTypes').trim()
    const musterRoh = musterBekannt.has(musterZelle.toLowerCase())
      ? [musterZelle]
      : musterZelle
          .split(/[;,]/)
          .map((m) => m.trim())
          .filter(Boolean)
    const aircraftTypes: string[] = []
    const unknownAircraft: string[] = []
    musterRoh.forEach((m) => {
      const treffer = musterBekannt.get(m.toLowerCase())
      if (treffer) {
        if (!aircraftTypes.includes(treffer)) aircraftTypes.push(treffer)
      } else unknownAircraft.push(m)
    })

    const problems: ImportProblem[] = []
    if (!name) problems.push('name')
    if (!email) problems.push('email')
    else if (!EMAIL.test(email)) problems.push('emailFormat')
    else {
      const domain = email.slice(email.lastIndexOf('@') + 1)
      // Die Domainliste entscheidet auch bei der Anmeldung — eine Adresse
      // ausserhalb koennte sich nie anmelden, also gar nicht erst anlegen.
      if (ctx.allowedDomains.length > 0 && !ctx.allowedDomains.some((d) => d.toLowerCase() === domain)) {
        problems.push('emailDomain')
      }
      if (vergeben.has(email)) problems.push('emailTaken')
      if (inDatei.has(email)) problems.push('emailDuplicate')
      inDatei.add(email)
    }
    if (!role) problems.push('role')
    if (unknownAircraft.length > 0) problems.push('aircraft')

    rows.push({
      line: i + 1,
      name,
      email,
      phone: wert('Phone'),
      role,
      aircraftTypes,
      canGrade: parseBool(wert('CanGrade'), role === 'member' || role === 'group_admin'),
      isTrainee: parseBool(wert('IsTrainee')),
      canEditDirectory: parseBool(wert('CanEditDirectory')),
      active: parseBool(wert('Active'), true),
      problems,
      unknownAircraft,
    })
  })

  return { rows, headerError: false, separator }
}

/**
 * Uebernehmbar ist eine Zeile ohne blockierende Probleme.
 *
 * Ein unbekanntes Muster blockiert NICHT: Der Nutzer entsteht dann ohne
 * dieses Muster, und das ist im Admin-Panel in zwei Klicks nachgetragen —
 * die ganze Datei daran scheitern zu lassen waere unverhaeltnismaessig.
 */
export function isImportable(row: ImportRow): boolean {
  return row.problems.every((p) => p === 'aircraft')
}
