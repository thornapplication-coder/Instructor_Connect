import { expect, test } from './hilfen'

/**
 * Audit 11/2026, R3-E2E-ZEITZONE: Ebene 3 lief in der Zone der Maschine — in
 * der CI UTC. Dort ist der UTC-Tag der Ortstag, und ein Datum aus
 * `toISOString()` statt `lokalerTag` fiel keinem Browser-Test auf.
 * `playwright.config.ts` setzt deshalb Europe/Vienna für alle Projekte; hier
 * steht, dass die Einstellung im Browser auch ankommt (Gegenstück zu
 * `src/test/zeitzone*.test.ts` für Ebene 1 und 2). Das Telefon-Projekt prüft
 * dasselbe in `mobil.spec.ts`.
 *
 * Gegenprobe: `timezoneId` in playwright.config.ts entfernt → rot (Zone
 * „UTC", Versatz 0).
 */
test('Ebene 3 läuft in Wiener Ortszeit — nicht in der der Maschine', async ({ page }) => {
  await page.goto('/')
  const zone = await page.evaluate(() => ({
    name: Intl.DateTimeFormat().resolvedOptions().timeZone,
    // 02.11.2026, 00:00 in Wien: eine Stunde vor UTC, im UTC-Kalender noch der 01.11.
    versatz: new Date(2026, 10, 2).getTimezoneOffset(),
    utcTag: new Date(2026, 10, 2).toISOString().slice(0, 10),
  }))
  expect(zone).toEqual({ name: 'Europe/Vienna', versatz: -60, utcTag: '2026-11-01' })
})
