import { defineConfig } from 'vitest/config'

/**
 * Prüfstand für die reine Logik (Ebene 1).
 *
 * Getestet wird, was ohne React und ohne Browser auskommt: die Regeln des
 * Grading-Moduls, die Kennzahlen, der CSV-Export und der Inhalts-Fingerabdruck.
 * Genau dort sitzen die Zusagen, die ein Schulungsnachweis einlösen muss —
 * und genau dort war in den Audits mehrfach etwas falsch.
 *
 * Zur Abdeckungsschwelle: `include` erfasst ABSICHTLICH alle Logik-Module in
 * src/ und nicht eine gepflegte Liste. Eine neue Datei fällt damit von selbst
 * unter die Schwelle und lässt den Lauf scheitern, solange sie ungetestet ist —
 * andernfalls würde neue Logik still an der Prüfung vorbeiwachsen.
 *
 * Die Ausnahmen unten sind keine Freibriefe, sondern Vormerkungen für Ebene 2:
 * Sie brauchen eine Browser-Umgebung (IndexedDB, fetch, DOM), die hier bewusst
 * noch fehlt. Wer eine Datei hier einträgt, muss den Grund danebenschreiben.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/*.ts'],
      exclude: [
        'src/types.ts', // nur Typen und Konstanten, keine Logik
        'src/vite-env.d.ts', // Typdeklaration
        'src/persist.ts', // Ebene 2: braucht IndexedDB (fake-indexeddb)
        'src/net.ts', // Ebene 2: braucht fetch/Service-Worker
        'src/editGuard.ts', // Ebene 2: React-Hook plus DOM
        'src/useIsDesktop.ts', // Ebene 2: React-Hook plus matchMedia
      ],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
      reporter: ['text-summary'],
    },
  },
})
