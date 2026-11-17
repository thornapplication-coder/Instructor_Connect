import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { networkReachable, serverProbe } from './net'

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

/**
 * Selbsttest: Dieselbe Probe liefert die Serverzeit (Kopf `Date`), gegen die
 * die Uhr des Geräts geprüft wird. Eine Anmeldeseite bringt ihre eigene Zeit
 * mit — die zählt nicht.
 */
describe('serverProbe', () => {
  const mitDatum = (typ: string, datum: string) => new Response(null, { status: 200, headers: { 'content-type': typ, date: datum } })

  it('liefert den Date-Kopf und die Zeitpunkte von Anfrage und Antwort', async () => {
    holen.mockResolvedValue(mitDatum('application/manifest+json', 'Wed, 04 Nov 2026 11:00:00 GMT'))
    const p = await serverProbe()
    expect(p).toMatchObject({ erreichbar: true, datum: 'Wed, 04 Nov 2026 11:00:00 GMT' })
    expect(p.empfangen).toBeGreaterThanOrEqual(p.gesendet)
  })

  it('Anmeldeseite: nicht erreichbar, und ihre Zeit wird nicht übernommen', async () => {
    holen.mockResolvedValue(mitDatum('text/html', 'Thu, 01 Jan 2015 00:00:00 GMT'))
    expect(await serverProbe()).toMatchObject({ erreichbar: false, datum: null })
  })

  it('ohne Netz: keine Anfrage, keine Zeit', async () => {
    online = false
    expect(await serverProbe()).toMatchObject({ erreichbar: false, datum: null })
    expect(holen).not.toHaveBeenCalled()
    online = true
    holen.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await serverProbe()).toMatchObject({ erreichbar: false, datum: null })
  })
})
