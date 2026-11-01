import { defineConfig, devices } from '@playwright/test'

/**
 * Ebene 3 (CLAUDE.md): wenige Wege durch die ganze App, im echten Browser
 * gegen den echten Build (`vite preview`) — was Ebene 1 und 2 nicht sehen:
 * Worker, Downloads, Fokus, Tastatur, Ansichtsmodus am Telefon.
 *
 * Bewusst wenige Tests: Jeder kostet Sekunden und bricht bei jeder
 * Textänderung. Was sich als reine Logik prüfen lässt, gehört in Ebene 1.
 */
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/vorbereitung.ts',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4174/',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'de-AT',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }, testIgnore: /mobil\.spec/ },
    // Chromium mit Telefon-Profil: pointer: coarse → Ansichtsmodus (viewMode.ts)
    { name: 'telefon', use: { ...devices['Pixel 7'] }, testMatch: /mobil\.spec/ },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4174 --strictPort',
    url: 'http://localhost:4174/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
