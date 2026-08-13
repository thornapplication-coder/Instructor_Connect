import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIsDesktop } from './useIsDesktop'

/**
 * Ebene 2: die Breitenabfrage.
 *
 * Sie entscheidet, ob das Admin-Panel bedienbar ist. Die frühere Fassung
 * fragte nach dem Zeigegerät und sperrte damit das iPad komplett aus:
 * 1194 px Breite, aber Touch — wer unterwegs mit dem iPad arbeitet, kam an
 * keine Verwaltung heran. Deshalb steht hier ausdrücklich, dass die Breite
 * zählt und nichts sonst, und dass ein Drehen des Geräts ankommt.
 */

/** Nachbildung von matchMedia mit umschaltbarem Ergebnis. */
function medienAbfrage(passt: boolean) {
  const hoerer = new Set<() => void>()
  const mq = {
    matches: passt,
    media: '',
    onchange: null,
    addEventListener: (_: string, h: () => void) => hoerer.add(h),
    removeEventListener: (_: string, h: () => void) => hoerer.delete(h),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  }
  const spy = vi.spyOn(window, 'matchMedia').mockImplementation(((q: string) => {
    mq.media = q
    return mq
  }) as unknown as typeof window.matchMedia)
  return {
    spy,
    mq,
    /** Bildschirm ändert sich (Drehen, Fenster ziehen, Splitscheen am iPad) */
    umschalten(neu: boolean) {
      mq.matches = neu
      hoerer.forEach((h) => h())
    },
    hoererZahl: () => hoerer.size,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useIsDesktop', () => {
  it('fragt die Breite ab, nicht das Zeigegerät', () => {
    const m = medienAbfrage(true)
    renderHook(() => useIsDesktop())
    // 1024 px: Tablet im Querformat gilt als Desktop — genau der iPad-Fall.
    expect(m.spy).toHaveBeenCalledWith('(min-width: 1024px)')
  })

  it('meldet schon beim ersten Render den richtigen Wert', () => {
    // Ohne das flackerte die Seite: erst der Handy-Hinweis, dann das Panel.
    medienAbfrage(true)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(true)
  })

  it('meldet am schmalen Bildschirm false', () => {
    medienAbfrage(false)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)
  })

  it('folgt einer Änderung der Bildschirmbreite', () => {
    const m = medienAbfrage(false)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)
    act(() => m.umschalten(true))
    expect(result.current).toBe(true)
    act(() => m.umschalten(false))
    expect(result.current).toBe(false)
  })

  it('meldet den Hörer beim Abbau wieder ab', () => {
    // Sonst sammeln sich bei jedem Ansichtswechsel Hörer an, die auf einen
    // abgebauten Zustand schreiben.
    const m = medienAbfrage(true)
    const { unmount } = renderHook(() => useIsDesktop())
    expect(m.hoererZahl()).toBe(1)
    unmount()
    expect(m.hoererZahl()).toBe(0)
  })
})
