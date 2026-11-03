import JSZip from 'jszip'
import { readFileSync } from 'node:fs'
import { SBX_CALC_01_NAME, SBX_FL_01_NAME, sbxPkg01 } from '../src/modules/doccheck/benchmark/sbx'
import { anmelden, datei, docCheckOeffnen, expect, test } from './hilfen'

/**
 * DocCheck im echten Browser: was Ebene 1 und 2 nicht sehen — Worker,
 * Downloads, Fokus, Tastatur. Die Kommentare nennen den Befund, an dem ein
 * Weg schon einmal kaputt war.
 */

test.beforeEach(async ({ page }) => {
  await anmelden(page)
  await docCheckOeffnen(page)
})

test('Einlesen → Befund per Tastatur → Viewer hält und gibt den Fokus zurück', async ({ page }) => {
  await page.locator('input[type=file]').first().setInputFiles(datei(SBX_CALC_01_NAME))
  // Ansage nach dem Einlesen (Barrierefreiheitsprüfung 01.11.2026)
  await expect(page.getByRole('status').filter({ hasText: /gelesen und geprüft/ })).toBeVisible()

  // Reiter per Pfeiltaste (reiter.ts)
  await page.getByRole('tab', { name: 'Prüfung' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Befunde' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Befunde' })).toBeFocused()

  // Befundzeile per Tastatur aufklappen — vorher nur mit der Maus erreichbar. Die Zeile
  // trägt die Export-ID („CALC-001"), nicht mehr die Regel-ID „C-01" je Dokument (Audit 11/2026, DC-10)
  const knopf = page.getByRole('button', { name: /^Befund [A-Z0-9]+-\d{3}: Fundstellen anzeigen$/ }).first()
  const id = (await knopf.textContent())!.trim()
  expect(id).toMatch(/^[A-Z0-9]+-\d{3}$/)
  await knopf.focus()
  await page.keyboard.press('Enter')
  await expect(knopf).toHaveAttribute('aria-expanded', 'true')

  const anzeigen = page.getByRole('button', { name: 'Seite anzeigen' }).first()
  await anzeigen.focus()
  await page.keyboard.press('Enter')
  const viewer = page.getByRole('dialog', { name: 'Dokument ansehen' })
  await expect(viewer).toBeVisible()
  // Der Viewer nennt den Befund, von dem er kommt — mit derselben ID
  await expect(viewer.getByText(`Befund ${id}`, { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(anzeigen).toBeFocused()
})

test('Export: CSV mit BOM und denselben IDs wie die Excel-Datei; Prüfstand speichern und wieder öffnen', async ({ page }) => {
  await page.locator('input[type=file]').first().setInputFiles(datei(SBX_CALC_01_NAME))
  await expect(page.getByRole('status').filter({ hasText: /gelesen und geprüft/ })).toBeVisible()
  await page.getByRole('tab', { name: 'Export' }).click()

  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^CSV/ }).click()])
  expect(csv.suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2}_Review_.+_Findings\.csv$/)
  const csvBytes = readFileSync((await csv.path())!)
  expect([...csvBytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  const csvIds = csvBytes.toString('utf8').slice(1).split('\r\n').slice(1).filter(Boolean).map((z) => z.split(';')[0].replace(/"/g, ''))
  expect(csvIds.length).toBeGreaterThan(3)

  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Excel/ }).click()])
  const blatt = await (await JSZip.loadAsync(readFileSync((await xlsx.path())!))).file('xl/worksheets/sheet2.xml')!.async('string')
  for (const id of csvIds) expect(blatt).toContain(`>${id}<`)

  // ID in der Tabelle = ID im Excel/CSV: vorher „C-01" am Bildschirm, „CALC-001" im Bericht (Audit 11/2026, DC-10/UID-07/TXT-03)
  await page.getByRole('tab', { name: 'Befunde' }).click()
  const zeilen = page.getByRole('button', { name: /^Befund .+: Fundstellen anzeigen$/ })
  await expect(zeilen).toHaveCount(csvIds.length)
  for (const id of csvIds) await expect(page.getByRole('button', { name: `Befund ${id}: Fundstellen anzeigen`, exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Export' }).click()

  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Prüfstand speichern/ }).click()])
  await page.locator('input[accept=".json,application/json"]').setInputFiles((await json.path())!)
  const geladen = page.getByText('Geöffneter Prüfstand').locator('xpath=ancestor::div[contains(@class,"space-y-stack")][1]')
  await expect(geladen.getByText('geladen, Hash stimmt')).toBeVisible()
  for (const id of csvIds) await expect(geladen.getByText(id, { exact: true })).toBeVisible()
})

