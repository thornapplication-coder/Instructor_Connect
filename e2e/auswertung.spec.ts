import type { Page } from '@playwright/test'
import { anmelden, expect, test } from './hilfen'

/**
 * Grading-Auswertungen im echten Browser (Ebene 3) — Zeilenumbruch in
 * Tabellen gibt es nur mit echtem Layout.
 *
 * Audit 11/2026, GRD-13/MOB-06/UID-02/A11Y-18 (medium): Die globale Regel
 * `overflow-wrap: anywhere` liess die Mindestbreite jeder Tabellenzelle auf
 * einen Buchstaben fallen. Die Tabellen schrumpften, statt zu scrollen:
 * „Not competen/t", „50 / %", „Fle/et", „CL/30", „Deviatio/n" — bei 360 px
 * im Monatsbericht, bei 1024 und 1440 px in Statistik und
 * Standardisierungsbericht.
 *
 * Geprüft wird je Wort einer Tabellenzelle, dass es auf EINER Zeile steht
 * (Zeilenboxen aus Range.getClientRects). Getrennt wird an gewöhnlichen
 * Leerzeichen; „50 %" mit geschütztem Leerzeichen ist ein Wert und zählt als
 * ein Wort.
 */

const BREITEN = [360, 1024, 1440]
const SEITEN = [
  { pfad: '/#/admin/grading/stats', name: 'Statistik' },
  { pfad: '/#/admin/grading/standardisation', name: 'Standardisierungsbericht' },
  { pfad: '/#/admin/grading/monthly', name: 'Monatsbericht' },
]

/** Wörter in Tabellenzellen, die über mehr als eine Zeile laufen. */
async function getrennteWoerter(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    for (const zelle of document.querySelectorAll('main th, main td')) {
      const gang = document.createTreeWalker(zelle, NodeFilter.SHOW_TEXT)
      for (let n = gang.nextNode(); n; n = gang.nextNode()) {
        for (const m of (n.textContent ?? '').matchAll(/[^ \t\n]+/g)) {
          const r = document.createRange()
          r.setStart(n, m.index!)
          r.setEnd(n, m.index! + m[0].length)
          // Unsichtbares (Druckkopf) hat keine Boxen und zählt nicht.
          const zeilen = new Set([...r.getClientRects()].filter((b) => b.width > 0).map((b) => Math.round(b.top)))
          if (zeilen.size > 1) out.push(m[0])
        }
      }
    }
    return out
  })
}

test('Auswertungen: kein Wort in einer Tabellenzelle bricht um — 360, 1024 und 1440 px', async ({ page }) => {
  await anmelden(page)
  for (const breite of BREITEN) {
    await page.setViewportSize({ width: breite, height: 900 })
    for (const seite of SEITEN) {
      await page.goto(seite.pfad)
      await expect(page.locator('main table').first()).toBeVisible()
      expect(await getrennteWoerter(page), `${seite.name} bei ${breite} px`).toEqual([])
    }
  }
})

test('Flottenmatrix: der Mustercode „CL30" steht in einer Zeilenbox', async ({ page }) => {
  await anmelden(page)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/#/admin/grading/stats')
  const zelle = page.getByRole('cell', { name: 'CL30', exact: true }).first()
  await expect(zelle).toBeVisible()
  const boxen = await zelle.evaluate((td) => {
    const r = document.createRange()
    r.selectNodeContents(td)
    return [...r.getClientRects()].filter((b) => b.width > 0).length
  })
  expect(boxen).toBe(1)
})

/**
 * Audit 11/2026, UID-13/UID-17/A11Y-07/EXM-04 — was nur mit echtem Layout und
 * echtem Dokument sichtbar wird: ein Rückweg je Ebene, die Filter des
 * Berichts in EINER Zeile (`w-auto` verlor gegen `w-full`, drei
 * bildschirmbreite Felder untereinander), jedes Auswahlfeld mit Namen, und
 * ein Drucktitel, der den Ausschnitt nennt statt „Instructor Connect".
 */
