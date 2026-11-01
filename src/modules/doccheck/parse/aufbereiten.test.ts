import { describe, expect, it } from 'vitest'
import { aufbereiten } from './aufbereiten'

describe('aufbereiten — ein Weg für alle Formate', () => {
  it('setzt Labels, Regel-IDs, Rechtscharakter und OCR-Marke', () => {
    const r = aufbereiten([['ORA.ATO.230 Training', 'see AMC1 ORA.ATO.230(a)'], ['plain']], { vorgabe: 'OEM', kopfFuss: false, labels: ['A', undefined], ocr: new Set([2]) })
    expect(r.pages[0]).toMatchObject({ index: 1, label: 'A', regRefs: ['ORA.ATO.230', 'AMC1 ORA.ATO.230(a)'], legalType: 'IR' })
    expect(r.pages[1]).toEqual({ index: 2, text: 'plain', legalType: 'OEM', isOcr: true })
  })

  it('ohne Vorgabe und ohne Regelüberschrift kein Rechtscharakter', () => {
    expect(aufbereiten([['x']], { kopfFuss: false }).pages[0]).toEqual({ index: 1, text: 'x' })
  })

  it('Bindestrich-Heuristik über das ganze Dokument, nicht je Seite', () => {
    const r = aufbereiten([['the go-', 'around'], ['a go-around here']], { kopfFuss: false })
    expect(r.pages[0].text).toBe('the go-around')
  })
})
