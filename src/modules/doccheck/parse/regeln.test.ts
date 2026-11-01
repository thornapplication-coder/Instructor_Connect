import { describe, expect, it } from 'vitest'
import { rechtscharakter, regelIds } from './regeln'

describe('Regel-IDs (Spez. 7.5)', () => {
  it('erkennt AMC/GM mit Unterabsatz und zählt die eingebettete IR nicht doppelt', () => {
    expect(regelIds('See AMC1 ORA.ATO.230(a) and GM2 ORA.ATO.230(b)(1).')).toEqual(['AMC1 ORA.ATO.230(a)', 'GM2 ORA.ATO.230(b)(1)'])
  })

  it('erkennt dreigliedrige IR-IDs', () => {
    expect(regelIds('ORA.GEN.200 and ARA.GEN.355 apply.')).toEqual(['ORA.GEN.200', 'ARA.GEN.355'])
  })

  it('ergänzt zweigliedrige Part-FCL/MED-IDs, die das Muster der Spezifikation verfehlt', () => {
    expect(regelIds('FCL.625 IR revalidation, MED.B.001, AMC1 FCL.625(c)')).toEqual(['FCL.625', 'MED.B.001', 'AMC1 FCL.625(c)'])
  })

  it('erkennt Certification Specifications', () => {
    expect(regelIds('CS-FSTD(A) and AMC1 CS-FSTD(A).300')).toEqual(['CS-FSTD(A)', 'AMC1 CS-FSTD(A).300'])
  })

  it('kein Treffer für Abbildungs- oder Revisionsnummern', () => {
    expect(regelIds('FIG.123 shows REV.001 of ABC.12')).toEqual([])
  })

  it('normalisiert Leerraum und entfernt Dubletten', () => {
    expect(regelIds('AMC1  ORA.ATO.230 … AMC1 ORA.ATO.230')).toEqual(['AMC1 ORA.ATO.230'])
  })
})

describe('Rechtscharakter einer Seite', () => {
  it('nach der Überschrift am Zeilenanfang, nicht nach Erwähnungen', () => {
    expect(rechtscharakter('AMC1 ORA.ATO.230 Training manual\ntext citing ORA.ATO.230', 'OEM')).toBe('AMC')
    expect(rechtscharakter('ORA.ATO.230 Training manual\nsee AMC1 ORA.ATO.230', 'OEM')).toBe('IR')
    expect(rechtscharakter('GM1 FCL.625 x', 'OEM')).toBe('GM')
    expect(rechtscharakter('CS-FSTD(A).300 x', 'OEM')).toBe('CS')
  })

  it('mehrere Arten → mixed; keine → Vorgabe des Dokuments (oder nichts)', () => {
    expect(rechtscharakter('ORA.GEN.200 x\nAMC1 ORA.GEN.200 y', 'OEM')).toBe('mixed')
    expect(rechtscharakter('Engine start procedure', 'OEM')).toBe('OEM')
    expect(rechtscharakter('Engine start procedure')).toBeUndefined()
  })
})
