import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

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
