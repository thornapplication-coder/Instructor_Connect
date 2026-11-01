import { describe, expect, it } from 'vitest'
import type { FremdBefund } from './fremdliste'
import { befundPruefen, inZitat, remark, STATUS_NAME, teamErledigt, type PaketDok } from './pruefen'

const seite = (index: number, text: string, kapitel?: string) => ({ index, text, label: index === 2 ? 'S. 2 (±1)' : undefined, sectionPath: kapitel ? ['Teil', kapitel] : undefined })
const paket: PaketDok[] = [
  { id: 'tm', titel: 'TM', pages: [seite(1, 'The callout is made.\nThe Revsion   history.', '1 General'), seite(2, 'Approved by AT.ATO.106. Threat management.')] },
  { id: 'apx', titel: 'APX 4', pages: [seite(1, 'The call-out "rotate". The IPT session is held.')] },
  { id: 'scan', titel: 'Scan', pages: [seite(1, '  ')] },
]
const b = (x: Partial<FremdBefund>): FremdBefund => ({ ref: '1', zeile: 3, dokument: '', seite: '', kapitel: '', befund: '', empfehlung: '', teamStatus: '', kommentar: '', verantwortlich: '', ...x })
const tm = { art: 'dok' as const, ids: ['tm'] }

describe('Nachprüfung je Befund (N3.4 Restfundstellen-Regel)', () => {
  it('Resolved nur, wenn der Text im GANZEN Paket weg ist; Rest im Nachbardokument → Partially', () => {
    const r = befundPruefen(b({ befund: '"call-out" should read "callout"', teamStatus: 'Closed' }), tm, paket)
    expect(r).toMatchObject({ status: 'partial', grund: 'restAnderesDok', behauptungWiderlegt: true, abweichung: true })
    expect(r.rest).toEqual([expect.objectContaining({ dokId: 'apx', dok: 'APX 4', seite: '1', auszug: 'The call-out "rotate". The IPT session is held.' })])
    expect(r.belegt[0]).toMatchObject({ dokId: 'tm', kapitel: '1 General' })
    // Alter Text weg, neuer fehlt: nur halb umgesetzt.
    expect(befundPruefen(b({ befund: 'Replace "check list" with "checklist"' }), { art: 'paket' }, paket)).toMatchObject({ status: 'partial', grund: 'teilweise', fehlt: ['checklist'] })
  })

  it('ganze Wörter, Leerraum egal; die Korrektur selbst ist kein Rest', () => {
    expect(befundPruefen(b({ befund: 'Delete "Rev"' }), tm, paket).status).toBe('resolved')
    expect(befundPruefen(b({ befund: 'Delete "Revsion history"' }), tm, paket).rest[0].auszug).toBe('The callout is made. The Revsion history.')
    expect(befundPruefen(b({ befund: 'Replace "ATO.106" with "AT.ATO.106"', teamStatus: 'Closed' }), tm, paket)).toMatchObject({ status: 'resolved', abweichung: false })
    // Satzzeichen am Rand des Suchtexts: keine Wortgrenze nötig
    expect(befundPruefen(b({ befund: 'Delete ".ATO"' }), tm, paket).status).toBe('open')
  })

  it('teilweise: eine Variante weg, eine da', () => {
    const r = befundPruefen(b({ befund: '"Revison" → "Revision"; "Revsion" → "Revision"' }), tm, paket)
    expect(r).toMatchObject({ status: 'partial', grund: 'teilweise', fehlt: ['Revision'] })
  })

  it('Empfehlung nicht umgesetzt → Closed – justification required', () => {
    const r = befundPruefen(b({ befund: 'Evtl. "TEM" statt "Threat management"' }), tm, paket)
    expect(r).toMatchObject({ status: 'justify', grund: 'nurEmpfehlung' })
  })

  it('Team-Kommentar behauptet Korrektur, Text steht noch da → Not resolved, widerlegt', () => {
    const r = befundPruefen(b({ befund: 'Delete "IPT session"', kommentar: 'IPT removed', teamStatus: 'In Review' }), { art: 'dok', ids: ['apx'] }, paket)
    expect(r).toMatchObject({ status: 'open', behauptungWiderlegt: true, abweichung: false })
  })

  it('Not verifiable: Quelle fehlt, Ziel unbekannt, kein Text, keine greifbare Anweisung', () => {
    expect(befundPruefen(b({ befund: 'Delete "x"' }), { art: 'fehlt' }, paket).grund).toBe('quelleFehlt')
    expect(befundPruefen(b({ befund: 'Delete "x"' }), { art: 'dok', ids: ['weg'] }, paket).grund).toBe('quelleFehlt')
    expect(befundPruefen(b({ befund: 'Delete "x"' }), { art: 'dok', ids: ['scan'] }, paket).grund).toBe('keinText')
    const r = befundPruefen(b({ befund: 'Grading scale not described', teamStatus: 'Closed' }), tm, paket)
    expect(r).toMatchObject({ status: 'unverifiable', grund: 'keineAnweisung', abweichung: false })
  })

  it('Team-Status „erledigt" erkennen, Verneinung nicht', () => {
    expect(['Closed', 'erledigt', 'Completed', 'OK'].every(teamErledigt)).toBe(true)
    expect(['Open', 'not resolved', 'teilweise erledigt', ''].some(teamErledigt)).toBe(false)
  })

  it('Kapitel an der Fundstelle: letzte Überschrift davor, sonst die der Vorseite, sonst sectionPath', () => {
    const d: PaketDok = {
      id: 'w', titel: 'W',
      outline: [{ titel: '1 General', vonSeite: 1 }, { titel: '2 Systems', vonSeite: 1 }, { titel: '3 Limits', vonSeite: 2 }],
      pages: [{ index: 1, text: '1 General\nFoo alpha.\n2 Systems\nBar beta.' }, { index: 2, text: 'Gamma.\n3 Limits\nDelta.' }, { index: 3, text: 'Epsilon.', sectionPath: ['X'] }],
    }
    const k = (q: string) => befundPruefen(b({ befund: `Delete "${q}"` }), { art: 'paket' }, [d]).rest[0].kapitel
    expect([k('alpha'), k('beta'), k('Gamma'), k('Delta'), k('Epsilon')]).toEqual(['1 General', '2 Systems', '2 Systems', '3 Limits', '3 Limits'])
    expect(befundPruefen(b({ befund: 'Delete "Epsilon"' }), { art: 'paket' }, [{ ...d, outline: undefined }]).rest[0].kapitel).toBe('X')
  })

  it('Abweichung: Team offen, Prüfung behoben', () => {
    expect(befundPruefen(b({ befund: 'Delete "Rev"', teamStatus: 'Open' }), tm, paket).abweichung).toBe(true)
  })
})

