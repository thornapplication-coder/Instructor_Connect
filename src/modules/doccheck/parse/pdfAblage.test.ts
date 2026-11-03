import { describe, expect, it } from 'vitest'
import { ablageParameter } from './pdfAblage'

const web = { standardFontDataUrl: 'https://app/doccheck/pdf-fonts/', wasmUrl: 'https://app/doccheck/pdf-wasm/', iccUrl: 'https://app/doccheck/pdf-iccs/' }

describe('ablageParameter (Audit 11/2026, DC-15/TEC-20)', () => {
  it('alle drei Web-Adressen → pdf.js holt selbst (useWorkerFetch), ohne `document` zu brauchen', () => {
    expect(ablageParameter(web)).toEqual({ ...web, useWorkerFetch: true })
  })

  it('fehlt wasmUrl oder iccUrl, holt pdf.js NICHT selbst — sonst warnte es bei jeder ICC- bzw. CMYK-Farbe', () => {
    expect(ablageParameter({ ...web, wasmUrl: undefined })).not.toHaveProperty('useWorkerFetch')
    expect(ablageParameter({ ...web, iccUrl: undefined })).not.toHaveProperty('useWorkerFetch')
    expect(ablageParameter({ standardFontDataUrl: web.standardFontDataUrl })).toEqual({ standardFontDataUrl: web.standardFontDataUrl })
  })

  it('Dateipfade (Node, Tests) bleiben beim Dateisystem-Weg von pdf.js', () => {
    const pfade = { standardFontDataUrl: '/repo/node_modules/pdfjs-dist/standard_fonts/', wasmUrl: '/repo/wasm/', iccUrl: '/repo/iccs/' }
    expect(ablageParameter(pfade)).toEqual(pfade)
  })

  it('ohne Ablage keine Parameter — pdf.js nimmt seine Vorgaben', () => {
    expect(ablageParameter({})).toEqual({})
  })
})
