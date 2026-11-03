import { describe, expect, it } from 'vitest'
import { normalisieren, rechtscharakter, regelIds } from './regeln'

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

  it('vierstellige Nummern, Buchstaben-Suffix, zwei Mittelglieder — nicht abgeschnitten (Fachprüfung 01.11.2026)', () => {
    expect(regelIds('FCL.1015, SERA.5001, AMC1 FCL.1015, FCL.740.A(b)(1), ORO.FC.220, CAT.OP.MPA.150(a)')).toEqual(['FCL.1015', 'SERA.5001', 'AMC1 FCL.1015', 'FCL.740.A(b)(1)', 'ORO.FC.220', 'CAT.OP.MPA.150(a)'])
    // Satzpunkt und Folgewort sind kein Suffix
    expect(regelIds('see FCL.740. A pilot shall FCL.740.Additional')).toEqual(['FCL.740'])
  })

  it('Part-FCL Subpart J: mehrbuchstabige Endung samt Absatz (Audit 11/2026, FRD-12)', () => {
    expect(regelIds('FCL.930.FI(b)(3), FCL.915.CRI, GM1 FCL.930.FI, FCL.905.TRI(b), AMC1 FCL.930.FI(c)')).toEqual(['FCL.930.FI(b)(3)', 'FCL.915.CRI', 'GM1 FCL.930.FI', 'FCL.905.TRI(b)', 'AMC1 FCL.930.FI(c)'])
    // Unverändert: ein Buchstabe, zwei Mittelglieder, vierstellig; Folgewort und Satzpunkt sind kein Suffix
    expect(regelIds('FCL.740.A, ORA.ATO.230, FCL.1015, FCL.930.FIRST, FCL.930.Flight')).toEqual(['FCL.740.A', 'ORA.ATO.230', 'FCL.1015', 'FCL.930'])
  })

  it('CS-Artikel mit Bindestrich oder Leerzeichen, einheitlich geschrieben', () => {
    expect(regelIds('CS FCD.420 and CS-25.1309, AMC1 CS FCD.420')).toEqual(['CS-FCD.420', 'CS-25.1309', 'AMC1 CS-FCD.420'])
    expect(normalisieren('AMC1   CS FCD.420')).toBe('AMC1 CS-FCD.420')
  })

  it('Zulassungsnummern sind keine Regeln: „AT.ATO.106" ist nicht „ATO.106"', () => {
    expect(regelIds('The ATO AT.ATO.106 applies ORA.ATO.125.')).toEqual(['ORA.ATO.125'])
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
