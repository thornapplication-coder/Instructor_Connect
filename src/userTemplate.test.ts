import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import de from './i18n/de.json'
import { BEISPIEL_DOMAIN, IMPORT_COLUMNS, parseUserImport, VORLAGE_CSV, VORLAGE_XLSX } from './userImport'

/**
 * Die Spalten des Massenimports stehen an ZWEI Stellen: in `IMPORT_COLUMNS`
 * (daraus entsteht die CSV-Vorlage) und in der mitgelieferten Excel-Datei
 * `public/Instructor-Connect-Benutzer-Vorlage.xlsx`.
 *
 * Gesichert war das bisher durch einen `ACHTUNG`-Kommentar — also durch
 * Disziplin. Genau davon lebt dieses Projekt sonst nicht: Wer eine Spalte
 * umbenennt und die Excel-Datei vergisst, merkt es erst, wenn eine ATO
 * hundertfuenfzig Zeilen ausgefuellt hat und der Import die Kopfzeile nicht
 * wiedererkennt.
 *
 * Der Test liest die Kopfzeile direkt aus der ausgelieferten Datei. Neu
 * gebaut wird sie mit `python3 scripts/benutzer-vorlage.py`; das Skript zieht
 * die Spalten aus derselben Quelle, sodass ein Lauf den Test wieder gruen
 * macht.
 */

