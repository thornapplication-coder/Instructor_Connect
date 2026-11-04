import { anmelden, expect, seiteOeffnen, test } from './hilfen'

/**
 * Chat am Desktop per Tastatur (Ebene 3, Audit 11/2026, KERN-10/UID-12).
 *
 * Der Löschknopf an einer Nachricht hatte `hidden … group-hover:block`:
 * display:none nahm ihn aus der Tab-Reihenfolge — wer per Tastatur
 * arbeitet, konnte weder die eigene Nachricht löschen noch als Gruppenadmin
 * moderieren (40× Tab erreichten ihn nicht). Und nach dem Hovern war er
 * eine senkrechte 20×44-Pille. Fokus, Tab-Reihenfolge und Maße gibt es nur
 * im echten Browser.
 */
test('Tab erreicht „Löschen" an der eigenen Nachricht: sichtbar, 44×44, Enter löscht', async ({ page }) => {
  await anmelden(page)
  await seiteOeffnen(page, '/#/chat/g-defects')
  const eigene = page.locator('main > div').filter({ hasText: 'Ruderpedale' })
  const loeschen = eigene.getByRole('button', { name: 'Löschen' })
  await expect(loeschen).toBeAttached()

  // Vom Seitenanfang aus tabben, bis der Knopf den Fokus hat.
  await page.locator('body').focus()
  let erreicht = false
  for (let i = 0; i < 40 && !erreicht; i++) {
    await page.keyboard.press('Tab')
    erreicht = await loeschen.evaluate((el) => el === document.activeElement)
  }
  expect(erreicht, 'per Tab erreichbar').toBe(true)
  // Mit Tastaturfokus sichtbar — nicht nur fokussierbar.
  await expect(loeschen).toHaveCSS('opacity', '1')
  const flaeche = (await loeschen.boundingBox())!
  expect(flaeche.width).toBeGreaterThanOrEqual(44)
  expect(flaeche.height).toBeGreaterThanOrEqual(44)

  page.once('dialog', (d) => void d.accept())
  await page.keyboard.press('Enter')
  await expect(page.getByText('Ruderpedale', { exact: false })).toHaveCount(0)
})
