import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../i18n'
import { KORB_PROBE_MS, OfflineBanner } from './OfflineBanner'

/**
 * Ebene 2: Der Ausgangskorb wird erneut geprüft, solange etwas darin liegt.
 *
 * Im WLAN ohne Internet meldet der Browser durchgehend „online"; kommt das
 * Internet zurück, gibt es kein Ereignis. Die Wiederholung leistete bisher
 * unbemerkt der 5-Sekunden-Takt des Stores (er erneuerte `flushOutbox`, der
 * Effekt lief neu). Seit der Takt nichts mehr neu zeichnet (Audit 11/2026,
 * TEC-10), steht sie ausdrücklich im Streifen — dieser Test hält sie fest.
 */

const korb = vi.hoisted(() => ({ wartend: 1, flush: vi.fn(async () => false) }))

vi.mock('../store', () => ({
  useStore: () => ({
    state: { gradingRecords: Array.from({ length: korb.wartend }, (_, i) => ({ id: `r${i}`, mailStatus: 'queued' })) },
    flushOutbox: korb.flush,
  }),
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  korb.flush.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('OfflineBanner: Ausgangskorb', () => {
  it('prüft beim Start und danach alle KORB_PROBE_MS, solange etwas wartet', async () => {
    korb.wartend = 2
    const { unmount } = render(<OfflineBanner />)
    expect(korb.flush).toHaveBeenCalledOnce()
    await act(async () => {
      vi.advanceTimersByTime(KORB_PROBE_MS)
    })
    expect(korb.flush).toHaveBeenCalledTimes(2)
    unmount()
    vi.advanceTimersByTime(KORB_PROBE_MS)
    expect(korb.flush).toHaveBeenCalledTimes(2)
  })

  it('ohne wartende Formulare kein Wiederholen', async () => {
    korb.wartend = 0
    render(<OfflineBanner />)
    const start = korb.flush.mock.calls.length
    await act(async () => {
      vi.advanceTimersByTime(3 * KORB_PROBE_MS)
    })
    expect(korb.flush).toHaveBeenCalledTimes(start)
    expect(vi.getTimerCount()).toBe(0)
  })
})
