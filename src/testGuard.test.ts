import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Die wichtigste Regel dieses Repos steht in CLAUDE.md: „Neue Logik kommt mit
 * Tests — ausnahmslos." Abgesichert war sie angeblich mechanisch, über die
 * Abdeckungsschwelle in vitest.config.ts: Eine neue, ungetestete Datei falle
 * damit von selbst unter die Schwelle und lasse `npm test` scheitern.
 *
 * **Das stimmte nicht.** Nachgemessen: eine neue Datei `src/probe.ts` mit
 * ungetesteter Logik angelegt, `npm test` ausgeführt — 244 Tests grün, keine
 * Meldung. Der Grund liegt im v8-Provider: Er misst, was ausgeführt WURDE.
 * Eine Datei, die kein Test importiert, taucht in der Auswertung gar nicht
 * erst auf und kann deshalb auch keine Schwelle reißen. Die Schwelle bewacht
 * die Qualität der Tests, die es gibt — nicht ihre Existenz.
 *
 * Der Fehler war teuer, weil er unsichtbar war: Die Zusage stand im Kommentar
 * der Konfiguration, in CLAUDE.md und im README, und niemand hatte Anlass,
 * sie zu prüfen. Genau davor soll die Regel ja schützen.
 *
 * Dieser Test schließt die Lücke direkt: Er zählt die Logik-Module und
 * verlangt zu jedem eine Testdatei. Zwei Ebenen sind erlaubt — `X.test.ts`
 * (reine Logik) oder `X.dom.test.ts` (braucht Browser-Umgebung).
 */

// Ueber Vite einlesen statt ueber Node-Dateizugriff — der Glob erfasst
// automatisch jede neue Datei, ohne dass jemand eine Liste pflegen muss.
//
// Dazu die Logik der Module unter src/modules/ (DocCheck). Der Glob stand
// nur auf `./*.ts` — ein ganzes Modul in einem Unterordner waere damit von
// der Regel befreit gewesen, ohne dass es jemand merkt. Genau die Luecke,
// die diese Datei schliessen soll, nur eine Ebene tiefer.
const module = {
  ...import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('./modules/**/*.ts', { query: '?raw', import: 'default', eager: true }),
  // Backend-Anbindung (Phase 1b) — dieselbe Regel, sonst wäre gerade die
  // Anmeldung die eine Logik ohne Pflicht-Test.
  ...import.meta.glob('./backend/**/*.ts', { query: '?raw', import: 'default', eager: true }),
  // Sandbox-Bestand: `createSeedState` baut jeden neuen Stand, den
  // `migrateState` und „Sandbox zurücksetzen" benutzen; dort lagen eine
  // Gruppe, die ihr Mitglied nicht betreten konnte, und eine Nachricht
  // darin (KERN-07) — ohne dass eine Wache es verlangt hätte (Audit 11/2026,
  // TEC-18).
  ...import.meta.glob('./sandbox/*.ts', { query: '?raw', import: 'default', eager: true }),
}
const dateien = Object.keys(module).map((p) => p.replace('./', ''))

/**
 * Reine Logik in `.tsx`-Dateien.
 *
 * Beide Wachen globten auf `.ts` — wer eine Rechenfunktion in eine
 * Seitendatei schrieb, war damit von der Regel befreit, ohne es zu merken.
 * Gefunden wurden `kurzeZeit` (ChatList) und `readDrafts` (Grading), später
 * `gradeColor` (Grading), `parseImprint` (Imprint) und
 * `encodeChain`/`decodeChain` (GradingForm): reine Funktionen, exportiert,
 * ohne Test. Die Dateiendung ist kein Grund.
 *
 * Hier stand bis Audit 11/2026 (TEC-18) eine leere Liste, und der Test
 * prüfte nur, dass sie leer ist — nicht, ob es solche Logik gibt. Jetzt
 * sucht er sie: jede exportierte Funktion mit kleinem Anfangsbuchstaben
 * (`export function x` oder `export const x = (…) =>`) in jeder `.tsx` unter
 * `src/`. Ausgenommen sind Hooks (`use…`) — sie brauchen React und gehören
 * in die Ansicht — und Komponenten (großer Anfangsbuchstabe). Konstanten,
 * die keine Funktion sind (Klassenketten wie `selectCls`), rechnen nichts.
 *
 * Gegenprobe: `export function rechne() {}` in eine Seite geschrieben →
 * „keine exportierte Logik in .tsx ohne Freigabe" wird rot; der Test
 * „erkennt Logik in .tsx" hält dasselbe an einem Beispiel fest.
 *
 * Wandern soll solche Logik nach `src/*.ts`. Was bleibt, steht hier mit
 * Grund — und der lautet „braucht Browser-Umgebung (Ebene 2)".
 */
const tsxQuellen = import.meta.glob(['./**/*.tsx', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })

const FREIGEGEBEN: Record<string, string> = {
  'components/Toast.tsx:toast': 'Bote an den ToastHost (Komponente, Modulzustand) — braucht Browser-Umgebung (Ebene 2)',
  'components/ui.tsx:initTheme': 'liest localStorage, setzt data-theme und theme-color am Dokument — braucht Browser-Umgebung (Ebene 2)',
  'router.tsx:navigate': 'schreibt location.hash — braucht Browser-Umgebung (Ebene 2)',
  'router.tsx:scrollToTop': 'rollt Fenster und Dokument — braucht Browser-Umgebung (Ebene 2)',
}

