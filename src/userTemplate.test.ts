import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { IMPORT_COLUMNS } from './userImport'

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

/** Die Texte der ersten Zeile eines Arbeitsblattes. */
function kopfzeile(xml: string): string[] {
  const zeile = /<row[^>]*r="1"[^>]*>([\s\S]*?)<\/row>/.exec(xml)
  if (!zeile) throw new Error('keine erste Zeile im Blatt')
  return [...zeile[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1])
}

const VORLAGE = 'public/Instructor-Connect-Benutzer-Vorlage.xlsx'

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
    expect(anleitung).toMatch(/PFLICHT fuer member und admin/)
    expect(anleitung).not.toMatch(/Leer = keines/)
  })

  it('liefert die gueltigen Musterkennungen zum Abschreiben mit', () => {
    const muster = ausZip(datei, 'xl/worksheets/sheet3.xml')
    expect(muster).toContain('CL30')
    expect(muster).toContain('C560 XLS+')
  })
})
