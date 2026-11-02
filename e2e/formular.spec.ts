import { devices, type Page } from '@playwright/test'
import type { GradingRecord } from '../src/types'
import { anmelden, expect, test, unterschreiben } from './hilfen'

/**
 * Grading-Formular im echten Browser (Ebene 3) — was Ebene 1 nicht sieht:
 * Layout, Größenänderung des Canvas, Touch.
 *
 * Audit 11/2026, MOB-01 (critical): Im Vollbild wuchs das Canvas im
 * Querformat ohne jede Eingabe über den Bildschirm, der Strich flackerte
 * bzw. verschwand, und ein transparentes PNG galt als Unterschrift — „The
 * instructor signature is missing." fiel aus der Liste, ein Nachweis ließ
 * sich mit LEERER Unterschrift absenden.
 */

/** 308A bis Schritt 2 ausfüllen — nur, was Schritt 1 verlangt. */
async function zuSchritt2(page: Page) {
  await page.goto('/#/grading/new')
  await page.getByLabel('Form type').selectOption('308A')
  await page.getByPlaceholder('Student name').fill('Sophie Testpilotin')
  // Leere Auswahlfelder mit der ersten Option belegen (Muster, Event).
  const auswahl = page.locator('main select')
  for (let i = 0; i < (await auswahl.count()); i++) {
    const s = auswahl.nth(i)
    if (await s.isDisabled()) continue
    if (await s.inputValue()) continue
    const erste = await s.locator('option').evaluateAll((o) => (o as HTMLOptionElement[]).map((x) => x.value).find(Boolean))
    if (erste) await s.selectOption(erste)
  }
  const ffs = page.getByRole('button', { name: /FFS$/ })
  if ((await ffs.getAttribute('aria-pressed')) !== 'true') await ffs.click()
  await page.getByRole('button', { name: /Continue to grading/ }).click()
  await expect(page.locator('.formularleiste')).toBeVisible()
}

/** Offene Punkte der Abschlussleiste lesen (Liste kurz aufklappen). */
async function offenePunkte(page: Page): Promise<string[]> {
  const knopf = page.locator('.formularleiste button[aria-expanded]')
  await knopf.click()
  const liste = await page.locator('.formularleiste li').allTextContents()
  await knopf.click()
  return liste
}

/** Tintenpixel und zusammenhängende Tintenflächen eines Canvas. */
async function tinte(page: Page, auswahl: string): Promise<{ pixel: number; flaechen: number }> {
  return page.evaluate((sel) => {
    const c = document.querySelector<HTMLCanvasElement>(sel)!
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
    // Raster aus 4×4-Zellen: Kantenglättung zerreißt so keinen Strich.
    const z = 4
    const gw = Math.ceil(c.width / z)
    const gh = Math.ceil(c.height / z)
    const zelle = new Uint8Array(gw * gh)
    let pixel = 0
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4
        if (data[i + 3] >= 40 && (data[i] + data[i + 1] + data[i + 2]) / 3 < 200) {
          pixel++
          zelle[Math.floor(y / z) * gw + Math.floor(x / z)] = 1
        }
      }
    let flaechen = 0
    for (let s = 0; s < zelle.length; s++) {
      if (zelle[s] !== 1) continue
      flaechen++
      const stapel = [s]
      zelle[s] = 2
      while (stapel.length) {
        const p = stapel.pop()!
        const px = p % gw
        const py = Math.floor(p / gw)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx
            const ny = py + dy
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
            const q = ny * gw + nx
            if (zelle[q] === 1) {
              zelle[q] = 2
              stapel.push(q)
            }
          }
      }
    }
    return { pixel, flaechen }
  }, auswahl)
}

const VOLLBILD = '[role=dialog] canvas'
const UNTERSCHRIFT_FEHLT = 'The instructor signature is missing.'

