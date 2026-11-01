import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ANSICHT_QUERY, istAnsichtsmodus, useAnsichtsmodus } from './viewMode'

/** matchMedia-Nachbildung, deren Ergebnis sich zur Laufzeit umschalten laesst. */
function mediaMit(start: boolean) {
  let matches = start
  const hoerer = new Set<() => void>()
  const mq = {
    get matches() {
      return matches
    },
    addEventListener: (_: string, f: () => void) => hoerer.add(f),
    removeEventListener: (_: string, f: () => void) => hoerer.delete(f),
  }
  const spy = vi.fn(() => mq)
  window.matchMedia = spy as unknown as typeof window.matchMedia
  return {
    spy,
    hoerer,
    setze(v: boolean) {
      matches = v
      hoerer.forEach((f) => f())
    },
  }
}

const original = window.matchMedia
afterEach(() => {
  window.matchMedia = original
})

describe('Ansichtsmodus nach primärem Eingang (Spez. 3.8)', () => {
  it('fragt pointer: coarse — nicht die Breite', () => {
    const m = mediaMit(true)
    expect(istAnsichtsmodus()).toBe(true)
    expect(m.spy).toHaveBeenCalledWith(ANSICHT_QUERY)
    expect(ANSICHT_QUERY).not.toMatch(/width/)
  })

  it('nimmt eine eigene Abfrage entgegen (Logik ohne Fenster pruefbar)', () => {
    expect(istAnsichtsmodus(() => ({ matches: false }))).toBe(false)
  })

  it('Hook folgt einem Wechsel und meldet sich beim Abbau ab', () => {
    const m = mediaMit(false)
    const { result, unmount } = renderHook(() => useAnsichtsmodus())
    expect(result.current).toBe(false)
    act(() => m.setze(true))
    expect(result.current).toBe(true)
    unmount()
    expect(m.hoerer.size).toBe(0)
  })
})
