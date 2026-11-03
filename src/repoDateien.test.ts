import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * „Keine echten OEM-Dokumente im Repo" — für DATEIEN (Audit 11/2026, CIG-01).
 *
 * Die Zusage stand in CLAUDE.md mit „der Test prüft das"; geprüft wurden
 * aber nur Titel und Nummern der Sandbox-Liste (library.test.ts). Ein Prüfer
 * legte ein Handbuch-PDF unter Herstellernamen in public/ ab: alle Wachen
 * blieben grün — und public/ geht ungefiltert in den Vorab-Cache JEDES
 * Geräts und auf die öffentliche Seite.
 *
 * Regel: PDF- und Office-Dateien tragen das Präfix `SBX-` (synthetisch, wie
 * die Abnahmedateien aus benchmark/sbx.ts) oder stehen unten namentlich mit
 * Grund. Herstellernamen sind auch mit Präfix tabu — ein „SBX-" vor einem
 * echten Handbuch macht es nicht synthetisch.
 */

const WURZEL = fileURLToPath(new URL('..', import.meta.url))

/** Nie Teil des Repos (.gitignore) oder erzeugt: Abhängigkeiten, Build, Testausgaben. */
const UEBERSPRINGEN = new Set(['.git', 'node_modules', 'dist', 'e2e/.dateien', 'test-results', 'playwright-report', 'coverage'])

const DOKUMENT = /\.(pdf|rtf|docx?|docm|dotx?|dotm|xlsx?|xlsm|xlsb|xltx?|xltm|pptx?|pptm|potx?|potm|odt|ods|odp)$/i

/** Ausnahmen vom SBX-Präfix — jede mit Grund. */
const ERLAUBT: Record<string, string> = {
  'public/sample.pdf': 'Sandbox-Platzhalter (eine Seite, Text „Dieses Dokument ist ein Sandbox-Platzhalter."), Anhang der Beispieldaten',
  'public/Instructor-Connect-Benutzer-Vorlage.xlsx': 'Import-Vorlage für Nutzer, erzeugt von scripts/benutzer-vorlage.py',
}

const HERSTELLER = /(^|[^a-z])(boeing|airbus|embraer|bombardier)([^a-z]|$)/i
const HANDBUCH = /(^|[^a-z])(fcom|qrh|fctm|afm|mel)([^a-z]|$)/i

function dokumente(ordner = WURZEL): string[] {
  const out: string[] = []
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = join(ordner, e.name)
    const rel = relative(WURZEL, pfad).split('\\').join('/')
    if (UEBERSPRINGEN.has(rel)) continue
    if (e.isDirectory()) {
      // Ein eingebetteter Arbeitsbaum (eigenes .git) ist ein eigener Bestand
      // mit eigener Wache — sonst prüfte dieser Test den Stand eines anderen
      // Zweigs mit.
      if (existsSync(join(pfad, '.git'))) continue
      out.push(...dokumente(pfad))
    } else if (DOKUMENT.test(e.name)) out.push(rel)
  }
  return out
}

/** Warum diese Datei nicht ins Repo darf — oder null. */
function verstoss(rel: string): string | null {
  const name = rel.split('/').pop()!
  if (HERSTELLER.test(name)) return `${rel}: Herstellername im Dateinamen`
  if (rel in ERLAUBT || name.startsWith('SBX-')) return null
  if (HANDBUCH.test(name)) return `${rel}: Handbuchkennung ohne SBX-Präfix`
  return `${rel}: weder SBX-Präfix noch namentliche Ausnahme`
}

describe('Dokumente im Repo (Audit 11/2026, CIG-01)', () => {
  const gefunden = dokumente()

  it('findet überhaupt etwas (sonst prüft der Lauf ins Leere)', () => {
    expect(gefunden).toEqual(expect.arrayContaining(Object.keys(ERLAUBT)))
  })

  it('nur synthetische Dokumente: SBX-Präfix oder namentliche Ausnahme, nie ein Herstellername', () => {
    expect(gefunden.map(verstoss).filter(Boolean)).toEqual([])
  })

  it('die Regel selbst: was der Prüfer ablegte, fällt durch', () => {
    expect(verstoss('public/Boeing_737_FCOM_Vol1_Rev42.pdf')).toContain('Herstellername')
    expect(verstoss('docs/Airbus_A320_FCTM_extract.docx')).toContain('Herstellername')
    expect(verstoss('docs/SBX-Airbus_FCOM.pdf')).toContain('Herstellername')
    expect(verstoss('docs/QRH_scan_page.pdf')).toContain('Handbuchkennung')
    expect(verstoss('docs/Uebersicht.xlsx')).toContain('weder SBX-Präfix')
    expect(verstoss('e2e/SBX-AFM-300.pdf')).toBeNull()
    // „camel" ist kein MEL: Kennungen zählen nur als ganze Wörter
    expect(verstoss('docs/camel.pdf')).toContain('weder SBX-Präfix')
  })

  it('jede Ausnahme gibt es noch, und der Platzhalter ist noch der Platzhalter', () => {
    // Eine Freigabe für eine gelöschte Datei wäre beim nächsten gleichen Namen still wirksam.
    for (const f of Object.keys(ERLAUBT)) expect(existsSync(join(WURZEL, f)), f).toBe(true)
    // Ersetzt jemand sample.pdf durch ein echtes Dokument, trüge es den Namen weiter.
    expect(readFileSync(join(WURZEL, 'public/sample.pdf'), 'latin1')).toContain('Sandbox-Platzhalter')
  })
})
