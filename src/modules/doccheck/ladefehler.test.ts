import { afterEach, describe, expect, it, vi } from 'vitest'
import { istLadefehler } from './ladefehler'

/**
 * Ebene 1: Ladefehler oder Fehler im Code? (Audit 11/2026, TEC-08/TEC-19)
 *
 * Daran hängt, ob „Erneut versuchen" die Seite neu lädt (nur das hilft nach
 * einem gescheiterten Nachladen) oder bloß die Fehlergrenze zurücksetzt
 * (ein Neuladen verwürfe sonst die Sitzungsdokumente).
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('istLadefehler', () => {
  it('erkennt die Meldungen aller drei Browser-Engines beim dynamischen Import', () => {
    expect(istLadefehler(new TypeError('Failed to fetch dynamically imported module: https://x/assets/DocCheckApp-a1.js'), true)).toBe(true)
    expect(istLadefehler(new TypeError('error loading dynamically imported module: https://x/assets/DocCheckApp-a1.js'), true)).toBe(true)
    expect(istLadefehler(new TypeError('Importing a module script failed.'), true)).toBe(true)
    expect(istLadefehler(new Error('Unable to preload CSS for /assets/DocCheckApp-a1.css'), true)).toBe(true)
  })

  it('nimmt den eigenen Code DC-LOAD an, auch als Zeichenkette', () => {
    expect(istLadefehler(new Error('DC-LOAD'), true)).toBe(true)
    expect(istLadefehler('DC-LOAD: xlsx', true)).toBe(true)
    // Andere DC-Codes sind eigene Meldungen, keine Ladefehler.
    expect(istLadefehler(new Error('DC-PARSE'), true)).toBe(false)
  })

  it('ein Renderfehler ist kein Ladefehler — auch nicht, wenn er ein TypeError ist', () => {
    expect(istLadefehler(new TypeError("Cannot read properties of undefined (reading 'docs')"), true)).toBe(false)
    expect(istLadefehler(new TypeError("Cannot read properties of undefined (reading 'docs')"), false)).toBe(false)
    expect(istLadefehler(new Error('DC-TEST'), false)).toBe(false)
  })

  it('ein reiner Netzfehler zählt nur offline — online kann er alles Mögliche heißen', () => {
    for (const m of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'net::ERR_INTERNET_DISCONNECTED']) {
      expect(istLadefehler(new TypeError(m), false)).toBe(true)
      expect(istLadefehler(new TypeError(m), true)).toBe(false)
    }
  })

  it('ohne Fehler oder ohne Meldung: kein Ladefehler', () => {
    expect(istLadefehler(null, false)).toBe(false)
    expect(istLadefehler(undefined, false)).toBe(false)
    expect(istLadefehler(42, false)).toBe(false)
    expect(istLadefehler({ message: 7 }, false)).toBe(false)
  })

  it('entscheidet an der Meldung, nicht am Prototyp (Fehler nach postMessage)', () => {
    expect(istLadefehler({ name: 'TypeError', message: 'Failed to fetch dynamically imported module: x' }, true)).toBe(true)
  })

  it('fragt ohne Angabe den Browser, ob er online ist', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(istLadefehler(new TypeError('Failed to fetch'))).toBe(true)
    vi.stubGlobal('navigator', { onLine: true })
    expect(istLadefehler(new TypeError('Failed to fetch'))).toBe(false)
    // In Node (und im Worker ohne navigator.onLine) zählen nur die eindeutigen Meldungen.
    vi.stubGlobal('navigator', undefined)
    expect(istLadefehler(new TypeError('Failed to fetch'))).toBe(false)
    expect(istLadefehler(new TypeError('Importing a module script failed.'))).toBe(true)
  })
})
