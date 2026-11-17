import { readFileSync } from 'node:fs'
import { swAngaben } from '../src/swQuelle'
import { anmelden, expect, swKontrolliert, test } from './hilfen'

/**
 * Nachkontrolle der veröffentlichten Seite (playwright.live.config.ts).
 *
 * `LIVE_STAND_AUS_DIST=1`: Der erwartete Stand kommt aus dist/sw.js eines
 * Builds desselben Commits — der Build ist reproduzierbar (ci.yml prüft das),
 * also ist es derselbe Cache-Name wie im veröffentlichten. Dann wartet der
 * Test, bis die Seite genau diesen Stand ausliefert, statt den alten aus dem
 * CDN zu prüfen.
 */
const ERWARTET = process.env.LIVE_STAND_AUS_DIST ? (swAngaben(readFileSync('dist/sw.js', 'utf8'))?.cache ?? 'unlesbar') : null

test.skip(!process.env.LIVE_URL, 'nur gegen die veröffentlichte Seite (LIVE_URL setzen)')

const zeile = (page: import('@playwright/test').Page, name: string) => page.locator('main li').filter({ has: page.getByText(name, { exact: true }) })

test('veröffentlichte Seite: richtiger Stand, Anmeldung, Selbsttest ohne Fehler, Start ohne Netz', async ({ page, request, context }) => {
  if (ERWARTET) {
    // Am CDN vorbei fragen (eigene Abfrage je Versuch), bis der neue Stand da ist.
    await expect
      .poll(
        async () => {
          const r = await request.get(`sw.js?nachkontrolle=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } })
          return r.ok() ? (swAngaben(await r.text())?.cache ?? null) : null
        },
        { timeout: 12 * 60_000, intervals: [10_000, 20_000, 30_000] },
      )
      .toBe(ERWARTET)
  }

  await anmelden(page)
  await swKontrolliert(page)
  await page.goto('./#/selbsttest')
  const kopf = page.locator('main [role=status]')
  await expect(kopf).not.toContainText('Prüfung läuft', { timeout: 120_000 })
  await expect(kopf, 'Der Selbsttest meldet auf der veröffentlichten Seite einen Fehler').not.toContainText('Fehler')
  await expect(zeile(page, 'Uhrzeit')).toContainText('Stimmt mit der Serverzeit überein.')
  await expect(zeile(page, 'Prüfregeln')).toContainText('Der eingebaute Testfehler wurde gefunden.')
  if (ERWARTET) await expect(zeile(page, 'Programmstand')).toContainText(ERWARTET.slice(-8))

  // Start ohne Netz — unter den echten Kopfzeilen des Hostings (TEC-01).
  await context.setOffline(true)
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await context.setOffline(false)
})
