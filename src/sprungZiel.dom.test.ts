import { afterEach, describe, expect, it, vi } from 'vitest'
import { springeZuFeld, sprungZiel } from './sprungZiel'

/**
 * Audit 11/2026, GTY-12: Fehler an Ankreuzgruppen (308F Entweder-oder, 308C
 * Training Device, 308H Event) sprangen nicht zum Feld — die Gruppe hatte
 * keine id, der Fokus blieb auf „Continue to grading". Ebene 2: Es geht um
 * echte Elemente und ihren Fokus, nicht um Layout (das prüft e2e/).
 */
const scrollOriginal = Element.prototype.scrollIntoView
afterEach(() => {
  document.body.innerHTML = ''
  Element.prototype.scrollIntoView = scrollOriginal
})

function aufbauen(html: string) {
  document.body.innerHTML = html
  // jsdom kennt kein Scrollen — gezählt wird nur, dass gescrollt WIRD.
  const scroll = vi.fn()
  Element.prototype.scrollIntoView = scroll
  return scroll
}

describe('sprungZiel', () => {
  it('Ankreuzgruppe: Sprung zur Gruppe, Fokus auf den ersten Knopf', () => {
    aufbauen(`
      <div id="field-recurrentCycle" role="group" tabindex="-1">
        <span>Recurrent Cycle</span>
        <button>☐ 2026</button><button>☐ 2027</button>
      </div>`)
    const z = sprungZiel('field-recurrentCycle', document)!
    expect(z.bereich.id).toBe('field-recurrentCycle')
    expect(z.fokus.textContent).toBe('☐ 2026')
  })

  it('ein einzelnes Feld ist selbst das Ziel', () => {
    aufbauen('<label><span>Date</span><input id="field-date" /></label>')
    const z = sprungZiel('field-date', document)!
    expect(z.fokus).toBe(z.bereich)
    expect(z.fokus.tagName).toBe('INPUT')
  })

  it('deaktivierte Knöpfe überspringt der Fokus', () => {
    aufbauen('<div id="overall-0" role="group" tabindex="-1"><button disabled>Competent</button><button>Not Competent</button></div>')
    expect(sprungZiel('overall-0', document)!.fokus.textContent).toBe('Not Competent')
  })

  it('ohne Bedienelement bekommt der Bereich selbst den Fokus', () => {
    aufbauen('<div id="field-x" role="group" tabindex="-1"><span>leer</span></div>')
    const z = sprungZiel('field-x', document)!
    expect(z.fokus).toBe(z.bereich)
  })

  it('fehlt das Ziel, gibt es keines (statt still auf etwas anderem zu landen)', () => {
    aufbauen('<input placeholder="Student name" />')
    expect(sprungZiel('field-trainingDevice', document)).toBeNull()
  })
})

describe('springeZuFeld', () => {
  it('scrollt den Bereich in die Mitte und fokussiert das Bedienelement', () => {
    const scroll = aufbauen('<div id="field-trainingDevice" role="group" tabindex="-1"><button>☐ FFS</button></div>')
    expect(springeZuFeld('field-trainingDevice')).toBe(true)
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(document.activeElement?.textContent).toBe('☐ FFS')
  })

  it('mit „Bewegung reduzieren" springt die Seite, statt zu gleiten (A11Y-15)', () => {
    const scroll = aufbauen('<div id="field-trainingDevice" role="group" tabindex="-1"><button>☐ FFS</button></div>')
    vi.spyOn(window, 'matchMedia').mockImplementation(
      ((q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)', media: q })) as unknown as typeof window.matchMedia,
    )
    try {
      expect(springeZuFeld('field-trainingDevice')).toBe(true)
      expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' })
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('meldet false, wenn das Ziel (noch) nicht da ist — das Formular wechselt dann den Schritt', () => {
    const scroll = aufbauen('<button>Continue to grading</button>')
    const knopf = document.querySelector('button')!
    knopf.focus()
    expect(springeZuFeld('freitext')).toBe(false)
    expect(scroll).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(knopf)
  })
})
