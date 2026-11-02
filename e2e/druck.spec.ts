import { expect, test } from '@playwright/test'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { anmelden, unterschreiben } from './hilfen'

/**
 * Druck und PDF eines Nachweises (Ebene 3) — Seitenumbruch, Zeigerereignisse
 * und Druckmedien gibt es nur im echten Browser.
 *
 *  - GRD-15/PRT-01 (medium): Auf Folgeblaettern lag der wiederholte Kopf
 *    0,3 mm unter der Papierkante, auf Blatt 1 der Fuss 0,9 mm darueber —
 *    ein Drucker schneidet genau die Zeilen ab, die ein Blatt der ATO und
 *    dem Nachweis zuordnen.
 *  - GRD-14/UI-01 (medium): Die Bestaetigung („Form signed and sent.",
 *    „CSV file downloaded.") stand samt Schliessknopf auf dem PDF.
 *  - TA-01 (high): Das PDF-Symbol in der Ablage des Training Admin nahm
 *    keinen Mausklick an; es oeffnete sich nur die Formularansicht.
 *
 * Gemessen wird ueber Textpositionen (pdf.js), nicht ueber Pixel.
 */

const PT_JE_MM = 72 / 25.4
/** Mindestabstand zum Blattrand: Gaengige Drucker bedrucken 3–5 mm nicht. */
const RAND_MM = 5

interface Text {
  text: string
  /** Abstand der Zeichenoberkante zur Oberkante des Blatts */
  obenMm: number
  /** Abstand der Unterlaengen zur Unterkante des Blatts */
  untenMm: number
}

/** Textstuecke je Blatt mit ihrem Abstand zu Ober- und Unterkante. */
async function blaetter(pdf: Buffer): Promise<Text[][]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise
  const out: Text[][] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const seite = await doc.getPage(n)
    const hoehe = seite.view[3]
    const { items } = await seite.getTextContent()
    out.push(
      items
        .filter((it) => 'str' in it && it.str.trim() !== '')
        .map((it) => {
          const t = it as { str: string; transform: number[]; height: number }
          return {
            text: t.str,
            obenMm: (hoehe - (t.transform[5] + t.height)) / PT_JE_MM,
            // Grundlinie minus Unterlaenge (rund ein Viertel der Schrifthoehe)
            untenMm: (t.transform[5] - t.height / 4) / PT_JE_MM,
          }
        }),
    )
  }
  return out
}