for (const geraet of ['iPhone 13', 'iPhone 13 landscape'] as const) {
  test.describe(`Vollbild-Unterschrift — ${geraet}`, () => {
    // Nur Maße und Touch des Telefons; der Browser bleibt Chromium.
    const { defaultBrowserType: _browser, ...profil } = devices[geraet]
    test.use(profil)

    test('die Fläche bleibt im Bild, der Strich bleibt sichtbar, gespeichert wird genau eine Unterschrift', async ({ page }) => {
      await anmelden(page)
      await zuSchritt2(page)
      expect(await offenePunkte(page)).toContain(UNTERSCHRIFT_FEHLT)

      await page.getByRole('button', { name: 'Sign full screen' }).first().click()
      const hoehe = await page.evaluate(() => innerHeight)
      // Zwei Sekunden ohne Eingabe: keine Wachstumsschleife.
      const hoehen: number[] = []
      for (let i = 0; i < 10; i++) {
        hoehen.push(await page.evaluate((sel) => document.querySelector(sel)!.getBoundingClientRect().bottom, VOLLBILD))
        await page.waitForTimeout(200)
      }
      expect(Math.max(...hoehen)).toBeLessThanOrEqual(hoehe)
      expect(Math.max(...hoehen) - Math.min(...hoehen)).toBeLessThanOrEqual(1)
      const fertig = page.getByRole('button', { name: 'Done', exact: true })
      expect((await fertig.boundingBox())!.y + 10).toBeLessThan(hoehe)

      // Ein Strich per Touch — so, wie ihn der Prüfer gesetzt hat.
      const box = (await page.locator(VOLLBILD).boundingBox())!
      // Jede Änderung von width/height leert ein Canvas — deshalb auch die Pixelmaße.
      const pixelmass = () =>
        page.evaluate((sel) => {
          const c = document.querySelector<HTMLCanvasElement>(sel)!
          return `${c.width}×${c.height}`
        }, VOLLBILD)
      const massVorher = await pixelmass()
      const punkte = Array.from({ length: 31 }, (_, k) => ({
        x: Math.round(box.x + 30 + (k * (box.width - 60)) / 30),
        y: Math.round(box.y + box.height / 2 + Math.sin(k / 4) * Math.min(30, box.height / 4)),
      }))
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [punkte[0]] })
      for (const p of punkte.slice(1)) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] })
        await page.waitForTimeout(15)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

      // Der Strich bleibt stehen — vorher flackerte er (0 / 9878 / 0 …) oder war ganz weg.
      for (let i = 0; i < 8; i++) {
        expect((await tinte(page, VOLLBILD)).pixel).toBeGreaterThan(0)
        await page.waitForTimeout(150)
      }
      /* Nachtrag zu MOB-01 (Auslöser im Hochformat): Mit dem ersten Strich
         kam „Clear" in die Kopfzeile, die daraufhin umbrach, und „Undo last
         stroke" ersetzte den einzeiligen Hinweis. Beides nahm der Fläche Höhe,
         und jede Größenänderung leerte das Canvas. Kopf- und Fußzeile haben
         deshalb feste Höhen — die Fläche bleibt nach dem Strich, wie sie war. */
      const nachher = (await page.locator(VOLLBILD).boundingBox())!
      expect(Math.abs(nachher.y - box.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(nachher.height - box.height)).toBeLessThanOrEqual(1)
      expect(await pixelmass()).toBe(massVorher)

      await fertig.click()
      await expect(page.locator('[role=dialog]')).toHaveCount(0)
      // Inline genau EINE zusammenhängende Tintenfläche — keine Doppelfigur.
      await page.waitForTimeout(300)
      expect((await tinte(page, 'main canvas')).flaechen).toBe(1)
      expect(await offenePunkte(page)).not.toContain(UNTERSCHRIFT_FEHLT)
    })

    test('ohne Strich bleibt die Unterschrift ein offener Punkt', async ({ page }) => {
      await anmelden(page)
      await zuSchritt2(page)
      await page.getByRole('button', { name: 'Sign full screen' }).first().click()
      await page.waitForTimeout(500)
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      expect((await tinte(page, 'main canvas')).pixel).toBe(0)
      expect(await offenePunkte(page)).toContain(UNTERSCHRIFT_FEHLT)
    })

    /*
     * Audit 11/2026, MOB-11: Bei 160 px Listenhöhe zeigte die Leiste 3 von 6
     * offenen Punkten, ohne Hinweis auf die übrigen — darunter die fehlende
     * Unterschrift. Jeder Eintrag muss per Scroll ins Bild kommen, und die
     * Liste füllt höchstens die halbe Höhe.
     */
    test('jeder offene Punkt ist in der aufgeklappten Liste erreichbar', async ({ page }) => {
      await anmelden(page)
      await zuSchritt2(page)
      await page.locator('.formularleiste button[aria-expanded]').click()
      const liste = page.locator('.formularleiste ul')
      const hoehe = await page.evaluate(() => innerHeight)
      expect((await liste.boundingBox())!.height).toBeLessThanOrEqual(hoehe / 2 + 1)
      const eintraege = liste.getByRole('button')
      const anzahl = await eintraege.count()
      expect(anzahl).toBeGreaterThan(6)
      for (let i = 0; i < anzahl; i++) {
        await eintraege.nth(i).scrollIntoViewIfNeeded()
        await expect(eintraege.nth(i)).toBeInViewport({ ratio: 0.9 })
      }
      await expect(liste.getByRole('button', { name: UNTERSCHRIFT_FEHLT })).toBeInViewport()
    })
  })
}

