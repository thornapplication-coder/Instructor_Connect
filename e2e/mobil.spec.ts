import { expect, test } from '@playwright/test'
import { anmelden, datei, docCheckOeffnen } from './hilfen'

/** Ansichtsmodus am Telefon (Spez. 6.9): Prüfstand öffnen, ansehen, exportieren — Prüfen nur am Desktop. */
test('Telefon: Prüfstand öffnen, Befunde lesen, CSV exportieren; fremde Version wird abgewiesen', async ({ page }) => {
  await anmelden(page)
  await docCheckOeffnen(page)
  await expect(page.getByText(/Prüfungen und Bibliothekspflege am Desktop/)).toBeVisible()
  await page.getByRole('tab', { name: 'Befunde' }).click()
  await page.locator('input[accept=".json,application/json"]').setInputFiles(datei('beispiel.doccheck.json'))
  await expect(page.getByText('Geöffneter Prüfstand')).toBeVisible()
  await expect(page.getByText('TM-001', { exact: true })).toBeVisible()
  await expect(page.getByText('PKG-001', { exact: true })).toBeVisible()
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^CSV/ }).click()])
  expect(csv.suggestedFilename()).toMatch(/_Findings\.csv$/)

  await page.getByRole('button', { name: 'Prüfstand schließen' }).click()
  await page.locator('input[accept=".json,application/json"]').setInputFiles(datei('neuer.doccheck.json'))
  await expect(page.getByRole('status').filter({ hasText: 'Der Prüfstand stammt aus einer neueren DocCheck-Version.' })).toBeVisible()
})
