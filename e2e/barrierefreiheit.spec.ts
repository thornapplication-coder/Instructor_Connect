import type { Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { anmelden, cspAbweisungen, docCheckOeffnen, expect, test } from './hilfen'

/**
 * Barrierefreiheit im echten Browser — was Ebene 2 nicht sehen kann, weil
 * es Layout, Zeichnen oder den echten Fokuswechsel nach dem Rendern braucht.
 */

/** Steht der Fokus auf der Überschrift der Seite? */
const fokusAufUeberschrift = (page: Page) => page.evaluate(() => document.activeElement?.matches('[data-page-heading]') ?? false)

/**
 * Schneidet ein Vorfahr mit `overflow` den Fokusring ab? Gemessen wird der
 * Ring selbst: Kasten des Elements plus Abstand und Breite des Umrisses.
 */
async function ringAbgeschnitten(knopf: Locator): Promise<string[]> {
  return knopf.evaluate((el) => {
    const s = getComputedStyle(el)
    const rand = parseFloat(s.outlineOffset) + parseFloat(s.outlineWidth)
    const r = el.getBoundingClientRect()
    const ring = { l: r.left - rand, t: r.top - rand, r: r.right + rand, b: r.bottom + rand }
    const schnitte: string[] = []
    if (s.outlineStyle === 'none' || rand <= 0) schnitte.push(`kein Umriss (${s.outlineStyle} ${s.outlineWidth})`)
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a)
      if (o.overflowX === 'visible' && o.overflowY === 'visible') continue
      const k = a.getBoundingClientRect()
      if (ring.l < k.left || ring.t < k.top || ring.r > k.right || ring.b > k.bottom) schnitte.push(`${a.tagName}.${a.className}`)
    }
    return schnitte
  })
}

