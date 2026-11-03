import { gruppenPflicht, gruppenTauglich, musterFehlt } from './aircraftScope'
import { csvRow } from './csv'
import { domainErlaubt } from './domains'
import type { Group, Role, Settings, User } from './types'

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
  /** Unbekanntes Muster genannt — wird verworfen, haelt die Zeile aber nicht auf. */
  | 'aircraft'
  /** Musterpflichtige Rolle ohne ein einziges gueltiges Muster. Blockiert. */
  | 'aircraftMissing'
  /** Beispielzeile der Vorlage (Adresse auf `.invalid`). Wird uebersprungen,
   *  nicht angelegt und in der Vorschau nicht mitgezaehlt. Steht allein. */
  | 'example'

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
 * Dateinamen der beiden Vorlagen — EIN Schema fuer beide Formate. Vorher
 * hiess die Excel-Datei „Instructor-Connect-Benutzer-Vorlage.xlsx" und die
 * CSV daneben „instructor-connect-users-template.csv" (Audit 11/2026,
 * EXM-10). Die Excel-Datei liegt unter diesem Namen in `public/`;
 * userTemplate.test.ts liest sie von dort.
 */
export const VORLAGE_XLSX = 'Instructor-Connect-Benutzer-Vorlage.xlsx'
export const VORLAGE_CSV = 'Instructor-Connect-Benutzer-Vorlage.csv'

/**
 * Ist die gewaehlte Datei eine Tabelle (Excel) statt CSV?
 *
 * Das Dateifeld liest die Datei als Text. Wer die Excel-Vorlage selbst
 * hochlud (mobil oder ueber „Alle Dateien"), bekam „Die Kopfzeile passt
 * nicht … bitte die Vorlage verwenden" — also den Rat, genau die Datei zu
 * nehmen, die er gerade genommen hatte (Audit 11/2026, VERW-19). Erkannt wird
 * an der Endung UND am Inhalt, weil Endungen fehlen oder falsch sein koennen:
 * `PK\x03\x04` beginnt jedes ZIP (xlsx, ods), `D0 CF 11 E0` das alte
 * Office-Format (xls).
 */
export function istTabellenDatei(name: string, ersteBytes: Uint8Array): boolean {
  if (/\.(xlsx|xlsm|xls|ods)$/i.test(name.trim())) return true
  const b = ersteBytes
  const zip = b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
  const ole = b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0
  return zip || ole
}

/**
 * Domain der Beispielzeilen in CSV- und Excel-Vorlage.
 *
 * `.invalid` ist nach RFC 2606 reserviert — eine solche Adresse kann es nie
 * geben, also auch nie ein Postfach, das spaeter jemand anderem gehoert.
 * Vorher standen die Beispiele auf der echten Domain der ATO, und die
 * Anleitung sagte, sie duerften stehen bleiben: Wer ihr folgte, legte zwei
 * fiktive Konten an, eines davon Gruppen-Admin mit Verzeichnisrecht
 * (Audit 11/2026, VERW-06). `scripts/benutzer-vorlage.py` liest den Wert von
 * hier.
 */
export const BEISPIEL_DOMAIN = 'beispiel.invalid'

/**
 * Ist das eine Beispieladresse? Jede Adresse unter `.invalid`, nicht nur
 * BEISPIEL_DOMAIN: Echt kann keine davon sein, und wer die Beispielzeile
 * abwandelt, meint immer noch ein Beispiel.
 */
export function istBeispielAdresse(email: string): boolean {
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  const domain = email.slice(at + 1).trim().toLowerCase()
  return domain === 'invalid' || domain.endsWith('.invalid')
}

/** Eine Vorschauzeile, die als Beispiel uebersprungen wird. */
export function istBeispielZeile(row: Pick<ImportRow, 'problems'>): boolean {
  return row.problems.includes('example')
}

/**
 * Vorlage mit Kopfzeile und zwei Beispielzeilen.
 *
 * Die Beispiele sind bewusst ausgefuellt statt leer: Sie zeigen die
 * Schreibweise der Rollen, wie mehrere Muster getrennt werden und dass
 * Ja/Nein-Spalten „ja"/„nein" vertragen. Sie stehen auf BEISPIEL_DOMAIN und
 * werden beim Import uebersprungen — stehen bleiben duerfen sie also wirklich.
 */
