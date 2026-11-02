import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useJetzt } from './zeitTakt'

/**
 * Ebene 2: der Hook für Ansichten, die selbst mit der Uhr rechnen
 * (Audit 11/2026, TEC-10). Er zeichnet nur die abonnierende Ansicht neu —
 * statt wie früher die ganze App alle fünf Sekunden.
 */

const T = new Date(2026, 10, 2, 12, 0, 0).getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(T)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useJetzt', () => {
  it('zeichnet im Takt neu und liefert die Zeit des Schlags', () => {
    let renders = 0
    const { result, unmount } = renderHook(() => {
      renders++
      return useJetzt(60_000)
    })
    expect(result.current).toBe(T)
    const nachMount = renders
    act(() => {
      vi.advanceTimersByTime(59_999)
    })
    // Zwischen zwei Schlägen: kein einziges Neuzeichnen.
    expect(renders).toBe(nachMount)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(T + 60_000)
    expect(renders).toBe(nachMount + 1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ein anderes Intervall ist ein eigener Takt', () => {
    const { result: schnell, unmount: a } = renderHook(() => useJetzt(1000))
    const { result: langsam, unmount: b } = renderHook(() => useJetzt(60_000))
    expect(vi.getTimerCount()).toBe(2)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(schnell.current).toBe(T + 1000)
    expect(langsam.current).toBe(T)
    a()
    b()
  })
})
