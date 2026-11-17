import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { schreibvorgaengeAbwarten } from '../persist'

/**
 * Gemeinsame Vorbereitung der Ebene-2-Tests.
 *
 * jsdom bringt weder IndexedDB noch `matchMedia` mit — beides braucht die App
 * beim ersten Render, und beides wird hier nachgereicht:
 *
 *  - `fake-indexeddb` als vollwertige Nachbildung. Bewusst KEIN Attrappen-
 *    Objekt mit `get`/`set`: Die Fehler, die `persist.ts` abfangen muss
 *    (abgebrochene Transaktion, fehlgeschlagenes Öffnen), entstehen erst in
 *    einer echten IndexedDB-Semantik.
 *  - `matchMedia` als schmale Nachbildung, weil jsdom sie nicht kennt und
 *    `useIsDesktop` sonst beim ersten Aufruf wirft.
 *
 * `cleanup` nach jedem Test hängt den gerenderten Baum ab. Ohne das wachsen
 * die Tests aneinander: Ein zweiter `render` fände die Elemente des ersten
 * mit, und `getByRole` schlüge mit „mehrere gefunden" fehl — an einer Stelle,
 * die mit der Ursache nichts zu tun hat.
 */

import 'fake-indexeddb/auto'

afterEach(() => {
  cleanup()
})

/*
 * Kein Schreibvorgang überlebt seine Testdatei. Synchrone Tests lassen der
 * IndexedDB-Nachbildung keinen Takt; was ein Klick zu schreiben begann, lief
 * sonst erst nach dem Abbau der Umgebung zu Ende und fand kein `window` mehr
 * — alle Tests grün, der Lauf rot, nur auf dem langsameren Runner der
 * Veröffentlichung (1.26.0). `afterAll` läuft nach den Hooks der Testdatei,
 * also mit wieder echter Uhr, und noch in der Umgebung.
 */
afterAll(async () => {
  await schreibvorgaengeAbwarten()
})

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}