export function buildImportTemplate(aircraftTypes: string[]): string {
  const muster = aircraftTypes.slice(0, 2)
  // Mehrere Muster mit Semikolon trennen. `csvRow` setzt die Zelle dann in
  // Anfuehrungszeichen, und genau die liest der Parser wieder ein — die Zeile
  // zerreisst also nicht. Ein Schraegstrich waere hier falsch: Musterkennungen
  // enthalten selbst welche („ATR 42/72").
  const beispielMuster = muster.length > 0 ? muster.join('; ') : 'CL30; C560 XLS+'
  // Telefon mit „0043" statt „+43": Vor ein fuehrendes „+" setzt der
  // Formelschutz (csv.ts) ein Hochkomma, und Excel zeigte „'+43 664 …"
  // wörtlich an (Audit 11/2026, TPL-02). Die Leerzeichen halten Excel davon
  // ab, die Nummer als Zahl zu lesen und die fuehrenden Nullen zu streichen.
  return (
    csvRow([...IMPORT_COLUMNS]) +
    csvRow(['Max Beispiel', `max.beispiel@${BEISPIEL_DOMAIN}`, '0043 664 1234567', 'member', beispielMuster, 'ja', 'nein', 'nein', 'ja']) +
    csvRow(['Erika Beispiel', `erika.beispiel@${BEISPIEL_DOMAIN}`, '0043 664 7654321', 'admin', beispielMuster, 'ja', 'nein', 'ja', 'ja'])
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

/**
 * Wann ist eine Adresse eine Adresse? Exportiert, weil der Dialog „Benutzer
 * anlegen" dieselbe Frage stellt — er hatte ein eigenes, lockereres Muster,
 * und die beiden Anlegewege waren sich nicht einig (Audit 11/2026, VERW-12).
 */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

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

  const pruefe = (name: string, email: string, role: Role | null, aircraftTypes: string[], unknownAircraft: string[]) => {
    const problems: ImportProblem[] = []
    if (!name) problems.push('name')
    if (!email) problems.push('email')
    else if (!EMAIL.test(email)) problems.push('emailFormat')
    else {
      // Die Domainliste entscheidet auch bei der Anmeldung — eine Adresse
      // ausserhalb koennte sich nie anmelden, also gar nicht erst anlegen.
      // Dieselbe Regel wie dort (domains.ts), nicht eine dritte Fassung.
      if (!domainErlaubt(email, ctx.allowedDomains)) problems.push('emailDomain')
      if (vergeben.has(email)) problems.push('emailTaken')
      if (inDatei.has(email)) problems.push('emailDuplicate')
      inDatei.add(email)
    }
    if (!role) problems.push('role')
    if (unknownAircraft.length > 0) problems.push('aircraft')
    // Musterpflicht wie im Anlege-Dialog. Der Import kannte sie nicht und
    // legte reihenweise Konten an, die anschliessend weder Lesson Plan noch
    // Info noch Chat sehen — die Vorschau zeigte sie gruen. Geprueft wird das
    // ERGEBNIS nach dem Verwerfen unbekannter Kennungen: Wer als einziges
    // Muster ein unbekanntes nennt, steht danach ohne alles da.
    if (role && musterFehlt({ role, aircraftTypes })) problems.push('aircraftMissing')
    return problems
  }

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

    // Beispielzeile: steht allein, alles andere waere Laerm („Domain nicht
    // freigegeben" fuer eine Zeile, die ohnehin uebersprungen wird). Sie
    // zaehlt auch nicht als schon vorhandene Adresse fuer spaetere Zeilen.
    const problems: ImportProblem[] = istBeispielAdresse(email) ? ['example'] : pruefe(name, email, role, aircraftTypes, unknownAircraft)

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
 *
 * Diese Abwaegung traegt aber nur, solange noch ein Muster uebrig bleibt.
 * Bleibt keines, ist das Ergebnis kein unvollstaendiger Nutzer, sondern ein
 * blinder — `aircraftMissing` blockiert deshalb, `aircraft` allein nicht.
 */
export function isImportable(row: ImportRow): boolean {
  return row.problems.every((p) => p === 'aircraft')
}

/* ===================== Anlegen ===================== */

/** Was aus einer Vorschauzeile angelegt wird. */
export type ImportEingabe = Pick<User, 'name' | 'email' | 'phone' | 'role' | 'aircraftTypes' | 'canGrade' | 'isTrainee' | 'canEditDirectory' | 'active'>

/**
 * In welche der gewaehlten Gruppen kommt diese Zeile?
 *
 * Nur in die, die sie auch betreten kann (aircraftScope, erreichbare
 * Gruppen). Eine CL30-Gruppe fuer ein C560-Mitglied waere eine
 * Mitgliedschaft, die die Pflicht erfuellt und den Zweck verfehlt.
 */
export function importZielgruppen<G extends Pick<Group, 'id' | 'aircraftType'>>(
  settings: Settings,
  zeile: Pick<ImportRow, 'role' | 'aircraftTypes' | 'canGrade' | 'canEditDirectory'>,
  gruppen: G[],
  groupIds: string[],
): G[] {
  const role = zeile.role
  if (!role) return []
  return gruppen.filter((g) => groupIds.includes(g.id) && gruppenTauglich(settings, { ...zeile, role }, g))
}

/**
 * Braucht die Zeile eine Gruppe, und hat sie keine erreichbare? Dann wird
 * sie NICHT angelegt — wie im Dialog „Benutzer anlegen". Der Import kannte
 * die Pflicht gar nicht und legte reihenweise Konten in einem Zustand an,
 * den jeder andere Schreibweg verbietet (Audit 11/2026, VERW-07). Der
 * Training Admin hat keinen Chat und braucht keine Gruppe.
 */
export function importOhneGruppe(
  settings: Settings,
  zeile: Pick<ImportRow, 'role' | 'aircraftTypes' | 'canGrade' | 'canEditDirectory'>,
  gruppen: Pick<Group, 'id' | 'aircraftType'>[],
  groupIds: string[],
): boolean {
  const role = zeile.role
  if (!role || !gruppenPflicht(settings, { ...zeile, role })) return false
  return importZielgruppen(settings, zeile, gruppen, groupIds).length === 0
}

/**
 * Die Zeilen anlegen — als reine Rechnung, damit Vorschau und Store
 * dieselbe Antwort geben.
 *
 * Doppelte Adressen, nicht freigegebene Domains, fehlende Muster und
 * fehlende erreichbare Gruppen werden HIER noch einmal abgewiesen: Die
 * Vorschau prueft gegen den Stand beim Hochladen, aber zwischen Vorschau und
 * Klick kann sich in einem zweiten Tab etwas geaendert haben.
 */
export function importPlanen<G extends Group>(
  bestand: { users: User[]; groups: G[]; settings: Settings },
  zeilen: ImportEingabe[],
  groupIds: string[],
  neueId: () => string,
): { neue: User[]; groups: G[] } {
  const vergeben = new Set(bestand.users.map((u) => u.email.trim().toLowerCase()))
  const neue: User[] = []
  const mitglieder = new Map<string, string[]>()
  for (const z of zeilen) {
    const mail = z.email.trim().toLowerCase()
    if (!mail || vergeben.has(mail)) continue
    // Beispielzeilen auch hier nicht — selbst wenn jemand `.invalid` als
    // Login-Domain eingetragen haette.
    if (istBeispielAdresse(mail)) continue
    if (!domainErlaubt(mail, bestand.settings.allowedDomains)) continue
    if (musterFehlt(z)) continue
    if (importOhneGruppe(bestand.settings, z, bestand.groups, groupIds)) continue
    vergeben.add(mail)
    const id = neueId()
    neue.push({
      id,
      name: z.name.trim(),
      email: mail,
      phone: z.phone.trim(),
      role: z.role,
      canEditDirectory: z.canEditDirectory,
      canGrade: z.canGrade,
      isTrainee: z.isTrainee,
      aircraftTypes: z.aircraftTypes,
      active: z.active,
    })
    for (const g of importZielgruppen(bestand.settings, z, bestand.groups, groupIds)) {
      mitglieder.set(g.id, [...(mitglieder.get(g.id) ?? []), id])
    }
  }
  const groups = bestand.groups.map((g) => (mitglieder.has(g.id) ? { ...g, memberIds: [...g.memberIds, ...mitglieder.get(g.id)!] } : g))
  return { neue, groups }
}