test.describe('Fokusführung (Audit 11/2026, A11Y-03/A11Y-17)', () => {
  test('nach der Anmeldung steht der Fokus auf der Überschrift, nicht auf <body>', async ({ page }) => {
    await anmelden(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Instructor Connect' })).toBeVisible()
    await expect.poll(() => fokusAufUeberschrift(page)).toBe(true)
  })

  test('Dialog mit Eingabefeld: Escape bringt den Fokus zurück auf den Auslöser', async ({ page }) => {
    await anmelden(page)
    await page.goto('/#/notes')
    const oeffner = page.getByRole('button', { name: 'Neue Notiz' })
    await oeffner.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Neue Notiz' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel(/Titel/)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(oeffner).toBeFocused()
  })

  test('DocCheck-Hinweis (beim Laden geöffnet): nach „Verstanden" steht der Fokus auf der Überschrift', async ({ page }) => {
    await anmelden(page)
    await docCheckOeffnen(page)
    await expect(page.getByRole('heading', { level: 1, name: 'DocCheck' })).toBeVisible()
    await expect.poll(() => fokusAufUeberschrift(page)).toBe(true)
  })
})

/**
 * Audit 11/2026, UID-04: In einem `space-y-stack` bekam die Abdunklung
 * 12 px margin-top. Ein Klick in den hellen Streifen traf den Zurück-Knopf
 * der Kopfleiste — die Eingaben im Dialog waren ohne Rückfrage weg.
 */
test('Dialog im Admin-Panel deckt den ganzen Bildschirm ab — auch die oberste Zeile', async ({ page }) => {
  await anmelden(page)
  await page.goto('/#/admin/users')
  // Lage des Zurück-Knopfs, solange er noch frei liegt — dorthin zielt der Klick unten.
  const zurueck = (await page.getByRole('button', { name: 'Zurück', exact: true }).boundingBox())!
  await page.getByRole('button', { name: 'Benutzer anlegen' }).click()
  const dialog = page.getByRole('dialog', { name: 'Benutzer anlegen' })
  await expect(dialog).toBeVisible()
  const oben = await page.evaluate(() => {
    const e = document.elementFromPoint(window.innerWidth / 2, 2)
    return { rolle: e?.getAttribute('role'), anBody: e?.parentElement === document.body, top: e?.getBoundingClientRect().top }
  })
  expect(oben).toEqual({ rolle: 'presentation', anBody: true, top: 0 })

  // Der Weg aus dem Nachtrag UIDESK#2: Name eingetragen, Klick 9 px unter
  // dem Rand über dem Zurück-Knopf (oben bei 6 px). Vorher sprang die App
  // auf die Startseite und die Eingabe war ohne Rückfrage weg; jetzt trifft
  // der Klick die Abdunklung, und die fragt vor dem Verwerfen.
  const name = dialog.getByLabel('Name', { exact: true })
  await name.fill('Probe')
  expect(zurueck.y, 'Zurück-Knopf reicht in den früheren Streifen').toBeLessThan(12)
  const fragen: string[] = []
  page.once('dialog', (d) => {
    fragen.push(d.message())
    void d.dismiss()
  })
  await page.mouse.click(zurueck.x + zurueck.width / 2, 9)
  await expect.poll(() => fragen).toEqual(['Eingaben verwerfen und schließen?'])
  await expect(page).toHaveURL(/#\/admin\/users$/)
  await expect(name).toHaveValue('Probe')
})

/**
 * Audit 11/2026, A11Y-09/A11Y-08/KERN-20: Der Rahmen des Sprachumschalters
 * schnitt mit `overflow-hidden` den Fokusring ab; auf der Anmeldeseite
 * fehlte `aria-pressed`, und „Andere E-Mail-Adresse verwenden" war 18 px hoch.
 */
test.describe('Sprachumschalter und Anmeldeseite', () => {
  test('Anmeldeseite: Zustand gemeldet, Fokusring sichtbar, Trefferfläche ≥ 44 px', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aaa-lang', 'de'))
    await page.goto('/')
    const gruppe = page.getByRole('group', { name: 'Sprache' })
    await expect(gruppe.getByRole('button', { name: 'de', pressed: true })).toBeVisible()
    const en = gruppe.getByRole('button', { name: 'en', pressed: false })
    // Per Tastatur dorthin, damit :focus-visible greift wie beim Nutzer.
    await page.locator('body').click({ position: { x: 5, y: 400 } })
    for (let i = 0; i < 10 && !(await en.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(en).toBeFocused()
    expect(await ringAbgeschnitten(en)).toEqual([])

    await page.getByLabel('E-Mail-Adresse').fill('alex.beispiel@example.test')
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
    const anders = page.getByRole('button', { name: 'Andere E-Mail-Adresse verwenden' })
    expect((await anders.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  })

  test('Startseite: derselbe Umschalter, Fokusring auf „DE" und „EN" nicht abgeschnitten', async ({ page }) => {
    await anmelden(page)
    const gruppe = page.getByRole('group', { name: 'Sprache' })
    // Der Fokus steht nach der Anmeldung auf der Überschrift; der Umschalter
    // liegt in der Kopfzeile davor — also rückwärts: erst „EN", dann „DE".
    for (const name of ['en', 'de']) {
      const knopf = gruppe.getByRole('button', { name })
      for (let i = 0; i < 15 && !(await knopf.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press('Shift+Tab')
      await expect(knopf).toBeFocused()
      expect(await ringAbgeschnitten(knopf), name).toEqual([])
    }
  })
})

/**
 * Audit 11/2026, UID-10: Die Seitenüberschrift nimmt nach einem
 * Seitenwechsel den Fokus (Sprachausgabe, Tabulator-Einstieg) — die globale
 * `:focus-visible`-Regel zog dann einen 792 px breiten Rahmen um sie, als
 * wäre sie ein Eingabefeld.
 */
test('Seitenwechsel per Tastatur: Fokus auf der Überschrift, aber ohne Rahmen', async ({ page }) => {
  await anmelden(page)
  const kachel = page.locator('main .grid > button', { hasText: 'Lesson Plan' })
  await kachel.focus()
  await page.keyboard.press('Enter')
  const h1 = page.locator('header h1[data-page-heading]')
  await expect(h1).toHaveText('Lesson Plan')
  await expect(h1).toBeFocused()
  const stil = await h1.evaluate((e) => ({ sichtbarerFokus: e.matches(':focus-visible'), umriss: getComputedStyle(e).outlineStyle }))
  // Gegenprobe im selben Lauf: Der Fokus kam per Tastatur, die Regel hätte gegriffen.
  expect(stil).toEqual({ sichtbarerFokus: true, umriss: 'none' })
})

/**
 * Gliederung einer Seite, wie axe sie prüft (heading-order,
 * landmark-one-main, page-has-heading-one): Überschriften in
 * Dokumentreihenfolge, unsichtbare (`display: none`, etwa der Druckkopf)
 * zählen nicht, `sr-only` schon.
 */
async function gliederung(page: Page) {
  return page.evaluate(() => {
    const zaehlt = (e: Element) => (e as HTMLElement).getClientRects().length > 0
    const stufen = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role=heading]')]
      .filter(zaehlt)
      .map((h) => ({ stufe: Number(h.getAttribute('aria-level') ?? h.tagName.slice(1)), text: (h.textContent ?? '').trim().slice(0, 40) }))
    const spruenge = stufen.slice(1).flatMap((h, i) => (h.stufe > stufen[i].stufe + 1 ? [`h${stufen[i].stufe} „${stufen[i].text}" → h${h.stufe} „${h.text}"`] : []))
    return {
      hauptbereiche: document.querySelectorAll('main, [role=main]').length,
      h1: stufen.filter((h) => h.stufe === 1).length,
      spruenge,
      titel: document.title,
    }
  })
}

/**
 * Audit 11/2026, A11Y-14 und A11Y-13: Überschriften sprangen von h1 auf h3
 * (CardHeading ohne SectionHeading davor), die Anmeldeseite hatte kein
 * <main>, die Gerätevorschau weder <main> noch h1 — und jede Ansicht hieß im
 * Fenstertitel „Instructor Connect".
 */
test('Gliederung und Fenstertitel: eine Hauptlandmarke, eine h1, keine übersprungene Ebene', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('aaa-lang', 'de'))
  await page.goto('/')
  await expect(page.getByLabel('E-Mail-Adresse')).toBeVisible()
  expect(await gliederung(page), 'Anmeldung').toEqual({ hauptbereiche: 1, h1: 1, spruenge: [], titel: 'Anmelden – Instructor Connect' })

  await anmelden(page)
  const seiten: [string, string][] = [
    ['/#/logbook', 'my AAA Logbook – Instructor Connect'],
    ['/#/notes', 'Notes – Instructor Connect'],
    ['/#/admin/settings', 'Admin Panel · Einstellungen – Instructor Connect'],
    ['/#/admin/logbook', 'Admin Panel · Logbuch – Instructor Connect'],
    ['/#/admin/grading/config', 'Admin Panel · Grading Tool – Instructor Connect'],
    ['/#/admin/grading/monthly', 'Admin Panel · Grading Tool – Instructor Connect'],
    ['/#/grading/new?type=308A', 'New form – Instructor Connect'],
    ['/#/device', 'iPhone/iPad-Vorschau – Instructor Connect'],
  ]
  for (const [pfad, titel] of seiten) {
    await page.goto(pfad)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect.poll(async () => (await gliederung(page)).titel, pfad).toBe(titel)
    expect(await gliederung(page), pfad).toEqual({ hauptbereiche: 1, h1: 1, spruenge: [], titel })
  }

  // Statistik: Der Drucktitel benennt das PDF und geht dem Seitentitel vor
  // (useDruckTitel); die Kompetenzsätze sind Überschriften über ihren Karten.
  await page.goto('/#/admin/grading/stats')
  await expect(page.getByRole('heading', { level: 2, name: /Pilot competencies/ })).toBeVisible()
  const statistik = await gliederung(page)
  expect(statistik.spruenge, 'Statistik').toEqual([])
  expect(statistik.titel).toMatch(/^Analytics_/)

  await docCheckOeffnen(page)
  await expect(page.getByRole('heading', { level: 1, name: 'DocCheck' })).toBeVisible()
  expect(await gliederung(page), 'DocCheck').toEqual({ hauptbereiche: 1, h1: 1, spruenge: [], titel: 'DocCheck – Instructor Connect' })

  // Zurück auf der Startseite gilt wieder der App-Name — kein Titel bleibt hängen.
  await page.goto('/#/')
  await expect.poll(async () => (await gliederung(page)).titel).toBe('Instructor Connect')
})

/**
 * Mechanische Prüfung mit axe-core (Audit 11/2026, A11Y-07): 12 Auswahl-
 * felder und 9 Symbolknöpfe wurden als „Kombinationsfeld", „Schalter" ohne
 * Namen angesagt, vier Eingabefelder verloren mit dem ersten Zeichen ihre
 * einzige Beschriftung (Platzhalter). Gefunden hatte das nur ein Prüfer mit
 * axe — kein Test. Jetzt laufen die Regeln auf den Seiten, wo die Fehler
 * lagen, und auf den übrigen Hauptansichten.
 *
 * Eingespielt per `page.evaluate`, nicht als <script>: Die Seite läuft mit
 * ihrer CSP (nur eigene Skripte), und die Wache in `hilfen.ts` ließe jedes
 * eingefügte Skript scheitern — zu Recht.
 */
const AXE_QUELLE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const AXE_REGELN = ['button-name', 'select-name', 'label', 'heading-order', 'landmark-one-main', 'page-has-heading-one']

async function axeVerstoesse(page: Page): Promise<string[]> {
  await page.evaluate(AXE_QUELLE)
  return page.evaluate(async (regeln) => {
    type Ergebnis = { violations: { id: string; nodes: { target: string[]; html: string }[] }[] }
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<Ergebnis> } }).axe
    const r = await axe.run(document, { runOnly: { type: 'rule', values: regeln }, resultTypes: ['violations'] })
    return r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} ${n.html.slice(0, 90)}`))
  }, AXE_REGELN)
}

/** Seite laden und warten, bis ihre Überschrift steht — axe liefe sonst über den Ladezustand. */
async function seite(page: Page, pfad: string) {
  await page.goto(pfad)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
}

test.describe('axe-core: Namen, Beschriftungen, Gliederung (Audit 11/2026, A11Y-07)', () => {
  test('Anmeldung und Gerätevorschau', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aaa-lang', 'de'))
    await page.goto('/')
    await expect(page.getByLabel('E-Mail-Adresse')).toBeVisible()
    // Gegenprobe im selben Lauf: Ein Knopf ohne Namen MUSS gemeldet werden —
    // sonst wäre die Wache still grün, etwa weil axe nicht geladen ist.
    await page.evaluate(() => {
      const k = document.createElement('button')
      k.id = 'probe-ohne-namen'
      document.querySelector('main')!.append(k)
    })
    expect((await axeVerstoesse(page)).join('\n')).toMatch(/button-name: #probe-ohne-namen/)
    await page.evaluate(() => document.getElementById('probe-ohne-namen')!.remove())
    expect(await axeVerstoesse(page), 'Anmeldung').toEqual([])
    await page.goto('/#/device')
    await expect(page.getByRole('button', { name: 'Vorschau neu laden' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Drehen' })).toBeVisible()
    expect(await axeVerstoesse(page), 'Gerätevorschau').toEqual([])
  })

  test('Verwaltung, Grading-Ablage, Chat, Logbuch, DocCheck', async ({ page }) => {
    test.setTimeout(240_000)
    await anmelden(page)
    for (const pfad of [
      '/#/admin/grading/records',
      '/#/admin/grading/stats',
      '/#/admin/grading/standardisation',
      '/#/admin/settings',
      '/#/admin/users',
      '/#/chat/g-auto',
      '/#/logbook',
      '/#/grading',
      '/#/grading/new?type=308A',
    ]) {
      await seite(page, pfad)
      expect(await axeVerstoesse(page), pfad).toEqual([])
    }
    await docCheckOeffnen(page)
    await expect(page.getByRole('heading', { level: 1, name: 'DocCheck' })).toBeVisible()
    expect(await axeVerstoesse(page), 'DocCheck').toEqual([])
  })

  test('Grading Schritt 2 (Empfänger, Unterschrift, offene Punkte)', async ({ page }) => {
    await anmelden(page)
    await page.goto('/#/grading/new')
    await page.getByLabel('Form type').selectOption('308A')
    await page.getByPlaceholder('Student name').fill('Sophie Testpilotin')
    const auswahl = page.locator('main select')
    for (let i = 0; i < (await auswahl.count()); i++) {
      const s = auswahl.nth(i)
      if ((await s.isDisabled()) || (await s.inputValue())) continue
      const erste = await s.locator('option').evaluateAll((o) => (o as HTMLOptionElement[]).map((x) => x.value).find(Boolean))
      if (erste) await s.selectOption(erste)
    }
    const ffs = page.getByRole('button', { name: /FFS$/ })
    if ((await ffs.getAttribute('aria-pressed')) !== 'true') await ffs.click()
    await page.getByRole('button', { name: /Continue to grading/ }).click()
    await expect(page.locator('.formularleiste')).toBeVisible()
    expect(await axeVerstoesse(page), 'Schritt 2').toEqual([])
  })
})

/**
 * Fokus nicht verdeckt (WCAG 2.4.11): Rückwärts durch die Einstellungen —
 * jeder Halt muss an mindestens einer Stelle zu sehen sein, nicht unter der
 * Kopfleiste oder einem Streifen am unteren Rand.
 */
test('Einstellungen: Shift+Tab hält nie unter einer festen Leiste', async ({ page }) => {
  await anmelden(page)
  await seite(page, '/#/admin/settings')
  await page.keyboard.press('End')
  await page.locator('main').evaluate(() => {
    const alle = [...document.querySelectorAll<HTMLElement>('main button, main input, main select, main textarea, main a[href]')]
    alle.at(-1)?.focus()
  })
  const verdeckt: string[] = []
  let halte = 0
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Shift+Tab')
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body || el.closest('header, .formularleiste, [class*="fixed"]')) return null
      const r = el.getBoundingClientRect()
      const punkte = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + 3, r.top + 3],
        [r.right - 3, r.bottom - 3],
      ]
      const sichtbar = punkte.some(([x, y]) => {
        const t = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight ? document.elementFromPoint(x, y) : null
        return !!t && (t === el || el.contains(t) || t.contains(el))
      })
      return { name: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40), sichtbar }
    })
    if (!info) continue
    halte++
    if (!info.sichtbar) verdeckt.push(info.name)
  }
  expect(halte).toBeGreaterThan(20)
  expect(verdeckt).toEqual([])
})

/**
 * „Bewegung reduzieren" (Audit 11/2026, A11Y-15): Die Kachel hebt sich beim
 * Überfahren nicht mehr, Übergänge laufen nicht. Die Regel steht in CSS
 * (index.css) — prüfbar erst im Browser.
 */
test('Bewegung reduzieren: Kachel ohne Hub, Übergänge ohne Dauer', async ({ browser }) => {
  for (const [modus, hub] of [
    ['reduce', false],
    ['no-preference', true],
  ] as const) {
    const context = await browser.newContext({ reducedMotion: modus, viewport: { width: 1280, height: 900 } })
    const abgewiesen = await cspAbweisungen(context)
    const page = await context.newPage()
    await anmelden(page)
    const kachel = page.locator('main .grid > button', { hasText: 'Lesson Plan' })
    await kachel.hover()
    // Ohne Reduzierung läuft der Übergang — auf sein Ende warten.
    await expect
      .poll(() => kachel.evaluate((e) => getComputedStyle(e).transform), { message: modus })
      .toBe(hub ? 'matrix(1, 0, 0, 1, 0, -2)' : 'none')
    const dauer = await kachel.evaluate((e) => parseFloat(getComputedStyle(e).transitionDuration))
    if (hub) expect(dauer).toBeGreaterThan(0.05)
    else expect(dauer).toBeLessThan(0.001)
    expect(abgewiesen).toEqual([])
    await context.close()
  }
})
