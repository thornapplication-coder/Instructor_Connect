import { describe, expect, it } from 'vitest'
import de from '../i18n/de.json'
import en from '../i18n/en.json'
import { LEERE_LENKUNG, type Rohdokument } from '../parse/model'
import type { ReferenzListe } from '../referenz/liste'
import { REGELN } from './kontext'
import { bauart, excelDatum, referenzCheck, revisionsZahlen } from './referenzCheck'

const roh = (texte: string[]): Rohdokument => ({ format: 'pdf', pages: texte.map((text, i) => ({ index: i + 1, text })), outline: [], lenkung: LEERE_LENKUNG, ocrKandidaten: [], tabellen: 0 })
const pruefe = (texte: string[], listen: ReferenzListe[], meta = {}, dateiname = 'x.pdf') => referenzCheck({ dokId: 'd', dokName: 'Training Manual', roh: roh(texte), meta, regeln: REGELN }, listen, dateiname)
const auszuege = (r: ReturnType<typeof pruefe>, p: string) => r.befunde.filter((b) => b.pruefpunkt === p).flatMap((b) => b.fundstellen.map((f) => f.auszug))

describe('Bausteine', () => {
  it('Excel-Seriendatum und Textdatum', () => {
    expect(excelDatum('46082')).toBe('2026-03-01')
    expect(excelDatum('01.03.2026')).toBe('2026-03-01')
    expect(excelDatum(undefined)).toBeUndefined()
  })
  it('Revision als Zahlenfolge, Bauart einer Kennung', () => {
    expect(revisionsZahlen('Rev 2')).toBe(revisionsZahlen('Revision 2.0'))
    expect(revisionsZahlen('Edition 1 Rev 0.0')).toBe('1|0')
    expect(revisionsZahlen(undefined)).toBe('')
    expect(bauart('AT-FFS-0101')).toBe('AA-AAA-9999')
  })
})

describe('Glossar', () => {
  const g: ReferenzListe = { id: 'g', name: 'Glossar.xlsx', blatt: 'Terms', art: 'glossar', eintraege: [{ soll: 'take-off', varianten: ['takeoff', 'take off'], quelle: 'AFM' }, { soll: 'go-around', varianten: [] }] }
  it('meldet jede Variante mit Seite — nicht die Soll-Form, nicht Wortteile', () => {
    const r = pruefe(['Before takeoff check flaps.', 'The take-off run.\nTake off power set. Takeoffs are rare.'], [g])
    expect(r.befunde).toHaveLength(1)
    // Mehrzahl ausgeschrieben statt „occurrence(s)" (Audit 11/2026, TXT-07)
    expect(r.befunde[0].text).toBe('Use "take-off" instead of "takeoff", "Take off" (2 occurrences; glossary Glossar.xlsx / Terms, source: AFM).')
    expect(pruefe(['Before takeoff check flaps.'], [g]).befunde[0].text).toContain('(1 occurrence; glossary')
    expect(r.befunde[0].fundstellen.map((f) => f.seite)).toEqual(['1', '2'])
    expect(r.ampel).toEqual({ glossar: 'wait', abkuerzungsliste: 'na', register: 'na', kennungen: 'na' })
  })
  it('ohne Treffer grün', () => {
    expect(pruefe(['The take-off run.'], [g]).ampel.glossar).toBe('ok')
  })
})

describe('Abkürzungsliste', () => {
  it('benutzte Abkürzung ohne Eintrag; CAS-Meldung ausgenommen', () => {
    const r = pruefe(['Use the AFM and the QRH. BATT 1 OFF BUS. Device AT-FFS-0199, doc SBX-REF-01.'], [{ id: 'a', name: 'abk.csv', art: 'abkuerzungen', eintraege: [{ abk: 'AFM', bedeutung: 'x' }] }])
    expect(auszuege(r, 'abkuerzungsliste')).toEqual(['QRH'])
    expect(r.befunde[0].text).toBe('1 abbreviation used that is not in the reference list (abk.csv).')
    expect(pruefe(['Use the QRH, NOTE: the MEL applies.'], [{ id: 'a', name: 'abk.csv', art: 'abkuerzungen', eintraege: [] }]).befunde[0].text).toBe('2 abbreviations used that are not in the reference list (abk.csv).')
  })
})

describe('Dokumentregister', () => {
  const reg: ReferenzListe = { id: 'r', name: 'Register.xlsx', art: 'register', eintraege: [{ dokument: 'SBX-PLM-300', revision: 'Rev 2', datum: '46082' }] }
  it('passt: kein Befund', () => {
    expect(pruefe(['x'], [reg], { nummer: 'SBX-PLM-300', revision: 'Revision 2', datum: '2026-03-01' }).befunde).toEqual([])
  })
  it('Revision und Datum weichen ab', () => {
    const r = pruefe(['x'], [reg], { nummer: 'SBX-PLM-300', revision: 'Revision 1', datum: '2026-02-01' })
    expect(r.befunde[0]).toMatchObject({ prioritaet: 'Medium', kategorie: 'Document Control', anleitung: 'register' })
    expect(auszuege(r, 'register')).toEqual(['Revision: register "Rev 2", document "Revision 1"', 'Date: register 2026-03-01, document 2026-02-01'])
  })
  it('über den Dateinamen gefunden; nicht im Register → Niedrig', () => {
    expect(pruefe(['x'], [reg], { revision: 'Rev 2', datum: '2026-03-01' }, 'SBX-PLM-300_E1R2.pdf').befunde).toEqual([])
    const r = pruefe(['x'], [reg], { nummer: 'SBX-OM-1' }, 'om.pdf')
    // Fehlt der Eintrag, hilft „Revision/Datum korrigieren" nicht — er gehört ins Register (Audit 11/2026, DC-16)
    expect(r.befunde[0]).toMatchObject({ prioritaet: 'Low', text: 'Document not found in the document register Register.xlsx.', anleitung: 'registerFehlt' })
    expect(en.anleitung.registerFehlt).toMatch(/^Add the document to the document register/)
    expect(de.anleitung.registerFehlt).toMatch(/^Dokument ins Dokumentregister aufnehmen/)
  })
})

describe('Kennungen', () => {
  const k: ReferenzListe = { id: 'k', name: 'Geraete.csv', art: 'kennungen', eintraege: [{ kennung: 'AT-FFS-0101' }, { kennung: 'AT-FFS-0102' }, { kennung: '12' }] }
  it('gleiche Bauart, nicht in der Liste → Befund; bekannte und andere Bauarten nicht', () => {
    const r = pruefe(['Sessions on AT-FFS-0101 and AT-FFS-0199.', 'Also AT-FTD-12 and page 12, AT-FFS-0102.'], [k])
    expect(auszuege(r, 'kennungen').map((a) => a.split(' — ')[0])).toEqual(['AT-FFS-0199'])
    expect(r.befunde[0].prioritaet).toBe('Medium')
    expect(r.befunde[0].text).toBe('1 identifier not found in the reference list (Geraete.csv).')
  })
})