test('Re-Check: Paket und Fremdliste → bestätigen → Datei mit Blatt „Neue Findings"', async ({ page }) => {
  await page.getByRole('tab', { name: 'Administration' }).click()
  await page.getByLabel(/Re-Check externer/).check()
  await page.getByRole('tab', { name: 'Prüfung' }).click()
  const paket = await sbxPkg01()
  await page.locator('input[type=file]').first().setInputFiles(paket.map((d) => datei(d.name)))
  await expect(page.getByRole('status').filter({ hasText: /gelesen und geprüft/ }).first()).toBeVisible()
  // Paketmodus: Die Paketbefunde sind echte neue Befunde. Ohne ihn war der einzige
  // „neue" Befund das offene „TBD" in APX 4 — der Rest von Nr. 11, also eine
  // Dublette, die nie auf das Blatt gehört (N10.3, Audit 11/2026, DC-04)
  await page.getByRole('radio', { name: 'Paket' }).click()
  await page.getByRole('tab', { name: 'Re-Check' }).click()
  await page.locator('input[accept=".xlsx,.csv,.txt"]').setInputFiles(datei(SBX_FL_01_NAME))
  await page.getByRole('button', { name: /Befunde? nachprüfen/ }).click()
  await page.getByRole('button', { name: /„Behoben“ bestätigen/ }).click()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Neue Excel-Datei erzeugen' }).click()])
  expect(dl.suggestedFilename()).toMatch(/_recheck_\d{4}-\d{2}-\d{2}\.xlsx$/)
  const zip = await JSZip.loadAsync(readFileSync((await dl.path())!))
  expect(await zip.file('xl/workbook.xml')!.async('string')).toContain('name="Neue Findings"')
  // Das neue Blatt ist das letzte; der offene Altbefund steht dort nicht ein zweites Mal
  const blaetter = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  const neu = await zip.file(blaetter.at(-1)!)!.async('string')
  expect(neu).toContain('is not part of the package')
  expect(neu).not.toContain('TBD')
})

test('Wartung: Superadmin schaltet DocCheck ab und über den Wartungshinweis wieder ein', async ({ page }) => {
  await page.getByRole('tab', { name: 'Administration' }).click()
  // click statt uncheck: Das Kästchen verschwindet mit dem Klick, weil der Wartungshinweis übernimmt
  await page.getByLabel(/DocCheck gesamt/).click()
  await expect(page.getByText(/Wartung/)).toBeVisible()
  await page.getByRole('button', { name: 'DocCheck wieder einschalten' }).click()
  await expect(page.getByRole('tab', { name: 'Prüfung' })).toBeVisible()
})

test('Reiterleiste bei 1280 und 1440 px vollständig — auch mit Re-Check und geladenem Dokument (Audit 11/2026, DC-11)', async ({ page }) => {
  // Vorher endete „Administration" 46 px hinter dem Rand der Mittelspalte
  await page.getByRole('tab', { name: 'Administration' }).click()
  await page.getByLabel(/Re-Check externer/).check()
  await page.getByRole('tab', { name: 'Prüfung' }).click()
  await page.locator('input[type=file]').first().setInputFiles(datei(SBX_CALC_01_NAME))
  await expect(page.getByRole('status').filter({ hasText: /gelesen und geprüft/ })).toBeVisible()
  for (const breite of [1280, 1440]) {
    await page.setViewportSize({ width: breite, height: 900 })
    const leiste = page.getByRole('tablist', { name: 'DocCheck' })
    const rand = (await leiste.boundingBox())!
    const reiter = leiste.getByRole('tab')
    await expect(reiter).toHaveCount(8)
    for (const r of await reiter.all()) {
      const b = (await r.boundingBox())!
      expect(b.x + b.width, `${await r.textContent()} bei ${breite} px`).toBeLessThanOrEqual(rand.x + rand.width + 0.5)
    }
  }
})

test.describe('400 % Zoom am Desktop', () => {
  // 320 CSS-px = 1280 px bei 400 %; Desktop-Profil, also pointer: fine — der Ansichtsmodus greift nicht
  test.use({ viewport: { width: 320, height: 700 } })

  test('bei 320 px kein waagerechtes Scrollen (Audit 11/2026, A11Y-11, WCAG 1.4.10)', async ({ page }) => {
    // Vorher wuchs die einzige Rasterspalte auf 402 px, Text war abgeschnitten
    await expect(page.getByRole('tab', { name: 'Prüfung' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    // Ohne Überlauf ist noch nicht lesbar: Neben dem Modell-Select blieb vom Titel
    // „D…", und „Einzeldokumen/te" brach mitten im Wort (Nachtrag A11Y#3). Gezählt
    // werden Zeilen, nicht Höhe — zwei Zeilen passten in die 44 px des Knopfs.
    expect(await page.getByRole('heading', { name: 'DocCheck', level: 1 }).evaluate((h) => h.scrollWidth <= h.clientWidth)).toBe(true)
    const radios = page.getByRole('radiogroup', { name: 'Prüfumfang' }).getByRole('radio')
    await expect(radios).toHaveCount(2)
    for (const r of await radios.all()) {
      const zeilen = await r.evaluate((b) => {
        const bereich = document.createRange()
        bereich.selectNodeContents(b)
        return new Set([...bereich.getClientRects()].map((x) => Math.round(x.top))).size
      })
      expect(zeilen, (await r.textContent()) ?? '').toBe(1)
    }
  })
})

test('Hinweisdialog je Anmeldung: nach Abmelden und erneutem Anmelden erscheint er wieder (Audit 11/2026, SEC-05)', async ({ page }) => {
  // beforeEach hat ihn bestätigt. Vorher galt das für jeden späteren Nutzer
  // im selben Tab — am geteilten iPad sah der nächste ihn nie.
  await page.goto('/#/')
  await page.getByRole('button', { name: /Abmelden/ }).first().click()
  await anmelden(page)
  await page.goto('/#/doccheck')
  await expect(page.getByRole('button', { name: 'Verstanden' })).toBeVisible()
})