test('Grading-Unterbereiche: ein Rückweg, benannte Filter in einer Zeile, eigener Drucktitel', async ({ page }) => {
  await anmelden(page)
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.goto('/#/admin/grading')
  await expect(page.getByRole('button', { name: 'Zur Übersicht' })).toBeVisible()

  await page.goto('/#/admin/grading/standardisation')
  await expect(page.getByRole('button', { name: 'Grading Tool', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zur Übersicht' })).toHaveCount(0)
  await expect(page).toHaveTitle(/^Standardisation Report_Last 12 months_All fleets_All authorities_\d\d\.\d\d\.\d{4}$/)
  // Bereichszeile des Berichts: ohne Behördenauswahl keine AT-Nummer — sie
  // stand dort, obwohl UK-Blätter enthalten sein können (GRD-05/STD-01).
  await expect(page.locator('main').getByText(/· Authority: All authorities$/)).toBeVisible()

  const boxen = await Promise.all(['Fleet', 'Authority', 'Period'].map((n) => page.getByRole('combobox', { name: n }).boundingBox()))
  for (const b of boxen) {
    expect(b!.width, 'Auswahlfeld so breit wie sein Inhalt, nicht wie die Seite').toBeLessThan(400)
    expect(Math.abs(b!.y - boxen[0]!.y), 'Filter in einer Zeile').toBeLessThan(4)
  }

  for (const bereich of ['records', 'stats', 'standardisation', 'monthly']) {
    await page.goto(`/#/admin/grading/${bereich}`)
    await expect(page.locator('main select').first()).toBeVisible()
    const namenlos = await page
      .locator('main select')
      .evaluateAll((felder) => felder.filter((f) => !(f as HTMLSelectElement).labels?.length && !f.getAttribute('aria-label')).length)
    expect(namenlos, `Auswahlfelder ohne Namen in ${bereich}`).toBe(0)
  }
  await page.goto('/#/admin/grading/records')
  await expect(page.getByRole('textbox', { name: /^Search: trainee, instructor, form/ })).toBeVisible()

  await page.goto('/#/admin/grading/stats')
  await expect(page).toHaveTitle(/^Analytics_Last 12 months_All fleets_All authorities_/)
  // Beim Verlassen bleibt der Drucktitel nicht stehen — es gilt wieder der
  // Seitentitel der Übersicht (seit A11Y-13 hat jede Ansicht einen eigenen,
  // vorher war es überall „Instructor Connect").
  await page.goto('/#/admin')
  await expect(page).toHaveTitle('Admin Panel – Instructor Connect')
})

/**
 * Audit 11/2026, R3-MONATSBERICHT — Bildschirm UND Druck: Beim Bericht eines
 * anderen Instruktors steht dessen Name, nirgends „You"/„your" (die Regel
 * selbst prüft `monthlyReport.test.ts`). Im Druck fehlte außerdem die erste
 * Spalte der Kompetenztabelle: Sie klebt beim Scrollen (`sticky left-0`), und
 * die Druckregel für klebende Leisten blendete sie mit aus — übrig blieben
 * Zahlen ohne Kompetenz (gefunden bei der Gegenprüfung).
 */
test('Monatsbericht eines anderen: Name statt „You", im Druck mit Kompetenzspalte', async ({ page }) => {
  await anmelden(page)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/#/admin/grading/monthly')
  await page.getByRole('combobox', { name: 'Instructor' }).selectOption({ label: 'Chris Beispiel' })
  const bericht = page.locator('main')
  await expect(bericht.getByRole('columnheader', { name: 'Chris Beispiel', exact: true }).first()).toBeVisible()
  expect(await bericht.innerText()).not.toMatch(/\b(you|your)\b/i)

  await page.emulateMedia({ media: 'print' })
  const kompetenz = bericht.getByRole('rowheader', { name: /^KNO / })
  await expect(kompetenz).toBeVisible()
  await expect(bericht.getByRole('columnheader', { name: 'Per competency' })).toBeVisible()
  await page.emulateMedia({ media: null })
})
