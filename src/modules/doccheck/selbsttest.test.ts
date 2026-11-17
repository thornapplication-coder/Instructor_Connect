import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { Kern, type LeseAuftrag, type Zusammenfassung } from './kern'
import type { PdfJs } from './parse/pdf'

/**
 * DocCheck-Probe des Selbsttests — gegen den ECHTEN Kern (pdf.js legacy wie
 * in kern.test.ts). Gemeint ist: Der eingebaute Fehler wird gefunden. Ein
 * Test mit einer Attrappe bewiese nur, dass die Attrappe ihn findet.
 */

const standardFontDataUrl = fileURLToPath(new URL('../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url))
const kern = () => new Kern({ pdfjs: async () => pdfjs as unknown as PdfJs, standardFontDataUrl })

// Die Browser-Fassung baut einen Worker; hier liest der Kern direkt.
const beendet = vi.fn()
let leser: (a: LeseAuftrag) => Promise<Zusammenfassung> = (a) => kern().lesen(a)
vi.mock('./verbindung', () => ({
  eigeneVerbindung: () => ({ lesen: (a: LeseAuftrag) => leser(a), beenden: beendet }),
}))

const { docCheckProben, docCheckSelbsttest, probePdf, PROBE_ID } = await import('./selbsttest')

describe('DocCheck-Probe', () => {
  it('der echte Kern liest das Probedokument und findet den eingebauten Fehler', async () => {
    let t = 0
    const es = await docCheckProben((a) => kern().lesen(a), () => (t += 7))
    expect(es).toEqual([
      { id: 'doccheckLesen', gruppe: 'doccheck', stufe: 'ok', werte: { ms: 7 } },
      { id: 'doccheckPruefen', gruppe: 'doccheck', stufe: 'ok' },
    ])
  })

  it('das Probedokument ist synthetisch und trägt seine Kennung', async () => {
    const z = await kern().lesen({ id: PROBE_ID, name: 'x.pdf', daten: probePdf(), pruefen: { formal: true, word: true } })
    expect(z.seiten).toBe(1)
    expect(new TextDecoder().decode(probePdf())).toContain('SBX-SELBSTTEST')
  })

  it('findet die Prüfung den Fehler nicht, ist das ein Fehler — „keine Befunde" ist hier verdächtig', async () => {
    const ohnePruefung = async (a: LeseAuftrag) => {
      const z = await kern().lesen({ ...a, pruefen: { formal: false, word: false } })
      return z
    }
    expect((await docCheckProben(ohnePruefung)).map((e) => [e.id, e.stufe])).toEqual([
      ['doccheckLesen', 'ok'],
      ['doccheckPruefen', 'fehler'],
    ])
  })

  it('leeres Ergebnis: Lesen gescheitert, Prüfen nicht prüfbar', async () => {
    const leer = async (a: LeseAuftrag) => ({ ...(await kern().lesen(a)), zeichen: 0 })
    expect(await docCheckProben(leer)).toEqual([
      { id: 'doccheckLesen', gruppe: 'doccheck', stufe: 'fehler', variante: 'leer' },
      { id: 'doccheckPruefen', gruppe: 'doccheck', stufe: 'offen' },
    ])
  })

  it('Fehler des Workers: mit seinem Code; fremde Meldungen werden nicht durchgereicht', async () => {
    const [mitCode] = await docCheckProben(async () => Promise.reject(new Error('DC-PDF-DEFEKT')))
    expect(mitCode).toMatchObject({ stufe: 'fehler', variante: 'fehler', werte: { code: 'DC-PDF-DEFEKT' } })
    const [fremd] = await docCheckProben(async () => Promise.reject(new Error('Dateiname /home/x geheim')))
    expect(fremd.werte).toEqual({ code: 'DC-UNBEKANNT' })
  })

  it('hängt der Worker, endet die Probe an der Zeitgrenze', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const probe = docCheckProben(() => new Promise(() => undefined), () => 0, 1000)
      await vi.advanceTimersByTimeAsync(1001)
      expect((await probe)[0]).toMatchObject({ stufe: 'fehler', variante: 'zeit', werte: { code: 'DC-ZEIT' } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('im Browser: eigene Verbindung, danach beendet — auch wenn die Probe scheitert', async () => {
    beendet.mockClear()
    expect((await docCheckSelbsttest()).map((e) => e.stufe)).toEqual(['ok', 'ok'])
    expect(beendet).toHaveBeenCalledOnce()
    leser = async () => Promise.reject(new Error('DC-ABORTED'))
    expect((await docCheckSelbsttest())[0].stufe).toBe('fehler')
    expect(beendet).toHaveBeenCalledTimes(2)
  })
})
