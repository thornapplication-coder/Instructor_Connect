import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { kontrast } from './modules/doccheck/pruefung/kontrast'

/**
 * Statusfarben als SCHRIFT (Audit 11/2026, A11Y-05).
 *
 * ok, wait und bad waren nur auf 3:1 eingestellt — genug für Punkte und
 * Symbole, nicht für Text. Sie stehen aber auch als Text da: „16 items
 * open" in der Formularleiste (text-wait, 12 px) lag bei 4,05:1,
 * „bestätigt von …" (text-ok) auf der erhabenen Fläche bei 4,32:1, bad im
 * Dunkelmodus dort bei 4,14:1. Hier nachgerechnet statt behauptet, in
 * beiden Themen und im Druck, auf jeder Fläche, auf der Text steht.
 */

// Direkt von der Platte: Vitest liefert `?raw` für CSS leer aus (siehe
// prioTokens.test.ts) — ein Test, der nichts sieht, wäre still grün.
const css = readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8')

type Rgb = [number, number, number]

/** Farbwerte des ersten Blocks mit genau diesem Selektor ab `ab`. */
function block(selektor: string, ab = 0): Record<string, Rgb> {
  const start = css.indexOf(`${selektor} {`, ab)
  if (start < 0) throw new Error(`Selektor fehlt: ${selektor}`)
  const ende = css.indexOf('}', start)
  const out: Record<string, Rgb> = {}
  for (const m of css.slice(start, ende).matchAll(/--(c-[a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) out[m[1]] = [+m[2], +m[3], +m[4]]
  return out
}

const hex = (c: Rgb) => c.map((k) => k.toString(16).padStart(2, '0')).join('').toUpperCase()

const THEMEN: Record<string, Record<string, Rgb>> = {
  hell: block(':root'),
  dunkel: block(":root[data-theme='dark']"),
  // Der Druck setzt beide Themen auf Papierwerte — der Ausdruck eines
  // Nachweises ist der Ort, an dem „offen" am längsten gelesen wird.
  druck: block(":root[data-theme='dark']", css.indexOf('@media print')),
}
const TOENE = ['c-ok', 'c-wait', 'c-bad']
const FLAECHEN = ['c-bg', 'c-surface', 'c-raised']

describe('Statusfarben als Text (WCAG 1.4.3, 4,5:1)', () => {
  for (const [thema, t] of Object.entries(THEMEN)) {
    for (const ton of TOENE) {
      it(`${thema}: ${ton} erreicht 4,5:1 auf Hintergrund, Karte und erhabener Fläche`, () => {
        expect(t[ton], `${ton} fehlt im Thema ${thema}`).toBeDefined()
        for (const flaeche of FLAECHEN) {
          expect(t[flaeche], `${flaeche} fehlt im Thema ${thema}`).toBeDefined()
          const wert = kontrast(hex(t[ton]), hex(t[flaeche]))
          expect(wert, `${thema}: ${ton} auf ${flaeche} = ${wert.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  }

  it('liest alle drei Blöcke wirklich (sonst prüfte der Test ins Leere)', () => {
    for (const t of Object.values(THEMEN)) expect(Object.keys(t).length).toBeGreaterThan(10)
    // Der Druckblock ist ein eigener, nicht noch einmal der Dunkelmodus.
    expect(THEMEN.druck['c-bg']).not.toEqual(THEMEN.dunkel['c-bg'])
  })

  // Die volle Fläche (Badge strong, Ampelpunkt) trägt Schrift in *-ink.
  for (const [thema, t] of Object.entries(THEMEN)) {
    it(`${thema}: Schrift auf der vollen Statusfläche erreicht 4,5:1`, () => {
      for (const ton of TOENE) {
        const wert = kontrast(hex(t[`${ton}-ink`]), hex(t[ton]))
        expect(wert, `${thema}: ${ton}-ink auf ${ton} = ${wert.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})

/**
 * Fokusring über `outline-none` hinweg (Audit 11/2026, Nachtrag A11Y#6 —
 * dort nachgeprüft und als „kein Befund" gemeldet; hier festgehalten, weil
 * es an einer Reihenfolge hängt, die niemand sieht). Die Eingabefelder
 * (`inputCls`, `selectInlineCls` …) und die Seitenüberschrift tragen
 * `outline-none`. Per Tastatur bleibt der Ring trotzdem, weil die Regel
 * `:focus-visible` NACH `@tailwind utilities` steht und bei gleicher
 * Spezifität gewinnt. Rückte sie davor oder in eine `@layer` (Tailwind
 * hebt deren Inhalt vor die Utilities), verlöre jedes Feld seinen Ring —
 * und kein anderer Test sähe es.
 *
 * Gegenprobe: Block `:focus-visible { … }` vor `@tailwind utilities`
 * verschoben → der erste Test wird rot.
 */
describe('Fokusring übersteht outline-none (WCAG 2.4.7)', () => {
  /** Klammertiefe an einer Stelle — 0 heißt: außerhalb jeder Regel und @layer. */
  const tiefe = (bis: number) => [...css.slice(0, bis)].reduce((t, z) => t + (z === '{' ? 1 : z === '}' ? -1 : 0), 0)

  it(':focus-visible steht nach @tailwind utilities und außerhalb jeder @layer', () => {
    const utilities = css.indexOf('@tailwind utilities;')
    const ring = css.search(/^:focus-visible \{/m)
    expect(utilities, '@tailwind utilities fehlt').toBeGreaterThan(-1)
    expect(ring, 'globale Regel :focus-visible fehlt').toBeGreaterThan(-1)
    expect(ring, ':focus-visible steht vor den Utilities — outline-none schlüge den Ring').toBeGreaterThan(utilities)
    expect(tiefe(ring), ':focus-visible steht in einem Block').toBe(0)
    expect(css.slice(ring, css.indexOf('}', ring))).toMatch(/outline:\s*2px solid rgb\(var\(--c-focus\)\)/)
  })

  // WCAG 1.4.11: Der Ring ist ein grafisches Bedienelement-Merkmal, 3:1.
  for (const [thema, t] of Object.entries(THEMEN)) {
    it(`${thema}: der Ring erreicht 3:1 auf Hintergrund, Karte und erhabener Fläche`, () => {
      expect(t['c-focus'], `c-focus fehlt im Thema ${thema}`).toBeDefined()
      for (const flaeche of FLAECHEN) {
        const wert = kontrast(hex(t['c-focus']), hex(t[flaeche]))
        expect(wert, `${thema}: c-focus auf ${flaeche} = ${wert.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
      }
    })
  }
})
