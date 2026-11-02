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
  await expect(page.getByRole('tab', { name: 'Findings' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Findings' })).toBeFocused()

  // Befundzeile per Tastatur aufklappen — vorher nur mit der Maus erreichbar
  const knopf = page.getByRole('button', { name: /^Befund C-\d+: Fundstellen anzeigen$/ }).first()
  await knopf.focus()
  await page.keyboard.press('Enter')
  await expect(knopf).toHaveAttribute('aria-expanded', 'true')

  const anzeigen = page.getByRole('button', { name: 'Seite anzeigen' }).first()
  await anzeigen.focus()
  await page.keyboard.press('Enter')
  const viewer = page.getByRole('dialog', { name: 'Dokument ansehen' })
  await expect(viewer).toBeVisible()
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

  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Prüfstand speichern/ }).click()])
  await page.locator('input[accept=".json,application/json"]').setInputFiles((await json.path())!)
  const geladen = page.getByText('Geöffneter Prüfstand').locator('xpath=ancestor::div[contains(@class,"space-y-stack")][1]')
  await expect(geladen.getByText('geladen, Hash stimmt')).toBeVisible()
  for (const id of csvIds) await expect(geladen.getByText(id, { exact: true })).toBeVisible()
})

test('Re-Check: Paket und Fremdliste → bestätigen → Datei mit Blatt „Neue Findings"', async ({ page }) => {
  await page.getByRole('tab', { name: 'Administration' }).click()
  await page.getByLabel(/Re-Check externer/).check()
  await page.getByRole('tab', { name: 'Re-Check' }).click()
  const paket = await sbxPkg01()
  await page.locator('input[type=file]').first().setInputFiles(paket.map((d) => datei(d.name)))
  await expect(page.getByRole('status').filter({ hasText: /gelesen und geprüft/ }).first()).toBeVisible()
  await page.locator('input[accept=".xlsx,.csv,.txt"]').setInputFiles(datei(SBX_FL_01_NAME))
  await page.getByRole('button', { name: /Befunde? nachprüfen/ }).click()
  await page.getByRole('button', { name: /„Behoben“ bestätigen/ }).click()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Neue Excel-Datei erzeugen' }).click()])
  expect(dl.suggestedFilename()).toMatch(/_recheck_\d{4}-\d{2}-\d{2}\.xlsx$/)
  const mappe = await (await JSZip.loadAsync(readFileSync((await dl.path())!))).file('xl/workbook.xml')!.async('string')
  expect(mappe).toContain('name="Neue Findings"')
})

test('Wartung: Superadmin schaltet DocCheck ab und über den Wartungshinweis wieder ein', async ({ page }) => {
  await page.getByRole('tab', { name: 'Administration' }).click()
  // click statt uncheck: Das Kästchen verschwindet mit dem Klick, weil der Wartungshinweis übernimmt
  await page.getByLabel(/DocCheck gesamt/).click()
  await expect(page.getByText(/Wartung/)).toBeVisible()
  await page.getByRole('button', { name: 'DocCheck wieder einschalten' }).click()
  await expect(page.getByRole('tab', { name: 'Prüfung' })).toBeVisible()
})
