import * as legacy from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pdfLesen } from './parse/pdf'
import { pdfBauen, textSeite } from './parse/pdfBauen'
import { kanalAnbinden, pdfAblage, pdfjsLaden, type PdfJsVoll, type WorkerTeil } from './pdfjsLaden'

// Der Worker-Teil von pdf.js bringt keine Typen mit.
const WORKER_TEIL = 'pdfjs-dist/legacy/build/pdf.worker.mjs'
const { WorkerMessageHandler } = (await import(/* @vite-ignore */ WORKER_TEIL)) as { WorkerMessageHandler: WorkerTeil }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('pdfjsLaden', () => {
  it('setzt eine LOKALE Worker-Adresse, kein CDN — und lädt nur einmal', async () => {
    const a = await pdfjsLaden()
    const lib = a as unknown as { GlobalWorkerOptions: { workerSrc: string } }
    expect(lib.GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker\.min\.mjs/)
    expect(lib.GlobalWorkerOptions.workerSrc).not.toMatch(/^https?:/)
    expect(await pdfjsLaden()).toBe(a)
  })

  it('im DocCheck-Worker (WorkerGlobalScope): eigener Kanal statt Fake-Worker (Audit 11/2026, TEC-20)', async () => {
    vi.stubGlobal('WorkerGlobalScope', class {})
    const { pdfjsLaden: frisch } = await import('./pdfjsLaden')
    const lib = await frisch()
    // Nicht die Bibliothek selbst, sondern der Zuschnitt mit gebundenem Worker
    expect(lib).not.toHaveProperty('GlobalWorkerOptions')
    expect(Object.keys(lib).sort()).toEqual(['OPS', 'getDocument'])
    const r = await pdfLesen(pdfBauen([{ texte: textSeite(['Read through the bound worker part']) }]), lib)
    expect(r.pages[0].text).toBe('Read through the bound worker part')
  })
})

describe('pdfAblage', () => {
  it('Schriften, Decoder und Farbprofil unter festen Namen in <basis> — wie docCheckDateien sie ausliefert', () => {
    expect(pdfAblage('https://app/doccheck/')).toEqual({
      standardFontDataUrl: 'https://app/doccheck/pdf-fonts/',
      wasmUrl: 'https://app/doccheck/pdf-wasm/',
      iccUrl: 'https://app/doccheck/pdf-iccs/',
    })
  })
})

describe('kanalAnbinden (Audit 11/2026, TEC-20)', () => {
  const standardFontDataUrl = fileURLToPath(new URL('../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url))

  it('liest über den MessageChannel: der Worker-Teil hängt am zweiten Ende, jedes Dokument bekommt denselben PDFWorker', async () => {
    const kanal = new MessageChannel()
    const anbinden = vi.spyOn(WorkerMessageHandler, 'initializeFromPort')
    const voll = legacy as unknown as PdfJsVoll
    const quellen: { worker?: unknown }[] = []
    const lib = kanalAnbinden({ ...voll, getDocument: (src) => (quellen.push(src), voll.getDocument(src)) }, WorkerMessageHandler, kanal)
    try {
      expect(anbinden.mock.calls.map(([port]) => port === kanal.port2)).toEqual([true])
      // Zwei Dokumente gleichzeitig: das Aufräumen des einen darf das andere nicht treffen
      const [a, b] = await Promise.all([
        pdfLesen(pdfBauen([{ texte: textSeite(['Synthetic channel page one', 'with enough text for no OCR']) }]), lib, { standardFontDataUrl }),
        pdfLesen(pdfBauen([{ texte: textSeite(['Second synthetic document', 'read at the same time']) }]), lib, { standardFontDataUrl }),
      ])
      expect(a.pages[0].text).toBe('Synthetic channel page one\nwith enough text for no OCR')
      expect(b.pages[0].text).toBe('Second synthetic document\nread at the same time')
      expect(quellen).toHaveLength(2)
      expect(quellen[0].worker).toBeInstanceOf(legacy.PDFWorker)
      expect(quellen[1].worker).toBe(quellen[0].worker)
      expect((quellen[0].worker as { port: unknown }).port).toBe(kanal.port1)
      // Nach beiden destroy() bleibt der Worker nutzbar
      const c = await pdfLesen(pdfBauen([{ texte: textSeite(['Third document after cleanup']) }]), lib, { standardFontDataUrl })
      expect(c.pages[0].text).toBe('Third document after cleanup')
    } finally {
      anbinden.mockRestore()
      kanal.port1.close()
      kanal.port2.close()
    }
  })
})
