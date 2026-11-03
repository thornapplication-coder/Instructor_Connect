import type { Page } from '@playwright/test'
import { anmelden, expect, test } from './hilfen'

/**
 * Desktop-Breiten im echten Layout — was sich nur mit Rendern messen lässt.
 * Die Spaltenregel selbst prüft src/kachelRaster.test.ts (Ebene 1).
 */

/**
 * Kacheln der Startseite je Reihe. Eine Reihe beginnt, wo eine Kachel
 * deutlich tiefer steht als die vorige — eine Kachel unter der Maus hebt
 * sich um 2 px (hover:-translate-y-0.5) und ist keine eigene Reihe.
 */
async function kachelReihen(page: Page): Promise<number[]> {
  await page.mouse.move(0, 0)
  return page.locator('main .grid > button').evaluateAll((kacheln) => {
    const reihen: number[] = []
    let oben = -Infinity
    for (const k of kacheln) {
      const y = k.getBoundingClientRect().top
      if (y > oben + 20) {
        reihen.push(0)
        oben = y
      }
      reihen[reihen.length - 1]++
    }
    return reihen
  })
}

/**
 * Audit 11/2026, UID-09 (Teil Startseite): Neun Kacheln in vier Spalten —
 * „DocCheck" allein in Reihe 3, die Seite 1436 px hoch, Kachel und
 * „Admin Panel" unter der Falz.
 */
test.describe('Startseite ohne verwaiste Kachel', () => {
  test('Superadmin bei 1440 × 900: zwei Reihen, DocCheck und Admin Panel ohne Scrollen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await anmelden(page)
    const docCheck = page.locator('main .grid > button', { hasText: 'DocCheck' })
    const admin = page.getByRole('button', { name: 'Admin Panel' })
    await expect(docCheck).toBeVisible()
    const reihen = await kachelReihen(page)
    expect(reihen).toEqual([5, 4])
    for (const [name, ziel] of [['DocCheck', docCheck], ['Admin Panel', admin]] as const) {
      const b = (await ziel.boundingBox())!
      expect(b.y + b.height, `${name} unter der Falz`).toBeLessThanOrEqual(900)
    }
    expect(await page.evaluate(() => scrollY)).toBe(0)
  })

  test('Training Admin (zwei Kacheln): eine volle Reihe, kein leeres Feld daneben', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await anmelden(page, 'training.admin@aviationacademy.at')
    await expect(page.locator('main .grid > button')).toHaveCount(2)
    expect(await kachelReihen(page)).toEqual([2])
    // Die Reihe füllt das Raster — sonst stünden die zwei links in einer Viererreihe.
    const m = await page.locator('main .grid').evaluate((g) => {
      const r = g.getBoundingClientRect()
      const letzte = g.lastElementChild!.getBoundingClientRect()
      return { rasterRechts: Math.round(r.right), kachelRechts: Math.round(letzte.right) }
    })
    expect(m.kachelRechts).toBe(m.rasterRechts)
  })
})

/**
 * Audit 11/2026, UID-16/UID-20: Zwischen 1024 und 1279 px galt die Schranke
 * von 768 px — das Admin-Panel, das ab 1024 px aufgeht, sah aus wie eine
 * Tablet-Spalte, und die Sandbox-Leiste schnitt „iPhone/iPad-Vorschau" ab.
 */
test('1024 px: Admin-Panel nutzt die Breite, keine waagerechte Rollleiste, die Sandbox-Leiste zeigt alle Knöpfe', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await anmelden(page)
  await page.goto('/#/admin/grading/records')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Admin Panel')
  const m = await page.evaluate(() => {
    const main = document.querySelector('main')!
    const s = getComputedStyle(main)
    const leiste = document.querySelector<HTMLElement>('.sticky.bottom-0 > div')!
    const kasten = leiste.getBoundingClientRect()
    const draussen = [...leiste.querySelectorAll('button, select')]
      .filter((k) => {
        const r = k.getBoundingClientRect()
        return r.left < kasten.left || r.right > kasten.right
      })
      .map((k) => k.textContent?.trim())
    return {
      inhalt: main.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
      ueberlauf: document.documentElement.scrollWidth - innerWidth,
      leisteRollt: leiste.scrollWidth - leiste.clientWidth,
      draussen,
    }
  })
  expect(m.inhalt).toBeGreaterThanOrEqual(900)
  expect(m.ueberlauf).toBeLessThanOrEqual(0)
  expect(m.leisteRollt).toBeLessThanOrEqual(0)
  expect(m.draussen).toEqual([])
})