/** Einen Eintrag aus einer ZIP-Datei holen — ueber das zentrale Verzeichnis. */
function ausZip(datei: Buffer, name: string): string {
  // Das Ende des zentralen Verzeichnisses steht am Dateiende (Signatur
  // PK\x05\x06). Von dort ausgehend sind Offset und Groessen verlaesslich —
  // die lokalen Kopfsaetze duerfen sie laut Format offenlassen.
  let eocd = datei.length - 22
  while (eocd >= 0 && datei.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('kein ZIP-Verzeichnis gefunden')
  const anzahl = datei.readUInt16LE(eocd + 10)
  let p = datei.readUInt32LE(eocd + 16)

  for (let i = 0; i < anzahl; i++) {
    const nameLen = datei.readUInt16LE(p + 28)
    const extraLen = datei.readUInt16LE(p + 30)
    const kommentarLen = datei.readUInt16LE(p + 32)
    const eintrag = datei.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    if (eintrag === name) {
      const verfahren = datei.readUInt16LE(p + 10)
      const packGroesse = datei.readUInt32LE(p + 20)
      const start = datei.readUInt32LE(p + 42)
      // Der lokale Kopfsatz traegt eigene Laengen — der Inhalt beginnt
      // dahinter, nicht am Offset selbst.
      const lNameLen = datei.readUInt16LE(start + 26)
      const lExtraLen = datei.readUInt16LE(start + 28)
      const von = start + 30 + lNameLen + lExtraLen
      const roh = datei.subarray(von, von + packGroesse)
      return (verfahren === 0 ? roh : inflateRawSync(roh)).toString('utf8')
    }
    p += 46 + nameLen + extraLen + kommentarLen
  }
  throw new Error(`Eintrag ${name} fehlt`)
}

/**
 * XML-Text lesbar machen. openpyxl schreibt Nicht-ASCII als
 * Zeichenreferenz („f&#252;r"); ohne Umwandlung saehe ein Test auf
 * Umschreibungen nie ein „ü" — und einer auf „für" nie einen Treffer.
 */
function entschluesseln(xml: string): string {
  return xml
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** Die Texte einer Zeile eines Arbeitsblattes (Inline-Strings). */
function zeile(xml: string, nr: number): string[] {
  const treffer = new RegExp(`<row[^>]*r="${nr}"[^>]*>([\\s\\S]*?)<\\/row>`).exec(xml)
  if (!treffer) throw new Error(`keine Zeile ${nr} im Blatt`)
  return [...treffer[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => entschluesseln(m[1]))
}

/** Die Texte der ersten Zeile eines Arbeitsblattes. */
function kopfzeile(xml: string): string[] {
  return zeile(xml, 1)
}

/** Alle sichtbaren Texte eines Blattes. */
function texte(xml: string): string {
  return [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => entschluesseln(m[1])).join('\n')
}

// Der Dateiname kommt aus derselben Konstante wie der Download-Knopf — eine
// umbenannte Datei faellt hier auf statt erst beim 404 im Admin-Panel.
const VORLAGE = `public/${VORLAGE_XLSX}`
const BLAETTER = ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']

describe('Excel-Vorlage und Import-Spalten', () => {
  const datei = readFileSync(VORLAGE)

  it('fuehrt im Blatt „Benutzer" genau die Spalten des Imports', () => {
    // sheet2 ist „Benutzer" — die Reihenfolge der Blaetter legt das
    // Erzeugungsskript fest (Anleitung, Benutzer, Muster).
    const kopf = kopfzeile(ausZip(datei, 'xl/worksheets/sheet2.xml'))
    expect(kopf).toEqual([...IMPORT_COLUMNS])
  })

  it('nennt die Musterspalte als Pflicht fuer die gebundenen Rollen', () => {
    // Der Hinweistext ist kein Beiwerk: Stand dort „Leer = keines", legte
    // eine ATO reihenweise Mitglieder an, die anschliessend weder Lesson
    // Plan noch Info noch Chat sehen.
    const anleitung = ausZip(datei, 'xl/worksheets/sheet1.xml')
    expect(anleitung).toContain('AircraftTypes')
    expect(texte(anleitung)).toMatch(/PFLICHT für member und admin/)
    expect(anleitung).not.toMatch(/Leer = keines/)
  })

  it('liefert die gueltigen Musterkennungen zum Abschreiben mit', () => {
    const muster = ausZip(datei, 'xl/worksheets/sheet3.xml')
    expect(muster).toContain('CL30')
    expect(muster).toContain('C560 XLS+')
  })
})

/**
 * Die Datei geht an Personalabteilungen (Audit 11/2026, VERW-08, TPL-01,
 * EXM-06, EXM-03, EXM-10, VERW-06). Vorher: 28 Umschreibungen statt
 * Umlauten, kein Druckformat (die Anleitung zerfiel auf neun Seiten),
 * „Erlaubte Domains" statt des Namens in der App, Bibliotheksvorgaben in den
 * Eigenschaften — und zwei Beispielzeilen auf der echten Domain, die als
 * Konten angelegt wurden.
 */
describe('Excel-Vorlage als ausgehende Datei', () => {
  const datei = readFileSync(VORLAGE)

  it('schreibt Umlaute statt Umschreibungen', () => {
    const alles = BLAETTER.map((b) => texte(ausZip(datei, b))).join('\n')
    // Wortanfaenge statt Teilwoerter: „grauen" oder „neue" sind keine
    // Umschreibungen, „fuer", „Pruefen" und „Loeschen" schon.
    const umschrift = /\b(fuer|ueber|koenn|waehl|pruef|aender|zaehl|uebrig|gueltig|loesch|ausfuell|behoerd|schraeg|zustaendig|ergaeb|unabhaengig|endgueltig|haeng|saeh|waere|gross\b)\w*/i
    expect(alles.match(umschrift)).toBeNull()
    expect(alles).toContain('für')
    expect(alles).toContain('Prüfen')
  })

  it('nennt die Einstellung so wie die App', () => {
    expect(texte(ausZip(datei, 'xl/worksheets/sheet1.xml'))).toContain(`Einstellungen → ${de.admin.domains}`)
  })

  it('druckt jedes Blatt quer auf Seitenbreite', () => {
    for (const b of BLAETTER) {
      const xml = ausZip(datei, b)
      expect(xml).toMatch(/<pageSetUpPr[^>]*fitToPage="1"/)
      const druck = /<pageSetup [^>]*>/.exec(xml)?.[0] ?? ''
      expect(druck).toContain('fitToWidth="1"')
      expect(druck).toContain('fitToHeight="0"')
      expect(druck).toContain('orientation="landscape"')
    }
  })

  it('traegt Titel und keine Bibliotheksvorgaben in den Eigenschaften', () => {
    const core = entschluesseln(ausZip(datei, 'docProps/core.xml'))
    expect(core).toMatch(/<dc:title[^>]*>Instructor Connect – Benutzer-Vorlage<\/dc:title>/)
    // Fester Zeitstempel: Ein Neubau ohne inhaltliche Aenderung ergibt
    // dieselbe Datei, ein Diff bedeutet also etwas.
    expect(core).toMatch(/<dcterms:modified[^>]*>2026-01-01T00:00:00Z</)
    expect(ausZip(datei, 'docProps/app.xml')).not.toMatch(/openpyxl/i)
  })

  it('die Beispielzeilen werden beim Import als Beispiel erkannt und uebersprungen', () => {
    const blatt = ausZip(datei, 'xl/worksheets/sheet2.xml')
    const csv = [2, 3].map((nr) => zeile(blatt, nr).join(';'))
    const r = parseUserImport([IMPORT_COLUMNS.join(';'), ...csv].join('\n'), {
      existing: [],
      allowedDomains: ['aviationacademy.at'],
      aircraftTypes: ['CL30', 'C560 XLS+'],
    })
    expect(r.rows).toHaveLength(2)
    expect(r.rows.every((z) => z.email.endsWith(`@${BEISPIEL_DOMAIN}`))).toBe(true)
    expect(r.rows.map((z) => z.problems)).toEqual([['example'], ['example']])
    // Telefon ohne führendes „+" — das liest Excel als Formelbeginn (TPL-02).
    expect(r.rows.map((z) => z.phone)).toEqual(['0043 664 1234567', '0043 664 7654321'])
  })

  it('beide Vorlagen folgen einem Namensschema', () => {
    expect(VORLAGE_CSV.replace(/\.csv$/, '')).toBe(VORLAGE_XLSX.replace(/\.xlsx$/, ''))
  })
})
