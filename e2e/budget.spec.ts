import { test, expect } from '@playwright/test'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { budgetPruefen, startDateien, type Gemessen } from '../src/groessenBudget'
import { swAngaben } from '../src/swQuelle'

/**
 * Größenbudget am gebauten Stand (Regel: src/groessenBudget.ts). Läuft mit
 * Ebene 3, weil erst hier ein Build vorliegt — der webServer der
 * Konfiguration baut ihn vorher. Kein Browser nötig.
 */

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const messen = (pfad: string): Gemessen => {
  const b = readFileSync(join(DIST, pfad))
  return { pfad, roh: b.length, gzip: gzipSync(b).length }
}

test('Start und Vorab-Cache bleiben im Budget', () => {
  const start = startDateien(readFileSync(join(DIST, 'index.html'), 'utf8')).map(messen)
  const sw = swAngaben(readFileSync(join(DIST, 'sw.js'), 'utf8'))
  expect(sw, 'dist/sw.js stammt nicht aus swQuelle').not.toBeNull()
  const vorab = sw!.dateien
    .map((d) => d.replace(/^\.\//, ''))
    .filter((d) => d && statSync(join(DIST, d), { throwIfNoEntry: false })?.isFile())
    .map(messen)
  expect(vorab.length, 'Vorab-Cache leer').toBeGreaterThan(5)
  expect(budgetPruefen(start, vorab)).toEqual([])
})
