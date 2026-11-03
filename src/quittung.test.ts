import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { quittieren, SICHERN_ZEITGRENZE_MS, type QuittungsTon } from './quittung'

/**
 * Audit 11/2026, R3-SPEICHERQUITTUNG: Die grüne Quittung erschien auch, wenn
 * das Speichern danach scheiterte. Ebene 1: die Entscheidung selbst — erst
 * warten, dann das melden, was geschehen ist. Den Weg durch Store und
 * IndexedDB prüft `components/Quittung.test.tsx`.
 */

let gemeldet: [string, QuittungsTon][]
const melden = (text: string, ton: QuittungsTon) => void gemeldet.push([text, ton])

beforeEach(() => {
  gemeldet = []
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('quittieren', () => {
  it('meldet die Quittung erst, wenn das Schreiben gelungen ist', async () => {
    let fertig!: (ok: boolean) => void
    const sichern = () => new Promise<boolean>((r) => (fertig = r))
    const lauf = quittieren({ sichern, melden, text: 'Notiz gespeichert', fehlerText: 'Nicht gespeichert' })
    await vi.advanceTimersByTimeAsync(10)
    // Noch nicht geschrieben — noch nichts gemeldet. Vorher stand hier
    // „gespeichert", bevor überhaupt geschrieben war.
    expect(gemeldet).toEqual([])
    fertig(true)
    await expect(lauf).resolves.toBe(true)
    expect(gemeldet).toEqual([['Notiz gespeichert', 'ok']])
  })

  it('gescheitertes Schreiben: keine Quittung, sondern die Fehlermeldung (bad)', async () => {
    const ok = await quittieren({ sichern: async () => false, melden, text: 'Notiz gespeichert', fehlerText: 'Nicht gespeichert' })
    expect(ok).toBe(false)
    expect(gemeldet).toEqual([['Nicht gespeichert', 'bad']])
  })

  it('ein Wurf beim Sichern zählt als gescheitert', async () => {
    const ok = await quittieren({
      sichern: () => Promise.reject(new Error('voll')),
      melden,
      text: 'Gespeichert',
      fehlerText: 'Nicht gespeichert',
    })
    expect(ok).toBe(false)
    expect(gemeldet).toEqual([['Nicht gespeichert', 'bad']])
  })

  it('antwortet die Ablage nicht, gilt nach der Zeitgrenze: nicht gespeichert', async () => {
    const lauf = quittieren({ sichern: () => new Promise<boolean>(() => undefined), melden, text: 'Gespeichert', fehlerText: 'Nicht gespeichert' })
    await vi.advanceTimersByTimeAsync(SICHERN_ZEITGRENZE_MS - 1)
    expect(gemeldet).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await expect(lauf).resolves.toBe(false)
    expect(gemeldet).toEqual([['Nicht gespeichert', 'bad']])
  })

  it('behält den Ton der Quittung („gespeichert, aber …" bleibt wait)', async () => {
    await quittieren({ sichern: async () => true, melden, text: 'Im Ausgangskorb', ton: 'wait', fehlerText: 'x' })
    expect(gemeldet).toEqual([['Im Ausgangskorb', 'wait']])
  })

  it('räumt den Zeitgeber ab — kein später zweiter Ausgang', async () => {
    await quittieren({ sichern: async () => true, melden, text: 'Gespeichert', fehlerText: 'Nicht gespeichert', zeitgrenzeMs: 50 })
    await vi.advanceTimersByTimeAsync(100)
    expect(gemeldet).toEqual([['Gespeichert', 'ok']])
    expect(vi.getTimerCount()).toBe(0)
  })
})
