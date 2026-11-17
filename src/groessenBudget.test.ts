import { describe, expect, it } from 'vitest'
import { BUDGET, budgetPruefen, startDateien } from './groessenBudget'

/** Größenbudget (Ebene 1): die Regel. Gemessen wird am Build in e2e/budget.spec.ts. */

describe('Startdateien aus index.html', () => {
  it('nimmt Skripte, Stylesheets und modulepreload unter assets/ — sonst nichts', () => {
    const html = `<!doctype html><head>
      <script type="module" crossorigin src="./assets/index-abc.js"></script>
      <link rel="modulepreload" crossorigin href="./assets/vendor-x.js">
      <link rel="stylesheet" crossorigin href="./assets/index-def.css">
      <link rel="icon" href="./icon.svg"><link rel="manifest" href="./manifest.webmanifest">
      <script src="/assets/index-abc.js"></script>`
    expect(startDateien(html)).toEqual(['assets/index-abc.js', 'assets/index-def.css', 'assets/vendor-x.js'])
  })
})

describe('Budget', () => {
  const d = (pfad: string, roh: number, gzip: number) => ({ pfad, roh, gzip })

  it('im Rahmen: keine Verstöße', () => {
    expect(budgetPruefen([d('assets/a.js', 800_000, 240_000), d('assets/a.css', 60_000, 12_000)], [d('assets/a.js', 800_000, 0), d('index.html', 2_000, 0)])).toEqual([])
  })

  it('zu groß: nennt Summe, Budget und die größten Dateien', () => {
    const v = budgetPruefen([d('assets/a.js', 1_200_000, 300_000), d('assets/pdf.js', 440_000, 131_000)], [d('assets/a.js', 1_200_000, 0), d('assets/pdf.js', 440_000, 0)])
    expect(v).toHaveLength(2)
    expect(v[0]).toBe(`Start 431 kB gzip > Budget ${Math.round(BUDGET.startGzip / 1000)} kB: assets/a.js 300 kB, assets/pdf.js 131 kB`)
    expect(v[1]).toMatch(/^Vorab-Cache 1640 kB > Budget 1500 kB: assets\/a\.js 1200 kB/)
  })

  it('keine Startdateien ist selbst ein Fehler — sonst wäre das Budget still erfüllt', () => {
    expect(budgetPruefen([], [])).toEqual(['Keine Startdateien gefunden — index.html verweist auf nichts unter assets/'])
  })
})
