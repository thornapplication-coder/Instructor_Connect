import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('Worker-Start im echten Worker-Bereich', () => {
  it('verbindet sich nur in einem WorkerGlobalScope und legt Schriften unter <basis>pdf-fonts/', async () => {
    const raus: unknown[] = []
    // addEventListener: jszip prüft beim Laden über `self`, wie es Aufgaben
    // einreiht — ein Worker-Bereich hat diese Methode, die Nachbildung auch.
    const bereich = { onmessage: null as null | ((e: { data: unknown }) => Promise<void>), postMessage: (a: unknown) => raus.push(a), addEventListener: () => {} }
    vi.stubGlobal('WorkerGlobalScope', class {})
    vi.stubGlobal('self', bereich)
    await import('./doccheck.worker')
    expect(bereich.onmessage).toBeTypeOf('function')
    // Ohne init: Kern mit leerer Basis; danach init mit Basis — beide Wege.
    await bereich.onmessage!({ data: { typ: 'suchen', nr: 1, q: 'x' } })
    await bereich.onmessage!({ data: { typ: 'init', basis: 'https://app/doccheck/' } })
    await bereich.onmessage!({ data: { typ: 'suchen', nr: 2, q: 'x' } })
    // Der Aufgaben-Polyfill von jszip schickt sich selbst leere Nachrichten — nur Antworten zählen.
    expect(raus.filter((x) => typeof x === 'object')).toEqual([{ typ: 'treffer', nr: 1, treffer: [] }, { typ: 'treffer', nr: 2, treffer: [] }])
  })

  it('im Fenster (ohne WorkerGlobalScope) verbindet sich nichts', async () => {
    const bereich = { onmessage: null, addEventListener: () => {} }
    vi.stubGlobal('self', bereich)
    await import('./doccheck.worker')
    expect(bereich.onmessage).toBeNull()
  })
})
