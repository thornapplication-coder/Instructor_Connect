import { afterEach, describe, expect, it, vi } from 'vitest'
import { bewegungReduziert, scrollVerhalten, WENIGER_BEWEGUNG } from './bewegung'

/**
 * Audit 11/2026, A11Y-15: „Bewegung reduzieren" galt nirgends. Ebene 2,
 * weil die Antwort aus `window.matchMedia` kommt — hier nachgebildet, mit
 * beiden Rückgaben und dem Fall, dass es die Abfrage gar nicht gibt.
 */
afterEach(() => {
  vi.restoreAllMocks()
})

function systemEinstellung(reduziert: boolean) {
  return vi.spyOn(window, 'matchMedia').mockImplementation(
    ((q: string) => ({ matches: q === WENIGER_BEWEGUNG && reduziert, media: q })) as unknown as typeof window.matchMedia,
  )
}

describe('bewegung', () => {
  it('Einstellung „reduzieren": springen statt gleiten', () => {
    const spy = systemEinstellung(true)
    expect(bewegungReduziert()).toBe(true)
    expect(scrollVerhalten()).toBe('auto')
    expect(spy).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  })

  it('ohne Einstellung bleibt das sanfte Scrollen', () => {
    systemEinstellung(false)
    expect(bewegungReduziert()).toBe(false)
    expect(scrollVerhalten()).toBe('smooth')
  })

  it('ohne matchMedia ist nichts bekannt — dann das bisherige Verhalten statt eines Absturzes', () => {
    const vorher = window.matchMedia
    // @ts-expect-error — eine Umgebung ohne matchMedia nachstellen
    delete window.matchMedia
    try {
      expect(bewegungReduziert()).toBe(false)
      expect(scrollVerhalten()).toBe('smooth')
    } finally {
      window.matchMedia = vorher
    }
  })

  it('nimmt eine eigene Abfrage entgegen', () => {
    expect(scrollVerhalten(() => ({ matches: true }))).toBe('auto')
    expect(scrollVerhalten(null)).toBe('smooth')
  })
})
