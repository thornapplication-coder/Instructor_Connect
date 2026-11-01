import { describe, expect, it, vi } from 'vitest'
import { standardVerbindung } from './verbindung'

describe('standardVerbindung (Browser)', () => {
  it('eine je Tab, Worker als Modul, Basis neben der App; Abmelden beendet den Worker', async () => {
    const terminate = vi.fn()
    const erzeugt: { url: string; opts: unknown }[] = []
    vi.stubGlobal(
      'Worker',
      class {
        onmessage = null
        terminate = terminate
        constructor(url: URL, opts: unknown) {
          erzeugt.push({ url: String(url), opts })
        }
        postMessage() {}
      },
    )
    const v = standardVerbindung()
    expect(standardVerbindung()).toBe(v)
    void v.suchen('x')
    expect(erzeugt).toHaveLength(1)
    expect(erzeugt[0].url).toMatch(/doccheck\.worker\.ts/)
    expect(erzeugt[0].opts).toEqual({ type: 'module' })
    window.dispatchEvent(new Event('ic-abmelden'))
    expect(terminate).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
