import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Prüfstand in zwei Ebenen.
 *
 * **Ebene 1 — reine Logik** (`*.test.ts`, Umgebung `node`): Was ohne React
 * und ohne Browser auskommt — die Regeln des Grading-Moduls, die Kennzahlen,
 * der CSV-Export, der Inhalts-Fingerabdruck. Genau dort sitzen die Zusagen,
 * die ein Schulungsnachweis einlösen muss, und genau dort war in den Audits
 * mehrfach etwas falsch.
 *
 * **Ebene 2 — Komponenten und Speicher** (`*.test.tsx` und `*.dom.test.ts`,
 * Umgebung `jsdom`): Was eine Browser-Umgebung braucht — IndexedDB,
 * `matchMedia`, `fetch`, DOM. Diese Ebene stand lange als Vormerkung in
 * CLAUDE.md; die betroffenen Module waren solange von der Abdeckung
 * ausgenommen.
 *
 * Die Trennung ist Absicht und nicht Bequemlichkeit: Liefe Ebene 1 ebenfalls
 * unter jsdom, könnte ein Logik-Modul unbemerkt vom DOM abhängig werden und
 * der Lauf bliebe grün. Die Ausnahmeliste unten ist entsprechend kurz
 * geworden — was dort noch steht, trägt seinen Grund daneben.
 *
 * Zur Abdeckungsschwelle — und zu einer Zusage, die hier lange falsch stand:
 * Die Schwelle bewacht die QUALITÄT der vorhandenen Tests, nicht ihre
 * EXISTENZ. Der v8-Provider misst, was ausgeführt wurde; eine Datei, die kein
 * Test importiert, taucht in der Auswertung gar nicht erst auf und kann
 * deshalb auch keine Schwelle reißen. Nachgemessen: eine neue Datei mit
 * ungetesteter Logik angelegt, `npm test` blieb grün.
 *
 * Dass jede Logik überhaupt einen Test hat, prüft deshalb `testGuard.test.ts`
 * — Datei für Datei, mit benannten Ausnahmen. Die beiden zusammen halten,
 * was hier vorher allein behauptet wurde.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'logik',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          // Ebene 2 hat eigene Endungen, damit die Zuordnung am Dateinamen
          // ablesbar ist statt in einer Liste zu stehen.
          exclude: ['src/**/*.dom.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'ebene2',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.dom.test.ts', 'src/**/*.test.tsx'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/*.ts'],
      exclude: [
        'src/types.ts', // nur Typen und Konstanten, keine Logik
        'src/vite-env.d.ts', // Typdeklaration
        'src/net.ts', // Ebene 2 offen: braucht Service-Worker-Registrierung, nicht nur fetch
      ],
      // perFile ist der Kern der Zusage: Ohne diesen Schalter wertet v8 nur
      // die GESAMTSUMME, und eine kleine ungetestete Datei verschwindet
      // darin. Genau das war der Fall — csv.ts stand bei 68 % Lines, ohne
      // dass der Lauf rot wurde. Die Regel in CLAUDE.md gilt erst mit
      // perFile wirklich.
      thresholds: { perFile: true, lines: 90, functions: 90, statements: 90, branches: 85 },
      reporter: ['text-summary'],
    },
  },
})