describe('Remark (N3.2)', () => {
  it('deutsch: Präfix mit Status und Datum, Restfundstellen „Dokument · Kapitel · Seite · Auszug"', () => {
    const r = befundPruefen(b({ befund: '"call-out" should read "callout"', teamStatus: 'Closed' }), tm, paket)
    expect(remark(r, '2026-11-01T09:00:00Z')).toBe(
      'TEILWEISE BEHOBEN (Re-Check 01.11.2026): Im genannten Dokument behoben, im Paket aber noch vorhanden:\n' +
        '• APX 4 · S. 1 · „The call-out "rotate". The IPT session is held."\n' +
        'Team-Kommentar meldet die Korrektur, im Dokument nicht nachweisbar.\n' +
        'Korrekturvorschlag: „call-out" → „callout"',
    )
  })

  it('englisch; Korrekturvorschlag bleibt Manual-Text', () => {
    const r = befundPruefen(b({ befund: 'Replace "Threat management" with "TEM"' }), tm, paket)
    expect(remark(r, '2026-11-01', 'en')).toBe(
      'NOT RESOLVED (re-check 2026-11-01): Text objected to is still present unchanged.\nStill present:\n• TM · S. 2 (±1) · „Approved by AT.ATO.106. Threat management."\nMissing: „TEM"\nProposed correction: „Threat management" → „TEM"',
    )
  })

  it('behoben und nicht prüfbar: nur der Satz', () => {
    expect(remark(befundPruefen(b({ befund: 'Delete "Rev"' }), tm, paket), '2026-11-01')).toBe('BEHOBEN (Re-Check 01.11.2026): Korrektur im gesamten Paket umgesetzt.')
    expect(remark(befundPruefen(b({}), { art: 'fehlt' }, paket), '2026-11-01', 'en')).toBe('NOT VERIFIABLE (re-check 2026-11-01): Referenced document is not part of the review package.')
    expect(STATUS_NAME.justify).toBe('Closed – justification required')
  })

  it('lange Seiten: Auszug mit Auslassungszeichen', () => {
    const lang: PaketDok[] = [{ id: 'l', titel: 'L', pages: [seite(1, `${'a '.repeat(60)}ZIEL${' b'.repeat(60)}`)] }]
    const r = befundPruefen(b({ befund: 'Delete "ZIEL"' }), { art: 'paket' }, lang)
    expect(r.rest[0].auszug).toMatch(/^….*ZIEL.*…$/)
  })
})

