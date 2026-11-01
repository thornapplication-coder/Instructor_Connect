import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Direkt von der Platte: Vitest liefert `?raw` fuer CSS als LEEREN Text aus
// (CSS-Verarbeitung ist im Testlauf abgeschaltet). Ein Glob darauf saehe
// nichts — und ein Test, der nichts sieht, waere still gruen.
const css = readFileSync(fileURLToPath(new URL('../../index.css', import.meta.url)), 'utf8')

/**
 * Spez. DocCheck 3.5: Prioritaetsfarben fuer Hell- und Dunkelmodus,
 * „Kontrast nach WCAG AA". Hier nachgerechnet statt behauptet — wer einen
 * Ton aendert, sieht sofort, ob er unter 4,5:1 faellt.
 */

function block(selektor: string): Record<string, [number, number, number]> {
  const start = css.indexOf(`${selektor} {`)
  const ende = css.indexOf('}', start)
  const out: Record<string, [number, number, number]> = {}
  for (const m of css.slice(start, ende).matchAll(/--(c-[a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) out[m[1]] = [+m[2], +m[3], +m[4]]
  return out
}

function luminanz([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function kontrast(a: [number, number, number], b: [number, number, number]): number {
  const [h, d] = [luminanz(a), luminanz(b)].sort((x, y) => y - x)
  return (h + 0.05) / (d + 0.05)
}

const THEMEN = { hell: block(':root'), dunkel: block(":root[data-theme='dark']") }
const PRIO = ['c-prio-high', 'c-prio-med', 'c-prio-low']

describe('DocCheck-Prioritaetsfarben (WCAG AA)', () => {
  for (const [name, t] of Object.entries(THEMEN)) {
    for (const p of PRIO) {
      it(`${name}: ${p} erreicht 4,5:1 auf Hintergrund, Karte und erhabener Flaeche`, () => {
        expect(t[p], `${p} fehlt im Thema ${name}`).toBeDefined()
        for (const flaeche of ['c-bg', 'c-surface', 'c-raised']) {
          expect(kontrast(t[p], t[flaeche])).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  }

  it('die drei Stufen sind voneinander verschieden', () => {
    for (const t of Object.values(THEMEN)) expect(new Set(PRIO.map((p) => t[p].join())).size).toBe(3)
  })
})
