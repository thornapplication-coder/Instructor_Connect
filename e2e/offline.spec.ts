import type { Page } from '@playwright/test'
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { anmelden, cspAbweisungen, expect, swKontrolliert, test } from './hilfen'

/**
 * Offline (CLAUDE.md, Ebene 3): Nach dem ersten Laden startet die App auch
 * ohne Netz — aus dem Vorab-Cache des Service Workers — und sagt es mit dem
 * Offline-Streifen, statt still zu scheitern.
 */

async function offlineNeuStarten(page: Page): Promise<void> {
  await page.context().setOffline(true)
  await page.reload()
  await expect(page.getByText('Offline — Eingaben werden auf diesem Gerät gesichert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toHaveCount(0)
  await page.context().setOffline(false)
}

test('nach dem ersten Laden startet die App ohne Netz und zeigt den Offline-Streifen', async ({ page }) => {
  await anmelden(page)
  await swKontrolliert(page)
  await offlineNeuStarten(page)
})

/* ---------------- Update unter HTTP-Cache-Lebensdauer ---------------- */

const TYPEN: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' }

/**
 * Ein statischer Server wie GitHub Pages: „Cache-Control: max-age=600" auf
 * allem. `vite preview` sendet „no-cache" — unter ihm war der Fehler unten
 * gar nicht zu sehen, der Offline-Test lief grün.
 */
function seitenServer(ordner: string): Promise<Server> {
  const server = createServer((req, res) => {
    let pfad = decodeURIComponent((req.url ?? '/').split('?')[0])
    if (pfad.endsWith('/')) pfad += 'index.html'
    try {
      const daten = readFileSync(join(ordner, pfad))
      res.writeHead(200, { 'Content-Type': TYPEN[extname(pfad)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600' })
      res.end(daten)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/html', 'Cache-Control': 'max-age=600' })
      res.end('<h1>404</h1>')
    }
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

/**
 * Zweite Version bereitstellen, wie ein Deployment es tut: neues Bundle unter
 * neuem Namen, neue index.html, neuer Worker mit neuem Cache-Namen — und das
 * alte Bundle ist vom Server verschwunden.
 */
function zweiteVersion(ordner: string): string {
  const seite = readFileSync(join(ordner, 'index.html'), 'utf8')
  const alt = seite.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)![1]
  const neu = `index-zweite${Date.now()}.js`
  copyFileSync(join(ordner, 'assets', alt), join(ordner, 'assets', neu))
  writeFileSync(join(ordner, 'index.html'), seite.replace(alt, neu))
  const sw = readFileSync(join(ordner, 'sw.js'), 'utf8')
  writeFileSync(join(ordner, 'sw.js'), sw.replace(`"./assets/${alt}"`, `"./assets/${neu}"`).replace(/const CACHE = "[^"]+"/, 'const CACHE = "ic-zweite"'))
  unlinkSync(join(ordner, 'assets', alt))
  return neu
}

test('nach einem Update startet die App offline — auch bei HTTP-Cache-Lebensdauer (Audit 11/2026, TEC-01)', async ({ browser }) => {
  /*
   * Der Fehler: Die Installation holte index.html über den HTTP-Cache. Fand
   * der Worker das Update innerhalb von 10 Minuten nach dem letzten Laden,
   * lag die ALTE Seite im NEUEN Cache, activate löschte den alten Cache mit
   * ihrem Bundle — und der nächste Offline-Start blieb weiß.
   */
  const ordner = mkdtempSync(join(tmpdir(), 'ic-seiten-'))
  cpSync(fileURLToPath(new URL('../dist', import.meta.url)), ordner, { recursive: true })
  const server = await seitenServer(ordner)
  const context = await browser.newContext({ baseURL: `http://localhost:${(server.address() as AddressInfo).port}/`, locale: 'de-AT' })
  // Eigener Kontext: die CSP-Wache selbst anmelden (SEC-07) — der
  // Offline-Start nach einem Update darf nichts an der Richtlinie scheitern.
  const abgewiesen = await cspAbweisungen(context)
  try {
    const page = await context.newPage()
    await anmelden(page)
    await swKontrolliert(page)

    const neu = zweiteVersion(ordner)
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()))
    // Die Übernahme läuft von selbst (UpdateBanner, nichts in Bearbeitung):
    // fertig, wenn nur noch der neue Cache da ist und die Seite das neue
    // Bundle lädt. Während des Neuladens wirft evaluate — dann weiter warten.
    await expect
      .poll(
        () =>
          page
            .evaluate(async (n) => ({ caches: (await caches.keys()).filter((k) => k.startsWith('ic-')), bundle: [...document.scripts].some((s) => s.src.endsWith(n)) }), neu)
            .catch(() => null),
        { timeout: 30_000 },
      )
      .toEqual({ caches: ['ic-zweite'], bundle: true })

    // Ohne Netz hilft der HTTP-Cache nicht mehr — genau wie auf dem Gerät,
    // das ihn längst geräumt hat. Übrig bleibt der Vorab-Cache.
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.clearBrowserCache')
    // Wieder lösen: Solange eine zweite Sitzung hängt, greift setOffline
    // nicht — navigator.onLine blieb true, und der Test prüfte nichts.
    await cdp.detach()
    await offlineNeuStarten(page)
    expect(abgewiesen, 'von der CSP abgewiesen').toEqual([])
  } finally {
    await context.close()
    await new Promise((ok) => server.close(ok))
    rmSync(ordner, { recursive: true, force: true })
  }
})