/**
 * Audit 11/2026, GRD-10/TEC-05: Bloßes Öffnen hinterließ einen Entwurf
 * („Draft · 308A" in der Liste, „A draft of this form was restored." beim
 * nächsten Mal), der Zurück-Pfeil fragte ZWEIMAL (navigate() löst popstate
 * aus, und der Wächter dafür fragte erneut), und „Discard draft" fragte
 * danach noch „Your entries are saved as a draft". Was Ebene 1 davon prüfen
 * kann, prüft drafts.test.ts (`hatEigeneEingaben`); die Rückfragen gibt es
 * nur im Browser.
 */
test('Entwurf: Öffnen sichert nichts, Zurück fragt genau einmal, Verwerfen fragt nicht', async ({ page }) => {
  await anmelden(page)
  const fragen: string[] = []
  let gehen = false
  page.on('dialog', (d) => {
    fragen.push(d.message())
    void (gehen ? d.accept() : d.dismiss())
  })
  const entwuerfe = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('aaa-draft-')))
  const zurueck = page.getByRole('button', { name: 'Zurück', exact: true })
  // Wie aus der Liste: neues Formular, Typ wählen (legt den leeren Piloten an).
  const oeffnen = async () => {
    await page.goto('/#/grading/new')
    await page.getByLabel('Form type').selectOption('308A')
  }

  // 1. Nur öffnen: vorbelegt, aber nichts gesichert, nichts gefragt.
  await oeffnen()
  await expect(page.locator('#field-date')).not.toHaveValue('')
  await page.waitForTimeout(800)
  expect(await entwuerfe()).toEqual([])
  await zurueck.click()
  await expect(page).toHaveURL(/#\/grading$/)
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0)
  expect(fragen).toEqual([])

  // 2. Mit Eingabe: gesichert; je Klick auf Zurück genau EINE Rückfrage.
  await oeffnen()
  await page.getByPlaceholder('Student name').fill('Sophie Testpilotin')
  await expect.poll(entwuerfe).toHaveLength(1)
  // Nachtrag zu GRD-04: Die Behörde als LETZTE Änderung vor dem Verlassen —
  // der Sicherungseffekt führte sie nicht als Abhängigkeit, der Entwurf
  // behielt AT, und das Fortsetzen stand wieder auf der alten Zulassung.
  const behoerde = page.getByLabel('Approving authority *')
  await behoerde.selectOption('UK')
  const gesicherteBehoerde = () =>
    page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('aaa-draft-'))
      return k ? (JSON.parse(localStorage.getItem(k)!) as { authority?: string }).authority : undefined
    })
  await expect.poll(gesicherteBehoerde).toBe('UK')
  await zurueck.click()
  await page.waitForTimeout(400)
  expect(fragen).toHaveLength(1)
  await expect(page).toHaveURL(/#\/grading\/new$/)
  gehen = true
  await zurueck.click()
  await expect(page).toHaveURL(/#\/grading$/)
  await page.waitForTimeout(400)
  expect(fragen).toHaveLength(2)

  // 3. Browser-Zurück auf dem wiederhergestellten Entwurf: ebenfalls genau eine.
  await oeffnen()
  await expect(page.getByText('A draft of this form was restored.')).toBeVisible()
  await expect(page.getByPlaceholder('Student name')).toHaveValue('Sophie Testpilotin')
  await expect(behoerde).toHaveValue('UK')
  await page.goBack()
  await expect(page).toHaveURL(/#\/grading$/)
  await page.waitForTimeout(400)
  expect(fragen).toHaveLength(3)

  // 4. Verwerfen: weg, und keine Frage, die von einem gesicherten Entwurf spricht.
  await oeffnen()
  await page.getByRole('button', { name: 'Discard draft' }).click()
  await expect(page).toHaveURL(/#\/grading$/)
  await page.waitForTimeout(600)
  expect(fragen).toHaveLength(3)
  expect(await entwuerfe()).toEqual([])
})

/** Gespeicherte Formulare aus IndexedDB (persist.ts) — was im Nachweis steht. */
async function gespeicherteFormulare(page: Page): Promise<GradingRecord[]> {
  return page.evaluate(
    () =>
      new Promise<GradingRecord[]>((fertig) => {
        const rq = indexedDB.open('instructor-connect', 1)
        rq.onsuccess = () => {
          const g = rq.result.transaction('kv').objectStore('kv').get('aaa-state')
          g.onsuccess = () => {
            const roh = JSON.parse(g.result as string)
            fertig((roh.state ?? roh).gradingRecords)
          }
        }
      }),
  )
}

/**
 * Der Weg 308A einer UK-Session → Pflicht-306 → Entwurf → „Fortsetzen" aus
 * der Liste → Absenden. Die Regeln dahinter prüft Ebene 1; hier, dass das
 * Formular sie auch benutzt — vorher lagen sie dort von Hand ausgeschrieben:
 *  - GRD-16 (high): Um 00:30 in Wien ist in UTC noch gestern. Vorbelegt war
 *    das Datum von gestern, und das richtige galt als „in der Zukunft".
 *  - GRD-04 (high): Das 306 einer UK-Session startete mit AT und druckte
 *    AT.ATO.106.
 *  - GRD-06 (high) samt Nachtrag: Unsichtbare Kopfwerte (Training Device,
 *    Qualifikation, Sitz) standen im 306.
 *  - GRD-01 (high): „Fortsetzen" öffnete das 306 ohne Elternblatt — leer,
 *    und gespeichert ohne parentId.
 *  - GRD-03/GTY-06 (high): Zulassungsnummer und Empfänger kamen beim 306 zur
 *    Druckzeit aus den Einstellungen.
 */
test.describe('Folgeformular einer UK-Session — kurz nach Mitternacht in Wien', () => {
  test.use({ timezoneId: 'Europe/Vienna' })

  test('306 erbt Behörde und Datum, setzt aus der Liste fort und friert Zulassung und Empfänger ein', async ({ page }) => {
    // 02.11.2026, 00:30 Ortszeit — in UTC noch der 01.11.
    await page.clock.setFixedTime(new Date('2026-11-01T23:30:00Z'))
    await anmelden(page)
    const fragen: string[] = []
    page.on('dialog', (d) => {
      fragen.push(d.message())
      void d.accept()
    })

    await page.goto('/#/grading/new')
    await page.getByLabel('Form type').selectOption('308A')
    await expect(page.locator('#field-date')).toHaveValue('2026-11-02')
    await page.getByRole('textbox', { name: 'Student name' }).fill('Sophie Testpilotin')
    await page.getByLabel('Approving authority *').selectOption('UK')
    const auswahl = page.locator('main select')
    for (let i = 0; i < (await auswahl.count()); i++) {
      const s = auswahl.nth(i)
      if ((await s.isDisabled()) || (await s.inputValue())) continue
      await s.selectOption({ index: 1 })
    }
    const ffs = page.getByRole('button', { name: /FFS$/ })
    if ((await ffs.getAttribute('aria-pressed')) !== 'true') await ffs.click()
    await page.getByRole('button', { name: /Continue to grading/ }).click()

    // Alles 3, die erste Kompetenz 1 — damit ist der Pilot nicht bestanden.
    const drei = page.locator('main button[aria-label$=": 3"]')
    for (let i = 0; i < (await drei.count()); i++) await drei.nth(i).click()
    await page.locator('main button[aria-label$=": 1"]').first().click()
    await page.locator('main input[aria-required=true]').first().fill('Checklist not used')
    for (const feld of await page.locator('#zusammen-0 textarea').all()) await feld.fill('Debriefed')
    await page.getByRole('button', { name: 'Completed', exact: true }).click()
    for (const feld of await page.locator('#sessiondaten select').all()) await feld.selectOption({ index: 3 })
    await unterschreiben(page, page.locator('main canvas').nth(0))
    await unterschreiben(page, page.locator('main canvas').nth(1))
    await page.locator('.formularleiste').getByRole('button', { name: 'Complete and send' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Open form' }).click()
    // Das richtige Datum ist keine Zukunft (GRD-16).
    expect(fragen.filter((f) => /future/i.test(f))).toEqual([])

    // Das 306: Behörde des Elternblatts, nur angezeigt (GRD-04).
    await expect(page.getByText('306 · Follow-up to 308A')).toBeVisible()
    const elternId = new URL(page.url().replace('#/', '')).searchParams.get('parent')!
    expect(elternId).toMatch(/^gr-/)
    await expect(page.getByText('UK CAA — GBR.ATO.0541')).toBeVisible()
    await expect(page.getByLabel('Approving authority *')).toHaveCount(0)
    await expect(page.locator('#field-date')).toHaveValue('2026-11-02')

    await page.locator('#field-location').selectOption({ index: 1 })
    await page.locator('#field-event').fill('Retraining KNO')
    await page.getByLabel('Description of deficiency').fill('Checklist discipline')
    const entwurf = () =>
      page.evaluate(() => {
        const k = Object.keys(localStorage).find((x) => x.startsWith('aaa-draft-'))
        return k ? { k, d: JSON.parse(localStorage.getItem(k)!) as { header: Record<string, string>; authority: string } } : null
      })
    await expect.poll(async () => (await entwurf())?.d.header.event).toBe('Retraining KNO')
    const gesichert = (await entwurf())!
    expect(gesichert.k).toContain(`-${elternId}-306`)
    expect(gesichert.d.authority).toBe('UK')
    // Was das 306 nicht zeigt, trägt es nicht (GRD-06 und Nachtrag).
    expect(Object.keys(gesichert.d.header).filter((k) => ['trainingDevice', 'instructorQual', 'instructorSeat'].includes(k))).toEqual([])

    // Verlassen und aus der Liste fortsetzen (GRD-01).
    await page.getByRole('button', { name: 'Zurück', exact: true }).click()
    await expect(page).toHaveURL(/#\/grading$/)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`parent=${elternId}`))
    await expect(page.getByText('306 · Follow-up to 308A')).toBeVisible()
    await expect(page.getByText('A draft of this form was restored.')).toBeVisible()
    await expect(page.getByLabel('Description of deficiency')).toHaveValue('Checklist discipline')

    await page.getByLabel('Description of agreed retraining').fill('Briefing and sim session')
    await page.getByRole('button', { name: /^Continue/ }).click()
    await unterschreiben(page, page.locator('main canvas').nth(0))
    await unterschreiben(page, page.locator('main canvas').nth(1))
    await page.locator('.formularleiste').getByRole('button', { name: 'Complete and send' }).click()
    await expect(page).not.toHaveURL(/grading\/new/)

    // Der Speicher schreibt verzögert (store.tsx) — bis dahin warten.
    const finde = async () => (await gespeicherteFormulare(page)).find((r) => r.formTypeId === '306' && r.parentId === elternId)
    await expect.poll(async () => (await finde())?.status).toBe('signed')
    const r306 = (await finde())!
    expect(r306.authority).toBe('UK')
    expect(r306.header.date).toBe('2026-11-02')
    expect(r306.docSnapshot?.approval).toBe('GBR.ATO.0541')
    expect(r306.recipients?.length).toBeGreaterThan(0)
    expect(Object.keys(r306.header)).not.toContain('trainingDevice')

    // Spätere Einstellungen ändern den Nachweis nicht (GRD-03, GTY-06).
    await page.goto('/#/admin/settings')
    await page.getByLabel('Genehmigungsnummer (UK)').fill('GBR.ATO.9999')
    await page.goto(`/#/grading/${r306.id}`)
    await expect(page.getByText(`Recipients: ${r306.recipients!.join(', ')}`)).toBeVisible()
    await expect(page.getByText(/matches the signed content/)).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    const druck = await page.locator('body').innerText()
    expect(druck).toContain('GBR.ATO.0541')
    expect(druck).not.toContain('GBR.ATO.9999')
  })
})

/**
 * Audit 11/2026, A11Y-01/MOB-03 (high, WCAG 2.4.11): Der Browser scrollte ein
 * per Tab erreichtes Element nur bis an den Fensterrand — dort stehen
 * Formularleiste, Sandbox-Leiste und Kopfleiste. Auf dem iPad waren 34 von
 * 196 Fokuszielen verdeckt, „LTW · Leadership & teamwork: 1" ganz. Layout
 * gibt es nur im Browser, deshalb Ebene 3.
 */
test.describe('Fokus nie hinter einer Leiste — iPad Pro 11', () => {
  const { defaultBrowserType: _browser, ...profil } = devices['iPad Pro 11']
  test.use(profil)

  test('Schritt 2 eines 308A: 150× Tab vorwärts und zurück', async ({ page }) => {
    await anmelden(page)
    await zuSchritt2(page)
    const verdeckt: string[] = []
    let gezaehlt = 0
    for (const taste of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < 150; i++) {
        await page.keyboard.press(taste)
        const r = await page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null
          if (!a || a === document.body) return null
          const leiste = document.querySelector('.formularleiste')
          const sandbox = document.querySelector('div.sticky.bottom-0')
          const kopf = document.querySelector('header')
          // Was IN einer Leiste steht, kann sie nicht verdecken.
          if (leiste?.contains(a) || sandbox?.contains(a) || kopf?.contains(a)) return null
          const rect = a.getBoundingClientRect()
          const unten = Math.min(leiste?.getBoundingClientRect().top ?? innerHeight, sandbox?.getBoundingClientRect().top ?? innerHeight)
          const oben = kopf?.getBoundingClientRect().bottom ?? 0
          const frei = rect.bottom <= unten + 0.5 && rect.top >= oben - 0.5
          const name = (a.getAttribute('aria-label') || a.textContent || a.tagName).trim().slice(0, 40)
          return { frei, text: `${name} [${Math.round(rect.top)}–${Math.round(rect.bottom)}, frei ${Math.round(oben)}–${Math.round(unten)}]` }
        })
        if (!r) continue
        gezaehlt++
        if (!r.frei) verdeckt.push(`${taste}: ${r.text}`)
      }
    }
    // Ohne nennenswerte Zahl geprüfter Stopps wäre „nichts verdeckt" wertlos.
    expect(gezaehlt).toBeGreaterThan(200)
    expect(verdeckt).toEqual([])
  })
})

/**
 * 308F im Desktop-Browser — was an Rollen, Namen und Fokus hängt:
 *  - GTY-12/A11Y-16: Der Fehler „Please choose either …" sprang nicht zur
 *    Gruppe (sie hatte keine id), der Fokus blieb auf dem Weiter-Knopf, die
 *    Meldung stand weit unten; das Paar war vorher nicht als Pflicht erkennbar.
 *  - A11Y-08: CDR/FO und Left/Right ohne aria-pressed und ohne Gruppennamen.
 *  - A11Y-07/MOB-05: Pilotenname, Empfängerfeld, „+" und „×" ohne Namen,
 *    „×" mit 13 px Trefferfläche.
 */
test('308F: Entweder-oder führt zur Gruppe, Umschalter und Empfänger tragen Namen und Zustand', async ({ page }) => {
  await anmelden(page)
  await page.goto('/#/grading/new')
  await page.getByLabel('Form type').selectOption('308F')
  await page.getByRole('textbox', { name: 'Student name' }).fill('Sophie Testpilotin')

  await expect(page.getByRole('group', { name: 'Trainee position' }).getByRole('button', { name: 'CDR', pressed: true })).toBeVisible()
  const sitz = page.getByRole('group', { name: 'Trainee seat' })
  await sitz.getByRole('button', { name: 'Left', pressed: false }).click()
  await expect(sitz.getByRole('button', { name: 'Left', pressed: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Instructor seat' }).getByRole('button')).toHaveCount(3)

  // Übrige Pflichtfelder von Schritt 1 belegen — bis auf das Entweder-oder-Paar.
  const muster = page.locator('#field-aircraftType')
  if (!(await muster.inputValue())) await muster.selectOption({ index: 1 })
  await page.locator('#field-event').fill('Recurrent 1')
  const geraet = page.locator('#field-trainingDevice')
  if ((await geraet.locator('[aria-pressed=true]').count()) === 0) await geraet.getByRole('button').first().click()

  await expect(page.getByText('Either this or “Recurrent Training — Recurrent by ATA” is required.')).toBeVisible()
  await page.getByRole('button', { name: /Continue to grading/ }).click()
  const zyklus = page.locator('#field-recurrentCycle')
  await expect(zyklus).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#field-ataChapters')).toHaveAttribute('aria-invalid', 'true')
  expect(await zyklus.evaluate((g) => g.contains(document.activeElement) && document.activeElement?.tagName === 'BUTTON')).toBe(true)
  // Die Meldung steht beim Feld, nicht nur unter dem Knopf.
  await expect(page.locator('#feld-fehler')).toBeInViewport()

  await zyklus.getByRole('button').first().click()
  await page.getByRole('button', { name: /Continue to grading/ }).click()
  await expect(page.locator('.formularleiste')).toBeVisible()

  await page.getByRole('textbox', { name: 'Additional recipient (email)' }).fill('ops@example.test')
  await page.getByRole('button', { name: 'Add recipient' }).click()
  const entfernen = page.getByRole('button', { name: 'Remove recipient ops@example.test' })
  const flaeche = (await entfernen.boundingBox())!
  expect(Math.min(flaeche.width, flaeche.height)).toBeGreaterThanOrEqual(44)
  await entfernen.click()
  await expect(entfernen).toHaveCount(0)
})

/**
 * Audit 11/2026, GTY-10: Das 308G-Formular sagte „Instructor signature",
 * „Trainee signature" und „Add another pilot", das Dokument „Course
 * Instructor (COI)" und „Candidate Instructor (CAI)"; die offenen Punkte
 * nannten Kürzel („PRE", „CLI"), die das Formular nicht zeigt. Die Wörter
 * prüft gradingRules.test.ts; hier, dass das Formular sie benutzt.
 */
test('308G: Personen und Unterschriften wie auf dem Dokument, offene Punkte ohne Kürzel', async ({ page }) => {
  await anmelden(page)
  await page.goto('/#/grading/new')
  // Erst ein 308A mit Device und Qualifikation, dann der Wechsel: Beide
  // Werte zeigt das 308G nicht — sie blieben unsichtbar im Kopf
  // (Gegenprüfung zu GRD-06, `kopfFuerTyp`).
  await page.getByLabel('Form type').selectOption('308A')
  const ffs = page.getByRole('button', { name: /FFS$/ })
  if ((await ffs.getAttribute('aria-pressed')) !== 'true') await ffs.click()
  await page.getByRole('group', { name: 'Instructor qualification' }).getByRole('button', { name: 'TKI' }).click()
  await page.getByLabel('Form type').selectOption('308G')
  await expect(page.getByRole('button', { name: 'Add another candidate instructor' })).toBeVisible()
  await expect(page.getByText('Course Instructor', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Candidate Instructor name' }).fill('Kandidat Test')
  const kopf = () =>
    page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.endsWith('-new-308G'))
      return k ? Object.keys((JSON.parse(localStorage.getItem(k)!) as { header: object }).header).sort() : null
    })
  await expect.poll(kopf).not.toBeNull()
  expect((await kopf())!.filter((k) => ['trainingDevice', 'instructorQual', 'instructorSeat'].includes(k))).toEqual([])
  for (const key of ['candidateQual', 'candidateSeat', 'coiSeat', 'operation', 'program']) {
    const gruppe = page.locator(`#field-${key}`)
    if ((await gruppe.locator('[aria-pressed=true]').count()) === 0) await gruppe.getByRole('button').first().click()
  }
  const muster = page.locator('#field-aircraftType')
  if (!(await muster.inputValue())) await muster.selectOption({ index: 1 })
  await page.getByRole('button', { name: /Continue to grading/ }).click()
  await expect(page.locator('.formularleiste')).toBeVisible()

  await expect(page.getByText('Signature Course Instructor (COI)', { exact: true })).toBeVisible()
  await expect(page.getByText('Signature Candidate Instructor (CAI) — Kandidat Test', { exact: true })).toBeVisible()
  const punkte = await offenePunkte(page)
  expect(punkte).toContain('Kandidat Test · Prepare resources — missing')
  expect(punkte.filter((p) => /· [A-Z]{2,4} —/.test(p))).toEqual([])
})