test('307A ueber zwei Blaetter: Kopf und Fuss im druckbaren Bereich, keine Bestaetigung auf dem PDF', async ({ page }) => {
  await anmelden(page)

  // Formular → Unterschrift → Versand, wie am Tablet im Kursraum.
  await page.goto('/#/grading/new')
  await page.getByLabel('Form type').selectOption('307A')
  await page.locator('#field-event').fill('CRM Refresher Winter Ops')
  await page.locator('#field-duration').selectOption({ index: 3 })
  await page.locator('#field-location').selectOption({ index: 1 })
  await page.getByRole('button', { name: /^Continue/ }).click()
  for (let i = 0; i < 26; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Add attendee' }).click()
    await page.locator('#anwesenheit input').nth(i).fill(`Teilnehmer ${String(i + 1).padStart(2, '0')} Beispiel`)
    await unterschreiben(page, page.locator('#anwesenheit canvas').nth(i))
  }
  await unterschreiben(page, page.locator('#unterschriften canvas').first())
  await page.locator('.formularleiste').getByRole('button', { name: 'Complete and send' }).click()

  // GRD-14/UI-01: Die Bestaetigung steht am Bildschirm — im Druck nicht.
  // In EINEM Aufruf gelesen: Text vorhanden UND unsichtbar, sonst bestuende
  // der Test auch, wenn die Meldung schlicht schon weg waere.
  const bestaetigung = page.getByRole('status', { includeHidden: true }).filter({ hasText: 'Form signed and sent.' })
  await expect(bestaetigung).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  expect(await bestaetigung.evaluate((el) => ({ text: el.textContent, sichtbar: el.checkVisibility() }))).toEqual({
    text: expect.stringContaining('Form signed and sent.'),
    sichtbar: false,
  })
  // Dasselbe auf dem PDF, solange die Meldung noch steht.
  const liste = (await blaetter(await page.pdf({ preferCSSPageSize: true }))).flat().map((x) => x.text).join(' ')
  expect(liste).not.toContain('Form signed and sent.')
  // null statt 'screen': Mit fest eingestelltem Bildschirmmedium druckte
  // page.pdf() die Bildschirmansicht.
  await page.emulateMedia({ media: null })

  // Den Nachweis aus der Liste oeffnen und drucken.
  await page.getByRole('button', { name: /^307A · / }).first().click()
  await expect(page.getByText('Teilnehmer 26 Beispiel')).toBeVisible()
  const seiten = await blaetter(await page.pdf({ preferCSSPageSize: true, printBackground: true }))
  expect(seiten.length).toBeGreaterThanOrEqual(2)

  // GRD-15/PRT-01: Oben auf JEDEM Blatt steht der Kopf (erste Zeile: ATO
  // und Zulassung), unten auf Blatt 1 der Fuss — und nichts liegt naeher als
  // 5 mm an Ober- oder Unterkante.
  const zeileGanzUnten = (blatt: Text[]) => {
    const tiefste = Math.min(...blatt.map((x) => x.untenMm))
    return { mm: tiefste, text: blatt.filter((x) => x.untenMm - tiefste < 0.5).map((x) => x.text).join(' ') }
  }
  for (const [i, blatt] of seiten.entries()) {
    const oben = Math.min(...blatt.map((x) => x.obenMm))
    expect(blatt.filter((x) => x.obenMm - oben < 0.5).map((x) => x.text).join(' '), `Kopf auf Blatt ${i + 1}`).toContain('AT.ATO.106')
    expect(oben, `oberer Rand Blatt ${i + 1}`).toBeGreaterThanOrEqual(RAND_MM)
    expect(zeileGanzUnten(blatt).mm, `unterer Rand Blatt ${i + 1}`).toBeGreaterThanOrEqual(RAND_MM)
  }
  expect(zeileGanzUnten(seiten[0]).text, 'Fuss am unteren Rand von Blatt 1').toMatch(/ID gr-/)
})

test('Training Admin: das PDF-Symbol der Ablage oeffnet per Mausklick die Druckansicht', async ({ page }) => {
  // window.print abfangen — der Druckdialog liesse sich nicht schliessen.
  await page.addInitScript(() => {
    const w = window as unknown as { __drucke: string[] }
    w.__drucke = []
    window.print = () => {
      w.__drucke.push(location.hash)
    }
  })
  await anmelden(page, 'training.admin@aviationacademy.at')
  await page.goto('/#/grading')

  // GRD-14/UI-01, zweiter Weg: Bestaetigung nach dem CSV-Export.
  const datei = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Forms (CSV)' }).click()
  await datei
  const bestaetigung = page.getByRole('status', { includeHidden: true }).filter({ hasText: 'CSV file downloaded.' })
  await expect(bestaetigung).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  expect(await bestaetigung.evaluate((el) => el.checkVisibility())).toBe(false)
  await page.emulateMedia({ media: null })

  // TA-01: ein echter Mausklick auf die Mitte des Symbols. `locator.click()`
  // prueft vorher, ob das Ziel Klicks annimmt, und wuerde den Fehler nur als
  // Zeitueberschreitung melden — die Maus trifft einfach, was dort liegt.
  const knopf = page.getByRole('button', { name: 'Download as PDF' }).first()
  await expect(knopf).toBeVisible()
  const b = (await knopf.boundingBox())!
  const mitte = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  expect(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'), mitte),
    'unter dem Zeiger liegt das Symbol, nicht die Zeile',
  ).toBe('Download as PDF')
  await page.mouse.click(mitte.x, mitte.y)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __drucke: string[] }).__drucke)).toEqual([expect.stringMatching(/^#\/grading\/[^?]+\?print=1$/)])
  // Danach bereinigt die Ansicht die Adresse wieder (GradingView).
  await expect(page).toHaveURL(/#\/grading\/[^?/]+$/)
})