/** Exportierte Funktionen mit kleinem Anfangsbuchstaben, außer Hooks. */
function logikInTsx(code: string, datei = 'x.tsx'): string[] {
  const quelle = ts.createSourceFile(datei, code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)
  const exportiert = (n: ts.Node) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  const istLogikName = (name: string) => /^[a-z]/.test(name) && !/^use[A-Z]/.test(name)
  const namen: string[] = []
  for (const st of quelle.statements) {
    if (!exportiert(st)) continue
    if (ts.isFunctionDeclaration(st) && st.name && istLogikName(st.name.text)) namen.push(st.name.text)
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer
        if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && istLogikName(d.name.text)) namen.push(d.name.text)
      }
    }
  }
  return namen
}

const gefundeneTsxLogik = Object.entries(tsxQuellen).flatMap(([pfad, code]) =>
  logikInTsx(code as string, pfad).map((name) => `${pfad.replace('./', '')}:${name}`),
)

/**
 * Wer hier steht, braucht keinen Test — und der Grund steht daneben.
 * Eine Zeile hinzuzufügen ist eine bewusste Entscheidung, kein Versehen.
 */
const OHNE_TEST: Record<string, string> = {
  'types.ts': 'nur Typen und Konstanten, keine Logik',
  'vite-env.d.ts': 'Typdeklaration',
  'modules/doccheck/types.ts': 'nur Typen, keine Logik',
  'modules/doccheck/parse/model.ts': 'nur Typen und Konstanten (Datenmodell Spez. 7.1), keine Logik',
}

const istTestdatei = (f: string) => f.endsWith('.test.ts') || f.endsWith('.dom.test.ts')

describe('Jede Logik hat ihren Test', () => {
  it('findet ueberhaupt Module (sonst prueft der Glob ins Leere)', () => {
    expect(dateien.filter((f) => !istTestdatei(f)).length).toBeGreaterThan(10)
    // ... und zwar auch die in Unterordnern der Module.
    expect(dateien.filter((f) => f.startsWith('modules/doccheck/llm/') && !istTestdatei(f)).length).toBeGreaterThan(0)
    // ... und den Sandbox-Bestand (TEC-18).
    expect(dateien).toContain('sandbox/seed.ts')
  })

  it('laesst kein Logik-Modul ohne Testdatei', () => {
    const ohne = dateien
      .filter((f) => !istTestdatei(f))
      .filter((f) => !(f in OHNE_TEST))
      .filter((f) => {
        const basis = f.replace(/\.ts$/, '')
        return !dateien.includes(`${basis}.test.ts`) && !dateien.includes(`${basis}.dom.test.ts`)
      })
    expect(ohne).toEqual([])
  })

  it('erkennt Logik in .tsx — und nur Logik', () => {
    const beispiel = [
      'export function rechne(a: number) { return a * 2 }',
      'export const kuerze = (s: string) => s.slice(0, 3)',
      'export const formatiere = function (s: string) { return s }',
      'export function Karte() { return null }',
      'export function useZaehler() { return 1 }',
      "export const selectCls = 'w-full'",
      'function intern() { return 1 }',
      "export { rechne as weiter } from './x'",
    ].join('\n')
    expect(logikInTsx(beispiel)).toEqual(['rechne', 'kuerze', 'formatiere'])
  })

  it('keine exportierte Logik in .tsx ohne Freigabe', () => {
    // Wer hier rot wird: die Funktion nach src/*.ts ziehen und dort testen.
    // Eine Freigabe ist nur, was ohne Browser nicht prüfbar ist.
    expect(Object.keys(tsxQuellen).length).toBeGreaterThan(20)
    expect(gefundeneTsxLogik.filter((f) => !(f in FREIGEGEBEN))).toEqual([])
  })

  it('keine verwaiste Freigabe für Logik in .tsx', () => {
    // Ist die Funktion verlegt oder gelöscht, gilt die Freigabe sonst still
    // für die nächste gleichen Namens.
    expect(Object.keys(FREIGEGEBEN).filter((f) => !gefundeneTsxLogik.includes(f))).toEqual([])
  })

  it('haelt die Ausnahmeliste sauber — kein Eintrag fuer eine geloeschte Datei', () => {
    // Eine Ausnahme fuer eine Datei, die es nicht mehr gibt, ist eine
    // Freigabe, die niemand mehr liest. Sie waere beim naechsten Modul
    // gleichen Namens still wirksam.
    const verwaist = Object.keys(OHNE_TEST).filter((f) => !dateien.includes(f))
    expect(verwaist).toEqual([])
  })
})

/**
 * Befund aus dem Audit: `formatDate`/`formatDateTime` — das Datumsformat der
 * ganzen App — standen in `src/pages/Grading.tsx`. Zwoelf Module zogen sie
 * von dort, ein Test existierte nicht, und diese Wache konnte ihn nicht
 * verlangen: Sie prueft nur `src/*.ts`. Die Regel „Logik gehoert nach
 * src/*.ts" braucht deshalb ihre Kehrseite als Pruefung.
 */
describe('Logik-Module bleiben unter sich', () => {
  it('kein Modul in src/*.ts oder src/modules/ importiert aus src/pages', () => {
    const verstoesse = Object.entries(module)
      .filter(([pfad]) => !istTestdatei(pfad.replace('./', '')))
      .filter(([, inhalt]) => /from '(\.\/|(\.\.\/)+)pages\//.test(inhalt as string))
      .map(([pfad]) => pfad.replace('./', ''))
    expect(verstoesse).toEqual([])
  })
})
