import { expect, type Page } from '@playwright/test'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const datei = (name: string) => join(fileURLToPath(new URL('./.dateien', import.meta.url)), name)
export const SUPERADMIN = 'alex.beispiel@example.test'

/**
 * Anmelden über den echten Weg der Sandbox: E-Mail → angezeigter Code →
 * bestätigen. Nur die Sprache wird vorher gesetzt — sie ist eine Vorliebe,
 * keine Sitzung.
 */
export async function anmelden(page: Page, email = SUPERADMIN): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem('aaa-lang')) localStorage.setItem('aaa-lang', 'de')
  })
  await page.goto('/')
  await page.getByLabel('E-Mail-Adresse').fill(email)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  const hinweis = await page.getByText(/Sandbox: dein Code lautet \d{6}/).textContent()
  const code = hinweis!.match(/\d{6}/)![0]
  await page.getByLabel('6-stelliger Code').fill(code)
  await page.getByRole('button', { name: 'Bestätigen und anmelden' }).click()
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toHaveCount(0)
}

/** DocCheck öffnen und den Hinweis der Sitzung bestätigen (Spez. 5.5 Nr. 2). */
export async function docCheckOeffnen(page: Page): Promise<void> {
  await page.goto('/#/doccheck')
  await page.getByRole('button', { name: 'Verstanden' }).click()
}