describe('Restfundstellen-Regel: Ausnahmen (N3.4)', () => {
  const dok = (text: string): PaketDok[] => [{ id: 'd', titel: 'D', pages: [{ index: 1, text }] }]
  const ersetzen = 'Replace "call out" with "callout"'

  it('Nomen/Verb-Paar: „to call out" ist keine Restfundstelle, „each call out" schon', () => {
    const r = befundPruefen(b({ befund: ersetzen }), { art: 'paket' }, dok('The PM will call out the speed. The callout is standard. Each call out is logged. Pilots need to call out "V1".'))
    expect(r.rest.map((f) => f.auszug.includes('Each call out'))).toEqual([true])
    expect(r.ausgenommen.map((f) => f.grund)).toEqual(['verb', 'verb'])
    // „callout" steht schon da, ein „call out" auch noch → teilweise
    expect(r.status).toBe('partial')
    expect(befundPruefen(b({ befund: ersetzen }), { art: 'paket' }, dok('Crews shall call out deviations. The callout is standard.')).status).toBe('resolved')
  })

  it('Verbform gilt nur bei einem Schreibweisen-Paar — „delete" eines Ausdrucks zählt jeden Treffer', () => {
    const r = befundPruefen(b({ befund: 'Delete "call out"' }), { art: 'paket' }, dok('Crews shall call out deviations.'))
    expect(r).toMatchObject({ status: 'open', ausgenommen: [] })
  })

  it('erkennbares Zitat zählt nicht; Anführungszeichen in einer anderen Zeile machen keinen Treffer zum Zitat', () => {
    const r = befundPruefen(b({ befund: 'Replace "check list" with "checklist"' }), { art: 'paket' }, dok('AMC1 states: “The check list shall be used.”\nOur check list is used. The checklist is new.'))
    expect(r.ausgenommen).toEqual([expect.objectContaining({ grund: 'zitat' })])
    expect(r.rest).toHaveLength(1)
    // Zitat beginnt in Zeile 1, Treffer in Zeile 2 — im Zweifel Rest (sichere Richtung)
    const z = befundPruefen(b({ befund: 'Delete "check list"' }), { art: 'paket' }, dok('He wrote "see\nthe check list" today.'))
    expect([z.rest.length, z.ausgenommen.length]).toEqual([1, 0])
  })

  it('wörtlich in einem Master-Dokument belegt → Zitat aus der Bibliothek; zu kurzes Umfeld wird nicht geprüft', () => {
    const quelle: PaketDok[] = [{ id: 'm', titel: 'AMC1 ORA.ATO.230', pages: [{ index: 1, text: 'The instructor shall verify the check list before each training flight.' }] }]
    const r = befundPruefen(b({ befund: 'Delete "check list"' }), { art: 'paket' }, dok('As required: The instructor shall verify the check list before each training flight. Our check list differs.'), quelle)
    expect(r.ausgenommen).toEqual([expect.objectContaining({ grund: 'bibliothek', quelle: 'AMC1 ORA.ATO.230' })])
    expect(r.rest).toHaveLength(1)
    expect(befundPruefen(b({ befund: 'Delete "check list"' }), { art: 'paket' }, dok('check list'), quelle).rest).toHaveLength(1)
  })

  it('Remark nennt die nicht gezählten Fundstellen; der Nachweis zählt auch in einem Zitat', () => {
    const r = befundPruefen(b({ befund: ersetzen }), { art: 'paket' }, dok('Crews shall call out deviations. "The callout" is defined.'))
    expect(r.belegt).toHaveLength(1)
    expect(remark(r, '2026-11-01')).toBe('BEHOBEN (Re-Check 01.11.2026): Korrektur im gesamten Paket umgesetzt.\nNicht als Rest gezählt (Zitat bzw. Verbform): 1 Fundstelle.')
    const zwei = befundPruefen(b({ befund: ersetzen }), { art: 'paket' }, dok('to call out; must call out. The callout.'))
    expect(remark(zwei, '2026-11-01', 'en')).toContain('Not counted as remaining (quotation or verb form): 2 occurrences.')
  })

  it('inZitat zählt nur im angegebenen Bereich', () => {
    expect(inZitat('a "b c" d', 3, 1)).toBe(true)
    expect(inZitat('a "b c" d', 8, 1)).toBe(false)
    expect(inZitat('"x" y "z', 4, 1)).toBe(false)
    expect(inZitat('" | a b"', 4, 1, 3)).toBe(false)
  })

})

describe('Resolved nur mit Nachweis (Fachprüfung 01.11.2026)', () => {
  it('verschwundenes Zitat ohne Handlungswort: Resolved, aber Grund „nurAbwesend" und ehrlicher Remark', () => {
    const dok: PaketDok[] = [{ id: 'd', titel: 'D', pages: [{ index: 1, text: 'The FI shall hold a valid CPL.' }] }]
    const r = befundPruefen(b({ befund: '"The FI shall hold a CPL" is incorrect' }), { art: 'paket' }, dok)
    expect(r).toMatchObject({ status: 'resolved', grund: 'nurAbwesend' })
    expect(remark(r, '2026-11-01')).toBe('BEHOBEN (Re-Check 01.11.2026): Beanstandeter Text kommt im Paket nicht mehr vor; ob der Mangel inhaltlich behoben ist, ist damit nicht belegt – bitte prüfen.')
    expect(remark(r, '2026-11-01', 'en')).toContain('does not show that the issue itself is resolved')
    // Mit Handlungswort ist das Fehlen der Nachweis
    expect(befundPruefen(b({ befund: 'Delete "hold a CPL"' }), { art: 'paket' }, dok).grund).toBe('wegUndDa')
  })
})

