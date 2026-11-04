import { test as basis, expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppState } from '../src/types'

export { expect }

/**
 * Wache für die Content-Security-Policy (Audit 11/2026, SEC-07). Die
 * Richtlinie steht nur im Build; ob sie etwas Nötiges sperrt (pdf.js-Worker,
 * Export, Offline-Start), zeigt sich erst hier.
 *
 * Erkannt wird zweifach: am standardisierten Ereignis
 * `securitypolicyviolation` (per Init-Skript als „CSP-Verstoß: …" in die
 * Konsole gemeldet) und an Chromes eigener Konsolenzeile. Nicht am
 * Wortlaut „Refused to …" allein: Den hat Chrome geändert („… violates the
 * following Content Security Policy directive … The action has been
 * blocked.") — eine Wache, die nur ihn suchte, lief nachgemessen ins Leere,
 * während die Seite das Inline-Skript tatsächlich sperrte.
 * Die Liste füllt sich laufend.
 */
export async function cspAbweisungen(context: BrowserContext): Promise<string[]> {
  const abgewiesen: string[] = []
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP-Verstoß: ${e.effectiveDirective} ${e.blockedURI}`))
  })
  context.on('console', (m) => {
    if (/CSP-Verstoß|Content Security Policy|Refused to/.test(m.text())) abgewiesen.push(m.text())
  })
  return abgewiesen
}

/**
 * `test` mit CSP-Wache für den Standard-Kontext: Jede Abweisung lässt den
 * Test scheitern. Wer einen eigenen Kontext öffnet, meldet ihn mit
 * `cspAbweisungen` selbst an.
 */
export const test = basis.extend<{ cspWache: void }>({
  cspWache: [
    async ({ context }, use) => {
      const abgewiesen = await cspAbweisungen(context)
      await use()
      expect(abgewiesen, 'von der CSP abgewiesen').toEqual([])
    },
    { auto: true },
  ],
})

export const datei = (name: string) => join(fileURLToPath(new URL('./.dateien', import.meta.url)), name)
export const SUPERADMIN = 'alex.beispiel@example.test'

/**
 * Anmelden über den echten Weg der Sandbox: E-Mail → angezeigter Code →
 * bestätigen. Nur die Sprache wird vorher gesetzt — sie ist eine Vorliebe,
 * keine Sitzung.
 */
export async function anmelden(page: Page, email = SUPERADMIN, { startPruefung = false }: { startPruefung?: boolean } = {}): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem('aaa-lang')) localStorage.setItem('aaa-lang', 'de')
  })
  // Der Kurz-Check beim Start (SelbsttestWaechter) gilt hier als heute
  // erledigt: Ein Test, der die Uhr festhält (formular.spec.ts), sähe sonst
  // nach Sekunden zu Recht eine falsche Geräteuhr — und einen roten Streifen
  // über dem, was er gerade prüft. Den Check selbst prüft selbsttest.spec.ts
  // mit `startPruefung: true`.
  if (!startPruefung)
    await page.addInitScript(() => {
      localStorage.setItem('aaa-selbsttest-letzter', JSON.stringify({ zeit: Date.now(), stufe: 'ok' }))
    })
  // Relativ zur Basisadresse, nicht zum Wurzelpfad: Die veröffentlichte Seite
  // liegt unter /Instructor_Connect/ (live.spec.ts); „/" führte dort ins Leere.
  await page.goto('./')
  await page.getByLabel('E-Mail-Adresse').fill(email)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  const hinweis = await page.getByText(/Sandbox: dein Code lautet \d{6}/).textContent()
  const code = hinweis!.match(/\d{6}/)![0]
  await page.getByLabel('6-stelliger Code').fill(code)
  await page.getByRole('button', { name: 'Bestätigen und anmelden' }).click()
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toHaveCount(0)
  await fokusAngekommen(page)
}

/**
 * Wartet, bis die Seite ihren Fokus gesetzt hat — nach der Anmeldung und nach
 * jedem Seitenwechsel die Überschrift (`data-page-heading`, src/fokus.ts).
 *
 * Der Router legt ihn ein Bild später dorthin (requestAnimationFrame in
 * router.tsx). Ein Test, der vorher selbst fokussiert, verliert den Fokus an
 * die Überschrift; drückt er dann Enter, fällt die Taste ins Leere. Auf dem
 * CI-Runner geschah genau das (barrierefreiheit.spec.ts, „Escape bringt den
 * Fokus zurück", rot auf main bei 1.26.1 und in beiden PRs danach), lokal
 * nachgestellt mit einem um 20–30 ms verzögerten Bild. Ein Mensch drückt keine
 * Taste innerhalb eines Bildes — der Test soll es auch nicht.
 */
export async function fokusAngekommen(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.activeElement?.matches('[data-page-heading]') ?? false)).toBe(true)
}

/** Seitenwechsel über die Adresse, danach wie ein Mensch erst weiter, wenn die Seite steht. */
export async function seiteOeffnen(page: Page, pfad: string): Promise<void> {
  await page.goto(pfad)
  await fokusAngekommen(page)
}

/**
 * Wartet, bis der Service Worker die Seite steuert. Beim ersten Besuch lädt er
 * erst den Vorab-Cache und übernimmt die Seite danach (`clients.claim`,
 * src/swQuelle.ts) — vorher gibt es keinen Start ohne Netz, und der Selbsttest
 * nennt „Programmstand" zu Recht „nicht prüfbar". Ein festes Neuladen reichte
 * gegen vite preview, nicht gegen GitHub Pages: Die erste Nachkontrolle von
 * 1.28.0 war genau daran rot, der Vorab-Cache war beim Selbsttest noch nicht
 * geladen.
 */
export async function swKontrolliert(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise((ok) => navigator.serviceWorker.addEventListener('controllerchange', ok, { once: true }))
  })
}

/** DocCheck öffnen und den Hinweis der Sitzung bestätigen (Spez. 5.5 Nr. 2). */
export async function docCheckOeffnen(page: Page): Promise<void> {
  await page.goto('/#/doccheck')
  await page.getByRole('button', { name: 'Verstanden' }).click()
}

/**
 * Der gespeicherte Stand aus IndexedDB (persist.ts) — was nach einem
 * Neuladen gilt und was im Nachweis steht, nicht was gerade gerendert ist.
 */
export async function gespeicherterStand(page: Page): Promise<Pick<AppState, 'users' | 'gradingRecords'>> {
  return page.evaluate(
    () =>
      new Promise<Pick<AppState, 'users' | 'gradingRecords'>>((fertig, fehler) => {
        const rq = indexedDB.open('instructor-connect', 1)
        rq.onerror = () => fehler(rq.error)
        rq.onsuccess = () => {
          // Ein Wurf im Rückruf beendete das Versprechen nie — wer vor dem
          // ersten Schreiben fragte (expect.poll), wartete bis zum Zeitlimit.
          try {
            const g = rq.result.transaction('kv').objectStore('kv').get('aaa-state')
            g.onerror = () => fehler(g.error)
            g.onsuccess = () => {
              if (typeof g.result !== 'string') return fehler(new Error('noch kein Stand gespeichert'))
              try {
                const roh = JSON.parse(g.result)
                const stand = roh.state ?? roh
                fertig({ users: stand.users, gradingRecords: stand.gradingRecords })
              } catch (e) {
                fehler(e)
              }
            }
          } catch (e) {
            fehler(e)
          }
        }
      }),
  )
}

/** Strich mit der Maus — die Fläche erst in die Mitte holen, sonst liegt
 *  sie unter der Abschlussleiste und der Klick trifft die Leiste. */
export async function unterschreiben(page: Page, canvas: Locator): Promise<void> {
  await canvas.evaluate((c) => c.scrollIntoView({ block: 'center' }))
  const b = (await canvas.boundingBox())!
  await page.mouse.move(b.x + 20, b.y + b.height / 2)
  await page.mouse.down()
  for (let k = 1; k <= 20; k++) await page.mouse.move(b.x + 20 + (k * (b.width - 40)) / 20, b.y + b.height / 2 + Math.sin(k / 3) * 15)
  await page.mouse.up()
}
