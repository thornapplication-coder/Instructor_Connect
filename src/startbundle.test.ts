import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Was das Startbundle STATISCH lädt (Audit 11/2026, CIG-03).
 *
 * CLAUDE.md sagt: Von DocCheck lädt die App nur den Einstieg statisch,
 * alles andere per `lazy` — „wer DocCheck aus dem Startbundle importiert,
 * holt Parser und Exportbibliotheken auf jedes Gerät". Eine Wache gab es
 * nicht: Ein Prüfer importierte `zipOeffnen` in store.tsx, der Build lief
 * durch, das Startbundle wuchs um 100 kB und enthielt jszip — alle Tests
 * grün. Und wörtlich stimmte die Regel schon nicht: Der Store lädt drei
 * kleine DocCheck-Module statisch (Rechte, Einstellungen, Sandbox-Bestand).
 *
 * Dieser Test bildet ohne Build die Hülle der statischen Importe ab
 * main.tsx — mit dem TypeScript-Parser, nicht mit einem Muster, damit
 * Kommentare und Zeichenketten nicht mitzählen. Nicht verfolgt werden
 * `import type`/`export type` (fallen beim Übersetzen weg) und dynamisches
 * `import()` (genau das ist das Nachladen). Verfolgt werden zusätzlich
 * `new URL('…', import.meta.url)` und `?url`-Importe: Der Service Worker
 * lädt solche Dateien vorab, sobald die Startseite sie nennt.
 *
 * Gegenprobe (11/2026): `import { zipOeffnen } from './modules/doccheck/parse/zip'`
 * in store.tsx macht beide Prüfungen unten rot.
 */

const SRC = fileURLToPath(new URL('.', import.meta.url))

/** DocCheck-Module im Startbundle — jedes mit Grund. Klein und ohne Bibliothek. */
const DOCCHECK_STATISCH: Record<string, string> = {
  'modules/doccheck/index.tsx': 'Einstieg der Kachel; lädt DocCheckApp per lazy hinter einer Fehlergrenze',
  'modules/doccheck/access.ts': 'Rechtematrix darf() — der Store setzt Rechte und zählt die Kachel',
  'modules/doccheck/settings.ts': 'Vorgaben der Einstellungen — sie liegen im Anwendungszustand',
  'modules/doccheck/library.ts': 'Sandbox-Bestand und fällige Erinnerungen — Kachelzahl der Startseite',
  'modules/doccheck/ladefehler.ts': 'erkennt im Einstieg einen Ladefehler des Moduls (TEC-08) — muss gerade dann da sein',
}

/** Bibliotheken, die nur DocCheck braucht — Megabytes, die im Startbundle jedes Gerät lüde. */
const NUR_NACHGELADEN = ['jszip', 'pdfjs-dist', 'docx', 'pptxgenjs', 'tesseract.js', '@tesseract.js-data/eng', 'minisearch']

const paketName = (s: string) => (s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0])

function aufloesen(von: string, spezifizierer: string): string | null {
  const basis = join(dirname(von), spezifizierer.split('?')[0])
  for (const k of [basis, `${basis}.ts`, `${basis}.tsx`, join(basis, 'index.ts'), join(basis, 'index.tsx')]) {
    if (existsSync(k) && statSync(k).isFile()) return k
  }
  return null
}

/** Statische Ziele eines Quelltexts: relative Pfade und Paketnamen. */
function ziele(code: string, datei: string): string[] {
  const quelle = ts.createSourceFile(datei, code, ts.ScriptTarget.Latest, true, datei.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: string[] = []
  const nurTypen = (el: readonly { isTypeOnly: boolean }[]) => el.length > 0 && el.every((e) => e.isTypeOnly)
  for (const s of quelle.statements) {
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
      const k = s.importClause
      if (k?.isTypeOnly) continue
      if (k && !k.name && k.namedBindings && ts.isNamedImports(k.namedBindings) && nurTypen(k.namedBindings.elements)) continue
      out.push(s.moduleSpecifier.text)
    } else if (ts.isExportDeclaration(s) && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier)) {
      if (s.isTypeOnly || (s.exportClause && ts.isNamedExports(s.exportClause) && nurTypen(s.exportClause.elements))) continue
      out.push(s.moduleSpecifier.text)
    }
  }
  // new URL('./x', import.meta.url): Worker und Dateien per Adresse
  const besuchen = (n: ts.Node): void => {
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'URL' && n.arguments?.length === 2) {
      const [a, b] = n.arguments
      if (ts.isStringLiteral(a) && b.getText(quelle) === 'import.meta.url') out.push(a.text)
    }
    ts.forEachChild(n, besuchen)
  }
  besuchen(quelle)
  return out
}

