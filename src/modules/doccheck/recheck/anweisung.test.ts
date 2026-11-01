import { describe, expect, it } from 'vitest'
import { anweisungAus } from './anweisung'

const a = (befund: string, empfehlung = '', kommentar = '') => anweisungAus({ befund, empfehlung, kommentar })

describe('Prüfanweisung aus Befundtext (N3.1 Schritt 4)', () => {
  it('ersetzen: „replace X with Y", „X → Y", „X should read Y", deutsch „ersetzen X durch Y"', () => {
    expect(a('Replace "check list" with "checklist".')).toMatchObject({ weg: ['check list'], da: ['checklist'] })
    expect(a('„Revison" → „Revision"; „Revsion" -> „Revision"')).toMatchObject({ weg: ['Revison', 'Revsion'], da: ['Revision'] })
    expect(a('"call-out" should read "callout"')).toMatchObject({ weg: ['call-out'], da: ['callout'] })
    expect(a('Bitte „Flugleher" durch „Fluglehrer" ersetzen', 'ersetzen „Flugleher" durch „Fluglehrer"')).toMatchObject({ weg: ['Flugleher'], da: ['Fluglehrer'] })
  })

  it('„Y statt X", streichen und ergänzen', () => {
    expect(a('"TEM" statt "Threat management" verwenden')).toMatchObject({ weg: ['Threat management'], da: ['TEM'] })
    expect(a('Delete "IPT session".')).toMatchObject({ weg: ['IPT session'], da: [] })
    expect(a('„TBD" streichen')).toMatchObject({ weg: ['TBD'] })
    expect(a('', 'Add "Annex A".')).toMatchObject({ weg: [], da: ['Annex A'] })
    expect(a('„Anhang B" ergänzen')).toMatchObject({ da: ['Anhang B'] })
  })

  it('ein Zitat ohne Verb meint den beanstandeten Text; ohne Zitat bleibt die Anweisung leer', () => {
    expect(a('Inconsistent term "a/c" used.')).toMatchObject({ weg: ['a/c'], da: [] })
    expect(a('The grading scale is not described.')).toMatchObject({ weg: [], da: [] })
  })

  it('„evtl." / „could" → nur Empfehlung', () => {
    expect(a('Evtl. "TEM" ergänzen').nurEmpfehlung).toBe(true)
    expect(a('', 'Could add "Annex A".').nurEmpfehlung).toBe(true)
    expect(a('Delete "TBD".').nurEmpfehlung).toBe(false)
  })

  it('Team-Kommentar ist eine Behauptung — was er als ergänzt meldet, muss dastehen', () => {
    const r = a('Table missing.', '', '"Table 1.1.1" added')
    expect(r).toMatchObject({ teamBehauptet: true, da: ['Table 1.1.1'] })
    expect(a('x', '', 'IPT removed').teamBehauptet).toBe(true)
    expect(a('x', '', 'will be checked next revision').teamBehauptet).toBe(false)
  })

  it('was da sein soll, steht nicht zugleich auf der Weg-Liste', () => {
    expect(a('„Alt" → „Neu"; „Neu" streichen', '„Neu" ergänzen')).toMatchObject({ weg: ['Alt'], da: ['Neu'] })
  })

  it('Gegenbeispiele der Fachprüfung (01.11.2026)', () => {
    // Apostroph im Wort ist kein Anführungszeichen
    expect(a("The examiner's checklist doesn't list \"IPT\".")).toMatchObject({ weg: ['IPT'] })
    // „could" mitten im Befund macht keine Empfehlung; am Anfang oder in der Empfehlungsspalte schon
    expect(a('Delete "TBD" — it could lead to a finding.').nurEmpfehlung).toBe(false)
    expect(a('Could you delete "TBD"').nurEmpfehlung).toBe(true)
    // Prosa mit Pfeil: links beanstandet, rechts die Korrektur — nicht beide als Rest
    expect(a("'check list' → bitte einheitlich 'checklist'")).toMatchObject({ weg: ['check list'], da: ['checklist'], ausZitat: false })
    // Nur ein Zitat ohne Handlungswort: als solches markiert
    expect(a('"The FI shall hold a CPL" is incorrect, a valid CPL is required')).toMatchObject({ weg: ['The FI shall hold a CPL'], ausZitat: true })
    expect(a('Delete "TBD"').ausZitat).toBe(false)
  })
})

