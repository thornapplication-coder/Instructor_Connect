import { expect, test } from '@playwright/test'
import { anmelden } from './hilfen'

/**
 * Offline (CLAUDE.md, Ebene 3): Nach dem ersten Laden startet die App auch
 * ohne Netz — aus dem Vorab-Cache des Service Workers — und sagt es mit dem
 * Offline-Streifen, statt still zu scheitern.
 */
test('nach dem ersten Laden startet die App ohne Netz und zeigt den Offline-Streifen', async ({ page, context }) => {
  await anmelden(page)
  // Warten, bis der Service Worker die Seite kontrolliert — vorher gibt es keinen Cache
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise((ok) => navigator.serviceWorker.addEventListener('controllerchange', ok, { once: true }))
  })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Offline — Eingaben werden auf diesem Gerät gesichert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toHaveCount(0)
  await context.setOffline(false)
})
