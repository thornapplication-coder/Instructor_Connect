import { defineConfig, devices } from '@playwright/test'

/**
 * Nachkontrolle der VERÖFFENTLICHTEN Seite (e2e/live.spec.ts) — nach jeder
 * Veröffentlichung (deploy.yml) und im Nachtlauf (nachtlauf.yml).
 *
 * Ebene 3 prüft den Build vor dem Hochladen gegen `vite preview`. Was danach
 * passiert, sah bisher niemand: der Pfad unter GitHub Pages, dessen
 * Cache-Lebensdauer (TEC-01 entstand genau dort), die Kopfzeilen des
 * Hostings, die Serverzeit. Ohne webServer und ohne Testdateien — es gilt,
 * was unter LIVE_URL ausgeliefert wird.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: /live\.spec\.ts/,
  // Nach einer Veröffentlichung kann das CDN die alte Fassung noch Minuten
  // ausliefern (GitHub Pages: max-age=600); live.spec.ts wartet darauf.
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  workers: 1,
  // Eine echte Netzverbindung zu einem fremden Dienst: ein Wackler ist kein Befund.
  retries: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.LIVE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
  },
})
