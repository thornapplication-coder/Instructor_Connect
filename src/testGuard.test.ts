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
const module = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true })
const dateien = Object.keys(module).map((p) => p.replace('./', ''))

/**
 * Reine Logik in `.tsx`-Dateien.
 *
 * Beide Wachen globten auf `.ts` — wer eine Rechenfunktion in eine
 * Seitendatei schrieb, war damit von der Regel befreit, ohne es zu merken.
 * Gefunden wurden `kurzeZeit` (ChatList) und `readDrafts` (Grading): reine
 * Funktionen, exportiert, ohne Test. Die Dateiendung ist kein Grund.
 *
 * Wandern soll solche Logik nach `src/*.ts`; bis dahin steht sie hier
 * namentlich, damit sie nicht in Vergessenheit geraet.
 */
const LOGIK_IN_TSX: Record<string, string> = {}

/**
 * Wer hier steht, braucht keinen Test — und der Grund steht daneben.
 * Eine Zeile hinzuzufügen ist eine bewusste Entscheidung, kein Versehen.
 */
const OHNE_TEST: Record<string, string> = {
  'types.ts': 'nur Typen und Konstanten, keine Logik',
  'vite-env.d.ts': 'Typdeklaration',
  'net.ts': 'Ebene 2 offen: braucht eine Service-Worker-Registrierung, nicht nur fetch',
}

const istTestdatei = (f: string) => f.endsWith('.test.ts') || f.endsWith('.dom.test.ts')

describe('Jede Logik hat ihren Test', () => {
  it('findet ueberhaupt Module (sonst prueft der Glob ins Leere)', () => {
    expect(dateien.filter((f) => !istTestdatei(f)).length).toBeGreaterThan(10)
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

  it('duldet keine unbelegte Ausnahme fuer Logik in .tsx', () => {
    // Die Liste ist absichtlich leer: Wer Logik in eine Seitendatei schreibt,
    // zieht sie nach src/*.ts um, statt hier einen Eintrag anzulegen.
    expect(Object.keys(LOGIK_IN_TSX)).toEqual([])
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
  it('kein Modul in src/*.ts importiert aus src/pages', () => {
    const verstoesse = Object.entries(module)
      .filter(([pfad]) => !istTestdatei(pfad.replace('./', '')))
      .filter(([, inhalt]) => /from '\.\/pages\//.test(inhalt as string))
      .map(([pfad]) => pfad.replace('./', ''))
    expect(verstoesse).toEqual([])
  })
})