/** Hülle ab main.tsx: Dateien (relativ zu src/) und Pakete. */
function huelle(): { dateien: Set<string>; pakete: Map<string, string>; unaufgeloest: string[] } {
  const dateien = new Set<string>()
  const pakete = new Map<string, string>()
  const unaufgeloest: string[] = []
  const offen = [join(SRC, 'main.tsx')]
  while (offen.length) {
    const datei = offen.pop()!
    const rel = relative(SRC, datei).split('\\').join('/')
    if (dateien.has(rel)) continue
    dateien.add(rel)
    if (!/\.tsx?$/.test(datei)) continue // JSON, CSS: Blätter
    for (const z of ziele(readFileSync(datei, 'utf8'), datei)) {
      if (!z.startsWith('.')) {
        if (!pakete.has(paketName(z))) pakete.set(paketName(z), rel)
        continue
      }
      const ziel = aufloesen(datei, z)
      if (ziel) offen.push(ziel)
      else unaufgeloest.push(`${rel} → ${z}`)
    }
  }
  return { dateien, pakete, unaufgeloest }
}

describe('Startbundle (Audit 11/2026, CIG-03)', () => {
  const h = huelle()

  it('die Hülle ist vollständig aufgelöst und nicht leer', () => {
    expect(h.unaufgeloest).toEqual([])
    // Store und Router hängen dran — sonst wäre der Einstieg falsch gefunden.
    expect([...h.dateien]).toEqual(expect.arrayContaining(['main.tsx', 'App.tsx', 'store.tsx', 'router.tsx']))
    expect([...h.pakete.keys()]).toEqual(expect.arrayContaining(['react', 'react-dom']))
  })

  it('von DocCheck nur der Einstieg und die benannten kleinen Module', () => {
    const doccheck = [...h.dateien].filter((d) => d.startsWith('modules/doccheck/')).sort()
    expect(doccheck).toEqual(Object.keys(DOCCHECK_STATISCH).sort())
  })

  it('keine Bibliothek, die nur DocCheck braucht', () => {
    const verstoesse = NUR_NACHGELADEN.filter((p) => h.pakete.has(p)).map((p) => `${p} (über ${h.pakete.get(p)})`)
    expect(verstoesse).toEqual([])
  })

  it('der Parser sieht, was zählt — und übergeht, was wegfällt', () => {
    const code = [
      "import type { A } from './nur-typ'",
      "import { type B, type C } from './nur-typen'",
      "import D, { type E } from './wert-und-typ'",
      "import './seiteneffekt'",
      "export type { F } from './export-typ'",
      "export { g } from './export-wert'",
      "// import { h } from './kommentar'",
      'const s = "import x from \'./zeichenkette\'"',
      "const l = lazy(() => import('./nachgeladen'))",
      "const w = new Worker(new URL('./arbeiter.ts', import.meta.url))",
      "import url from 'pdfjs-dist/build/pdf.worker.min.mjs?url'",
    ].join('\n')
    expect(ziele(code, 'x.tsx')).toEqual(['./wert-und-typ', './seiteneffekt', './export-wert', 'pdfjs-dist/build/pdf.worker.min.mjs?url', './arbeiter.ts'])
    expect(paketName('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')).toBe('@tesseract.js-data/eng')
    expect(paketName('pdfjs-dist/build/pdf.worker.min.mjs?url')).toBe('pdfjs-dist')
  })
})
