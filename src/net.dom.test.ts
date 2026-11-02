import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { networkReachable } from './net'

/**
 * Erreichbarkeitsprobe (Audit 11/2026, TEC-18).
 *
 * net.ts stand mit dem Grund „braucht eine Service-Worker-Registrierung"
 * in beiden Testwachen als Ausnahme. Das traf nie zu: Die Probe liest nur
 * `navigator.onLine` und schickt ein `fetch` — beides lässt sich ersetzen.
 * Dass HEAD am Service Worker vorbeigeht, ist dessen Regel (swQuelle.ts
 * fasst nur GET an, swQuelle.test.ts „Abruf"); hier zählt, was die Probe als
 * Beleg für „erreichbar" gelten lässt — dafür wurde sie gebaut: Mit
 * `navigator.onLine` allein stand ein Datensatz im Ausgangskorb nach dem
 * Laden auf „sent", ohne dass eine Anfrage hinausging, und eine
 * Anmeldeseite im Gäste-WLAN beantwortet jede Adresse mit 200/HTML.
 */

function antwort(status: number, typ: string | null): Response {
  return new Response(null, { status, headers: typ === null ? {} : { 'content-type': typ } })
}

let online = true
const holen = vi.fn<typeof fetch>()

beforeEach(() => {
  online = true
  holen.mockReset()
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online)
  vi.stubGlobal('fetch', holen)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('networkReachable', () => {
  it('erreichbar: eigenes Manifest beantwortet, kein HTML', async () => {
    holen.mockResolvedValue(antwort(200, 'application/manifest+json'))
    expect(await networkReachable()).toBe(true)
  })

  it('fragt per HEAD am HTTP-Cache vorbei — nie ein Treffer aus dem Cache', async () => {
    holen.mockResolvedValue(antwort(200, 'application/manifest+json'))
    await networkReachable()
    expect(holen).toHaveBeenCalledOnce()
    expect(holen).toHaveBeenCalledWith('./manifest.webmanifest', { method: 'HEAD', cache: 'no-store' })
  })

  it('Anmeldeseite (Captive Portal): 200 mit text/html ist KEIN Beleg', async () => {
    holen.mockResolvedValue(antwort(200, 'text/html; charset=utf-8'))
    expect(await networkReachable()).toBe(false)
  })

  it('Fehlerantwort des Servers zählt nicht als erreichbar', async () => {
    holen.mockResolvedValue(antwort(503, 'text/plain'))
    expect(await networkReachable()).toBe(false)
  })

  it('ohne Inhaltstyp entscheidet allein der Status', async () => {
    holen.mockResolvedValue(antwort(200, null))
    expect(await networkReachable()).toBe(true)
    holen.mockResolvedValue(antwort(404, null))
    expect(await networkReachable()).toBe(false)
  })

  it('abgebrochene Anfrage (kein Netz, DNS, Zeitüberschreitung) → nicht erreichbar, kein Wurf', async () => {
    holen.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(networkReachable()).resolves.toBe(false)
  })

  it('navigator.onLine === false: sofort nein, ohne Anfrage', async () => {
    online = false
    expect(await networkReachable()).toBe(false)
    expect(holen).not.toHaveBeenCalled()
  })
})
