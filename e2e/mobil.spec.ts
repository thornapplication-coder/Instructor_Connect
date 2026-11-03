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

/**
 * Audit 11/2026, MOB-02/KERN-17: Neben einer langen Aktion („+ Eintrag
 * hinzufügen") blieb vom Seitentitel am Telefon „my A…" bzw. „Le…". Die
 * Aktion zeigt unter `sm` nur das Plus; ihr Name bleibt die Beschriftung.
 */
test('Telefon 360 px: Seitentitel bleiben neben der Aktion lesbar', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await anmelden(page)
  for (const [route, aktion] of [
    ['/lessons', 'Lesson Plan hochladen'],
    ['/logbook', 'Eintrag hinzufügen'],
    ['/info', 'Neuer Eintrag'],
    // Kurze Titel, aber derselbe Knopf (TopBarAktion): am Telefon nur das Plus.
    ['/notes', 'Neue Notiz'],
    ['/contacts', 'Neuer Kontakt'],
    ['/chat', 'Gruppe anlegen'],
  ] as const) {
    await page.goto(`/#${route}`)
    const titel = page.locator('header h1[data-page-heading]')
    await expect(titel).toBeVisible()
    const knopf = page.getByRole('button', { name: aktion })
    await expect(knopf).toBeVisible()
    const m = await titel.evaluate((h) => ({ sichtbar: h.clientWidth, noetig: h.scrollWidth }))
    expect(m.noetig, `${route}: Titel gekürzt (${m.noetig} > ${m.sichtbar})`).toBeLessThanOrEqual(m.sichtbar)
    const b = (await knopf.boundingBox())!
    expect(Math.min(b.width, b.height), `${route}: Trefferfläche der Aktion`).toBeGreaterThanOrEqual(44)
    // Eine Gestalt auf jeder Seite: Die Beschriftung steht erst ab sm.
    await expect(knopf.getByText(aktion), `${route}: Beschriftung am Telefon`).toBeHidden()
  }
})

/**
 * Audit 11/2026, MOB-07: Die App läuft mit viewport-fit=cover unter die
 * Systemleisten, eingerückt war aber nur oben und unten an Kopf und
 * Sandbox-Leiste. Im Querformat lagen Karten bei 16 px — unter der
 * Sensorkappe (47 px) —, und im Bottom-Sheet standen „Abbrechen" und
 * „Speichern" im Bereich des Home-Indikators. Chromium gibt die
 * Sicherheitsbereiche über CDP vor; `env(safe-area-inset-*)` liefert dann
 * dieselben Werte wie ein iPhone 13.
 */
async function sicherheitsbereich(page: Page, insets: { top: number; left: number; right: number; bottom: number }) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets })
}

test.describe('Sicherheitsbereiche (Audit 11/2026, MOB-07)', () => {
  test('Querformat mit Sensorkappe links und rechts: Karten, Kopfleiste und Sandbox-Leiste rücken ein', async ({ page }) => {
    // Fenstermaß des iPhone 13 quer (Playwright-Profil): schmaler als die
    // Seitenschranke von 768 px — bei 844 px rückte schon der Rand der
    // zentrierten Seite die Karten aus der Kappe, und der Test sah nichts.
    await page.setViewportSize({ width: 750, height: 342 })
    await sicherheitsbereich(page, { top: 0, left: 47, right: 47, bottom: 21 })
    await anmelden(page)
    await page.goto('/#/notes')
    const karte = page.locator('main .rounded-2xl').first()
    await expect(karte).toBeVisible()
    const m = await page.evaluate(() => {
      const breite = innerWidth
      const kante = (sel: string) => {
        const r = document.querySelector(sel)!.getBoundingClientRect()
        return { links: Math.round(r.left), rechts: Math.round(breite - r.right) }
      }
      // Inhalt = Kasten minus Innenabstand: Dort steht, was man lesen muss.
      const inhalt = (sel: string) => {
        const e = document.querySelector(sel)!
        const r = e.getBoundingClientRect()
        const s = getComputedStyle(e)
        return { links: Math.round(r.left + parseFloat(s.paddingLeft)), rechts: Math.round(breite - r.right + parseFloat(s.paddingRight)) }
      }
      return { karte: kante('main .rounded-2xl'), kopf: inhalt('header > div'), leiste: inhalt('.sticky.bottom-0 > div') }
    })
    for (const [wo, k] of Object.entries(m)) {
      expect(k.links, `${wo} links`).toBeGreaterThanOrEqual(47)
      expect(k.rechts, `${wo} rechts`).toBeGreaterThanOrEqual(47)
    }
  })

  test('Hochformat mit Home-Indikator: der letzte Knopf des Bottom-Sheets liegt darüber', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 })
    await sicherheitsbereich(page, { top: 47, left: 0, right: 0, bottom: 34 })
    await anmelden(page)
    await page.goto('/#/notes')
    await page.getByRole('button', { name: 'Neue Notiz' }).click()
    const dialog = page.getByRole('dialog', { name: 'Neue Notiz' })
    await expect(dialog).toBeVisible()
    const m = await dialog.evaluate((d) => ({
      hoehe: innerHeight,
      dialogUnten: Math.round(d.getBoundingClientRect().bottom),
      knopfUnten: Math.max(...[...d.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().bottom))),
    }))
    // Das Sheet selbst reicht bis an den Rand (seine Fläche liegt unter dem
    // Indikator), sein Inhalt nicht.
    expect(m.dialogUnten).toBe(m.hoehe)
    expect(m.knopfUnten).toBeLessThanOrEqual(m.hoehe - 34)
  })
})
