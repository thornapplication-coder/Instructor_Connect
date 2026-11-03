import { devices, type Locator, type Page } from '@playwright/test'
import { anmelden, datei, docCheckOeffnen, expect, test } from './hilfen'

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

/*
 * Chat am Telefon (Audit 11/2026, KERN-01, KERN-10/MOB-04). Im iPhone-
 * Format, dem Hauptgeraet: Chromium mit den Massen und der Touch-Eingabe
 * des iPhone 13 — der Browsertyp des Profils (WebKit) bliebe aussen vor,
 * er laesst sich in einer Gruppe nicht wechseln.
 */
const { defaultBrowserType: _webkit, ...iphone13 } = devices['iPhone 13']

/** Unterkante eines Elements und Oberkante der klebenden Eingabeleiste. */
async function lage(page: Page, eintrag: Locator) {
  const unten = await eintrag.evaluate((el) => el.getBoundingClientRect().bottom)
  const leiste = await page.locator('.above-sandbox-sticky').evaluate((el) => el.getBoundingClientRect().top)
  return { unten, leiste }
}

test.describe('Chat im iPhone-Format', () => {
  test.use(iphone13)

  test('KERN-01: jüngster und eben gesendeter Eintrag stehen über der Eingabeleiste', async ({ page }) => {
    await anmelden(page)
    await page.goto('/#/chat/g-defects')
    const eintraege = page.locator('main > div')
    await expect(eintraege.last()).toBeVisible()
    // Nach dem Öffnen: Der jüngste Eintrag (die Umfrage) liegt nicht hinter der Leiste.
    let { unten, leiste } = await lage(page, eintraege.last())
    expect(unten).toBeLessThanOrEqual(leiste)

    const eingabe = page.getByPlaceholder('Nachricht …')
    await eingabe.fill('Gegenprobe Nachricht XYZ')
    await eingabe.press('Enter')
    const neu = page.locator('main > div').filter({ hasText: 'Gegenprobe Nachricht XYZ' })
    await expect(neu).toBeVisible()
    await expect(eingabe).toHaveValue('')
    ;({ unten, leiste } = await lage(page, neu))
    expect(unten).toBeLessThanOrEqual(leiste)
    // … und auch nicht oben unter der Kopfleiste verschwunden.
    expect(await neu.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(0)
  })

  test('KERN-10/MOB-04: Superadmin löscht eine fremde Nachricht per Tap — der Knopf ist ohne Hover sichtbar', async ({ page }) => {
    await anmelden(page)
    await page.goto('/#/chat/g-defects')
    const blase = page.locator('main > div').filter({ hasText: 'IOS-Touchscreen' })
    const loeschen = blase.getByRole('button', { name: 'Löschen' })
    // Ohne Hover-Fähigkeit steht der Knopf immer da: sichtbar, 44×44.
    await expect(loeschen).toHaveCSS('opacity', '1')
    const flaeche = (await loeschen.boundingBox())!
    expect(flaeche.width).toBeGreaterThanOrEqual(44)
    expect(flaeche.height).toBeGreaterThanOrEqual(44)
    page.once('dialog', (d) => void d.accept())
    await loeschen.tap()
    await expect(page.getByText('IOS-Touchscreen', { exact: false })).toHaveCount(0)
  })
})

/*
 * „Dringend" im Feedback (Audit 11/2026, MOB-08): Bei 360 px Breite
 * brach die Beschriftung mitten im Wort („Dringen / d"), weil der Hinweis
 * daneben sie zusammendrückte. Umbrüche gibt es nur im echten Layout.
 */
test.describe('Feedback bei 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test('MOB-08: „Dringend" belegt eine Zeile, der Hinweis bricht um; aria-pressed', async ({ page }) => {
    await anmelden(page)
    await page.goto('/#/feedback')
    const knopf = page.getByRole('button', { name: /^Dringend/ })
    await expect(knopf).toHaveAttribute('aria-pressed', 'false')
    const beschriftung = knopf.getByText('Dringend', { exact: true })
    // Eine Zeile ist rund 1,5 Schriftgrößen hoch, zwei rund drei.
    const { hoehe, schrift } = await beschriftung.evaluate((el) => ({
      hoehe: el.getBoundingClientRect().height,
      schrift: parseFloat(getComputedStyle(el).fontSize),
    }))
    expect(hoehe).toBeLessThan(schrift * 2)
    await knopf.click()
    await expect(knopf).toHaveAttribute('aria-pressed', 'true')
  })
})
