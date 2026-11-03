import { describe, expect, it } from 'vitest'
import { ampelMatrix, dateiStamm, datenstand, dokumentAngabe, dokumentKurz, exportId, fundort, FUSS_MAX, fussText, gesamtVorschlag, kennung, LABELS, ohneSteuerzeichen, praefixe, pruefungenAus, revisionAngabe, revisionKurz, seitenZahl, STAMM_DOKUMENT_MAX, STAMM_REVISION_MAX } from './datenstand'
import { befund, dok, eingabe } from './beispiel'
import { VOLL_GELESEN } from '../pruefung/befund'
import { dateiLesen } from '../parse/lesen'
import { dokumentPruefen } from '../pruefung/pruefen'
import { SBX_CALC_01_NAME, SBX_WORD_01_NAME, sbxCalc01, sbxWord01 } from '../benchmark/sbx'
import { aktuellerStand, SANDBOX_STAENDE, standLabelIso } from '../library'

describe('Export-Datenstand (Spez. v1.1 Kap. 10.1, 10.2)', () => {
  const d = datenstand(eingabe())

  it('Export-ID, Dateinamen-Stamm, Datum ISO', () => {
    expect(d.exportId).toBe('DC-2026-11-01-0007')
    expect(exportId('2026-01-02', 0)).toBe('DC-2026-01-02-0001')
    expect(d.datum).toBe('2026-11-01')
    // Zeitpunkt mit Uhrzeit für die Report history, der Tag für alles andere (Audit 11/2026, EXP-19)
    expect(d.zeit).toBe('2026-11-01T09:30:00Z')
    expect(datenstand(eingabe({ datum: '2026-11-02T00:30:00+01:00' })).zeit).toBe('2026-11-02T00:30:00+01:00')
    // Bewusst geändert: zwei Prüfdokumente — der Stamm nennt das zweite mit (Audit 11/2026, EXP-08)
    expect(d.dateiStamm).toBe('2026-11-01_Review_TM-CL30-plus-1_Rev0.1')
    expect(dateiStamm('2026-11-01', null)).toBe('2026-11-01_Review_Package_RevNA')
    expect(dateiStamm('2026-11-01', dok('x', 'review', { name: 'Ops Manual (draft).docx', revision: 'Revision 2' }))).toBe('2026-11-01_Review_Ops-Manual-draft_Rev2')
    expect(dateiStamm('2026-11-01', dok('x', 'review', { name: '', titel: '' }))).toBe('2026-11-01_Review_Document_RevNA')
  })

  it('Sortierung Dokument → Seite → Priorität; IDs eindeutig über Dokumente, Paket zuletzt', () => {
    // Seite bewusst geändert: vorher stand „S. 3" im englischen Export (Audit 11/2026, EXP-07/TXT-01)
    expect(d.befunde.map((b) => [b.id, b.spalten[1], b.spalten[5], b.prioritaet])).toEqual([
      ['TM-001', 'Training Manual CL30', 'Page 3', 'High'],
      ['TM-002', 'Training Manual CL30', 'Page 3', 'Medium'],
      ['TM-003', 'Training Manual CL30', 'Page 12', 'Low'],
      // zweites Dokument mit gleichem Typ bekommt ein eigenes Präfix
      ['TM2-001', 'Appendix 4 – Line Training', 'Page 2', 'High'],
      ['PKG-001', 'Package', '', 'Medium'],
    ])
    expect(new Set(d.befunde.map((b) => b.id)).size).toBe(d.befunde.length)
  })

  it('Spalten: 24 in fester Reihenfolge; Korrektur englisch aus dem Sprachpaket; weitere Dokumente', () => {
    expect(LABELS.columns).toHaveLength(24)
    for (const b of d.befunde) expect(b.spalten).toHaveLength(24)
    const tm1 = d.befunde[0].spalten
    expect(tm1[3]).toBe('Rev 0.1 / 2026-10-01')
    expect(tm1[4]).toBe('2.1 Hours')
    expect(tm1[13]).toBe('Inconsistency')
    expect(tm1[17]).toMatch(/^[A-Z]/)
    expect(tm1[17]).not.toBe('')
    expect(tm1.slice(19)).toEqual(['Verified (rule-based)', 'New', '', '', 'Open'])
    expect(d.befunde[3].spalten[18]).toBe('Training Manual CL30')
    expect(d.befunde[2].spalten[17]).toBe('')
  })

  it('Zählung Category × Priority, To verify, Top 5, Gesamtbewertung', () => {
    expect(d.zaehlung.Inconsistency).toEqual({ High: 1, Medium: 1, Low: 0 })
    expect(d.zaehlung.Gap.High).toBe(1)
    expect(Object.values(d.zaehlung).flatMap((x) => Object.values(x)).reduce((a, b) => a + b, 0)).toBe(5)
    expect(d.zuPruefen).toBe(1)
    expect(d.top5).toEqual(['TM-001', 'TM2-001', 'TM-002', 'PKG-001', 'TM-003'])
    expect(d.gesamt).toBe('notReady')
    expect(gesamtVorschlag([{ prioritaet: 'Low' }], VOLL_GELESEN)).toBe('afterCorrection')
    expect(gesamtVorschlag([], VOLL_GELESEN)).toBe('ready')
  })

  it('Seiten ohne Textebene: „Not assessable – text recognition pending", nie „Ready" (Audit 11/2026, DC-03)', () => {
    // Ein Scan ohne OCR hat keine Befunde und ging als „Ready for submission" in den Export
    const scan = { ocrSeiten: 1, ohneText: 1 }
    expect(gesamtVorschlag([], scan)).toBe('notAssessable')
    expect(gesamtVorschlag([{ prioritaet: 'Low' }], scan)).toBe('notAssessable')
    expect(gesamtVorschlag([], { ocrSeiten: 0, ohneText: 1 })).toBe('notAssessable')
    // Ein offener Hoch-Befund sagt sicher „nicht bereit", gleich was ungelesen ist
    expect(gesamtVorschlag([{ prioritaet: 'High' }], scan)).toBe('notReady')
    const s = datenstand(eingabe({ befunde: [], lesestand: scan }))
    expect(s.gesamt).toBe('notAssessable')
    expect(LABELS.overall.notAssessable).toBe('Not assessable – text recognition pending')
    expect(Object.fromEntries(kennung(s))['Overall assessment']).toBe('Not assessable – text recognition pending')
  })

  it('Ampeln mit englischen Namen; Kennungsblock und Fußzeile', () => {
    expect(d.ampeln).toContainEqual({ dokument: 'Training Manual CL30', gruppe: 'Formal check', punkt: 'LEP', ampel: 'wait' })
    expect(d.ampeln).toContainEqual(expect.objectContaining({ gruppe: 'Word check', ampel: 'bad' }))
    const k = Object.fromEntries(kennung(d))
    expect(k).toMatchObject({ Organisation: 'Example ATO', 'Review type': 'Initial review', 'Overall assessment': 'Not ready for submission', 'Export ID': 'DC-2026-11-01-0007', Disclaimer: 'AI-assisted review – expert approval required' })
    // Bewusst geändert: Kennung und Fußzeile nennen das zweite Prüfdokument mit (Audit 11/2026, EXP-08)
    expect(k['Document under review']).toBe('Training Manual CL30 · TM-CL30 · Rev 0.1 · 2026-10-01 + 1 further document (see “Documents & Sources”)')
    expect(k['Master documents used']).toMatch(/^1 /)
    expect(fussText(d)).toBe('Example ATO · DocCheck Review · Training Manual CL30 Rev 0.1 + 1 further document · DC-2026-11-01-0007')
    // Ohne Organisation: nichts erfunden, Feld fehlt
    const ohne = datenstand(eingabe({ organisation: '  ', dokumente: [] }))
    expect(kennung(ohne).map(([key]) => key)).not.toContain('Organisation')
    expect(fussText(ohne)).toBe('DocCheck Review · Package · DC-2026-11-01-0007')
    expect(Object.fromEntries(kennung(ohne))['Document under review']).toBe('—')
  })

  it('Kennung durchgehend ISO: kein Wert im Format DD.MM.YYYY (Audit 11/2026, EXP-16/TXT-15)', () => {
    // Vorher: „Library state: Lib 3 · 28.10.2026" neben „Review date: 2026-11-01"
    const stand = datenstand(eingabe({ bibliothek: standLabelIso(aktuellerStand(SANDBOX_STAENDE)) }))
    const k = kennung(stand)
    expect(Object.fromEntries(k)['Library state']).toBe('Lib 3 · 2026-10-28')
    for (const [schluessel, wert] of k) expect(wert, schluessel).not.toMatch(/\d{2}\.\d{2}\.\d{4}/)
  })

  it('0 Befunde: leere Liste, „ready", keine Top 5', () => {
    const leer = datenstand(eingabe({ befunde: [] }))
    expect([leer.befunde, leer.top5, leer.gesamt, leer.zuPruefen]).toEqual([[], [], 'ready', 0])
  })

  it('Seitenzahlen aus Bezeichnungen — deutsch und englisch dieselbe Zahl', () => {
    expect([seitenZahl('S. 12'), seitenZahl('ca. 3'), seitenZahl('6-04-15 Page 2'), seitenZahl(undefined)]).toEqual([12, 3, 6, Number.MAX_SAFE_INTEGER])
    expect(['Page 12 (±1)', 'approx. page 12', 'Pages 12–13 (±1)', 'S. 12–13 (±1)'].map(seitenZahl)).toEqual([12, 12, 12, 12])
  })

  it('Spalte „Page" englisch, Herkunft bleibt; keine „S."/„ca."-Angabe im Export (Audit 11/2026, EXP-07/TXT-01)', () => {
    const fs = (seite: string) => [{ seite, auszug: 'x' }]
    const s = datenstand(
      eingabe({
        befunde: [
          befund('F-01', 'tm', { fundstellen: fs('ca. 1') }),
          befund('F-02', 'tm', { fundstellen: fs('S. 2 (±1)') }),
          befund('F-03', 'tm', { fundstellen: fs('S. 10–11 (±1)') }),
          befund('F-04', 'tm', { fundstellen: fs('Page 5') }),
          befund('F-05', 'tm', { fundstellen: fs('6-04-15 Page 7') }),
        ],
      }),
    )
    expect(s.befunde.map((b) => [b.spalten[5], b.seiteNr])).toEqual([
      ['approx. page 1', 1],
      ['Page 2 (±1)', 2],
      ['Page 5', 5],
      ['6-04-15 Page 7', 6],
      ['Pages 10–11 (±1)', 10],
    ])
    for (const b of s.befunde) expect(b.spalten.join('|')).not.toMatch(/\b(S\.|ca\.) \d/)
  })

  it('IDs eindeutig über Dokumente, auch wenn zwei Dokumente je „F-01" tragen (CLAUDE.md, Exporte)', () => {
    const s = datenstand(eingabe({ befunde: [befund('F-01', 'tm'), befund('F-01', 'apx'), befund('F-02', 'tm', { prioritaet: 'High' }), befund('P-01', 'paket')] }))
    expect(s.befunde.map((b) => [b.dokId, b.id])).toEqual([['tm', 'TM-001'], ['tm', 'TM-002'], ['apx', 'TM2-001'], ['paket', 'PKG-001']])
    expect(s.befunde.map((b) => b.spalten[0])).toEqual(s.befunde.map((b) => b.id))
  })

  it('„Checks performed" zeigt genau die gelaufenen Prüfungen des Stands (Audit 11/2026, EXP-01/DC-12)', () => {
    // Beispiel: Formal- und Word-Check an einem Dokument, Paket geprüft
    expect(d.pruefungen).toEqual([LABELS.checks.formal, LABELS.checks.word, LABELS.checks.paket])
    expect(Object.fromEntries(kennung(d))['Checks performed']).toBe(d.pruefungen.join(', '))
    const ohnePaket = datenstand(eingabe({ paketGeprueft: false, ampeln: [{ dokId: 'tm', gruppen: { rechnen: { summen: 'ok' }, leer: {} } }] }))
    expect(ohnePaket.pruefungen).toEqual([LABELS.checks.rechnen])
    // Eine unbekannte Gruppe fällt nicht still weg — sie heißt wie im Sprachpaket bzw. wie ihr Schlüssel
    expect(pruefungenAus([{ dokId: 'x', gruppen: { neu: { a: 'ok' } } }], false)).toEqual(['neu'])
  })

  it('Steuerzeichen fallen EINMAL beim Einfrieren weg — für alle Formate gleich (Audit 11/2026, SEC-04)', () => {
    const roh = eingabe({
      organisation: 'Example\u0007 ATO',
      dokumente: [dok('tm', 'review', { typ: 'TM', titel: 'Training\u000B Manual', revision: 'Rev\u0000 1' })],
      befunde: [befund('F-01', 'tm', { text: 'Bullet\u0002text from PDF', fundstellen: [{ seite: 'S. 2', ort: 'Kap\u001F 1', auszug: 'a\u0008b\tc\nd\re\uFFFE' }] })],
    })
    const s = datenstand(roh)
    const verboten = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/
    const texte = (x: unknown): string[] => (typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(texte) : [])
    expect(texte(s).filter((t) => verboten.test(t))).toEqual([])
    expect(texte(roh).filter((t) => verboten.test(t))).toHaveLength(6)
    expect(s.befunde[0].spalten[16]).toBe('Bullettext from PDF')
    // Tab, Zeilenumbruch und Wagenrücklauf bleiben — sie sind erlaubt und tragen Inhalt
    expect(s.befunde[0].spalten[7]).toBe('ab\tc\nd\re')
    expect([s.organisation, s.haupt?.titel, s.dokumente[0].revision, s.befunde[0].spalten[4]]).toEqual(['Example ATO', 'Training Manual', 'Rev 1', 'Kap 1'])
    expect(ohneSteuerzeichen({ a: ['x\u0002', 1, null, true] })).toEqual({ a: ['x', 1, null, true] })
  })

  it('Datum mit Ortsversatz (lokalIso): Export-ID und Dateiname tragen den lokalen Tag (Audit 11/2026, EXM-01)', () => {
    // 00:30 in Wien ist in UTC noch der 01.11.
    const s = datenstand(eingabe({ datum: '2026-11-02T00:30:00+01:00', laufnummer: 3 }))
    expect([s.exportId, s.datum, s.dateiStamm]).toEqual(['DC-2026-11-02-0003', '2026-11-02', '2026-11-02_Review_TM-CL30-plus-1_Rev0.1'])
    expect(exportId('2026-11-02T00:30:00+01:00', 1)).toBe('DC-2026-11-02-0001')
  })
})

describe('Befund-IDs: Präfixe je Dokument (Audit 11/2026, EXP-09)', () => {
  it('DOCn zählt nur die Dokumente ohne Typ — lückenlos; ein zweites TM heißt TM2', () => {
    // Vorher DOC2, DOC3, DOC5: gezählt wurde die Stelle unter allen Prüfdokumenten
    const typen = ['TM', '', '', 'TM', '']
    expect([...praefixe(typen.map((typ, i) => ({ id: `d${i}`, typ }))).values()]).toEqual(['TM', 'DOC1', 'DOC2', 'TM2', 'DOC3'])
    const s = datenstand(eingabe({ dokumente: typen.map((typ, i) => dok(`d${i}`, 'review', { typ })), befunde: typen.map((_, i) => befund('F-01', `d${i}`)) }))
    expect(s.befunde.map((b) => b.id)).toEqual(['TM-001', 'DOC1-001', 'DOC2-001', 'TM2-001', 'DOC3-001'])
  })

  it('ein Präfix wird nie zweimal vergeben — auch nicht, wenn ein Typ „TM2" oder „PKG" heißt', () => {
    expect([...praefixe(['TM', 'TM', 'TM2', 'PKG', 'p.k.g'].map((typ, i) => ({ id: `d${i}`, typ }))).values()]).toEqual(['TM', 'TM2', 'TM22', 'PKG2', 'PKG3'])
    const s = datenstand(eingabe({ dokumente: ['TM', 'TM', 'TM2', 'PKG'].map((typ, i) => dok(`d${i}`, 'review', { typ })), befunde: [...['d0', 'd1', 'd2', 'd3'].map((d) => befund('F-01', d)), befund('P-01', 'paket')] }))
    expect(new Set(s.befunde.map((b) => b.id)).size).toBe(5)
    expect(s.befunde.at(-1)!.id).toBe('PKG-001')
  })
})

describe('Revision und Dateistamm (Audit 11/2026, EXP-18, EXM-05)', () => {
  const mitRevision = (revision: string) => datenstand(eingabe({ dokumente: [dok('tm', 'review', { titel: 'Training Manual', nummer: 'TM-1', revision })] }))

  it('Kurzform im Dateinamen: Edition/Issue/Revision/Amendment', () => {
    expect(['Edition 1 Revision 0.0', 'Issue 3 Revision 2', 'Rev. 3 / Amendment 2', 'Rev 0.1', 'R1', 'Revision 2', 'Ed. 2, Rev. B', 'Amendment 4', '0.1', 'Draft', ''].map(revisionKurz)).toEqual([
      'E1R0.0', 'I3R2', '3-A2', '0.1', '1', '2', 'E2RB', 'A4', '0.1', 'Draft', '',
    ])
    // „issued" ist keine Ausgabe „d", „Review" kein „Rev"
    expect(revisionKurz('Rev 1.0, issued 2026-10-01')).toBe('1.0')
    expect(revisionKurz('Review copy')).toBe('Review-copy')
  })

  it('Stamm und Fußzeile für die drei Schreibweisen — ohne doppeltes „Rev"', () => {
    // Vorher: „…_RevEdition-1-Revision-0.0" und „Training Manual Rev Edition 1 Revision 0.0"
    const fall = (revision: string) => {
      const s = mitRevision(revision)
      return [s.dateiStamm, fussText(s)]
    }
    expect(fall('Edition 1 Revision 0.0')).toEqual(['2026-11-01_Review_TM-1_RevE1R0.0', 'Example ATO · DocCheck Review · Training Manual Edition 1 Revision 0.0 · DC-2026-11-01-0007'])
    expect(fall('Issue 3 Revision 2')).toEqual(['2026-11-01_Review_TM-1_RevI3R2', 'Example ATO · DocCheck Review · Training Manual Issue 3 Revision 2 · DC-2026-11-01-0007'])
    expect(fall('Rev. 3 / Amendment 2')).toEqual(['2026-11-01_Review_TM-1_Rev3-A2', 'Example ATO · DocCheck Review · Training Manual Rev 3 / Amendment 2 · DC-2026-11-01-0007'])
    expect(['Revision 0.1', 'R0.1', '0.1', 'Revision: 2', 'Rev', ''].map(revisionAngabe)).toEqual(['Rev 0.1', 'Rev 0.1', 'Rev 0.1', 'Rev 2', 'Rev', ''])
  })

  it('Titel aus 230 Zeichen: Stamm unter 130 Zeichen, am Wortende, Datum vorn und „_Rev…" hinten', () => {
    // Vorher 239–248 Zeichen samt Endung — über der Pfadgrenze von Excel
    const titel = `${Array.from({ length: 23 }, (_, i) => `Kapitel${String(i).padStart(2, '0')}`).join(' ')}X`
    expect(titel).toHaveLength(230)
    const stamm = dateiStamm('2026-11-02T00:30:00+01:00', dok('x', 'review', { titel, revision: 'Rev 0.1' }))
    expect(stamm.length).toBeLessThan(130)
    expect(stamm).toMatch(/^2026-11-02_Review_Kapitel00-Kapitel01-.*-Kapitel\d\d_Rev0\.1$/)
    expect(stamm.split('_')[2].length).toBeLessThanOrEqual(STAMM_DOKUMENT_MAX)
    // Eine Revision über 60 Zeichen bleibt bei 20; ein Name ohne Trenner wird hart geschnitten
    const lang = dateiStamm('2026-11-02', dok('x', 'review', { nummer: 'X'.repeat(200), revision: `Draft ${'y'.repeat(60)}` }))
    expect(lang.slice(lang.lastIndexOf('_Rev') + 4)).toBe(`Draft-${'y'.repeat(STAMM_REVISION_MAX - 6)}`)
    expect(lang.split('_')[2]).toBe('X'.repeat(STAMM_DOKUMENT_MAX))
    // Kein Punkt am Rand: „..." wäre eine versteckte Datei bzw. von Windows gestrichen
    expect(dateiStamm('2026-11-02', dok('x', 'review', { nummer: '...', revision: '.' }))).toBe('2026-11-02_Review_Document_RevNA')
  })
})

describe('Mehrere Prüfdokumente: Hauptdokument und weitere (Audit 11/2026, EXP-08)', () => {
  const drei = datenstand(
    eingabe({
      dokumente: [
        dok('tm', 'review', { typ: 'TM', titel: 'Training Manual', nummer: 'TM-1', revision: 'Rev 2' }),
        dok('apx', 'review', { titel: 'Appendix 4' }),
        dok('anx', 'review', { titel: 'Annex 2A' }),
        dok('ear', 'master', { titel: 'Part-ORA' }),
      ],
    }),
  )

  it('Kennung, Fußzeile und Dateiname nennen das Hauptdokument UND die Zahl der weiteren — Master zählen nicht', () => {
    // Vorher nannten sie nur das zuerst geladene Dokument, als wäre es allein geprüft
    expect(Object.fromEntries(kennung(drei))['Document under review']).toBe('Training Manual · TM-1 · Rev 2 + 2 further documents (see “Documents & Sources”)')
    expect(dokumentAngabe(drei)).toBe(Object.fromEntries(kennung(drei))['Document under review'])
    expect(dokumentKurz(drei)).toBe('Training Manual Rev 2 + 2 further documents')
    expect(fussText(drei)).toBe('Example ATO · DocCheck Review · Training Manual Rev 2 + 2 further documents · DC-2026-11-01-0007')
    expect(drei.dateiStamm).toBe('2026-11-01_Review_TM-1-plus-2_Rev2')
    // Ohne Prüfdokument: nichts erfunden — die Stelle wählt ihren Ersatz
    const ohne = datenstand(eingabe({ dokumente: [dok('ear', 'master')] }))
    expect([dokumentAngabe(ohne), dokumentKurz(ohne), ohne.dateiStamm]).toEqual(['', 'Package', '2026-11-01_Review_Package_RevNA'])
  })

  it('die Zahl steht auch in einem gekürzten Stamm', () => {
    const lang = dateiStamm('2026-11-01', dok('x', 'review', { titel: 'Wort '.repeat(40) }), 12)
    expect(lang).toMatch(/-plus-12_RevNA$/)
    expect(lang.split('_')[2].length).toBeLessThanOrEqual(STAMM_DOKUMENT_MAX)
  })
})

describe('Fußzeile mit Höchstlänge (Audit 11/2026, EXP-04)', () => {
  const org = `Aviation Academy ${'Organisation '.repeat(8)}`.trim().padEnd(120, 'x')
  const titel = `Training & Procedures Manual ${'Volume '.repeat(30)}`.slice(0, 200)

  it('kürzt zuerst den Titel, dann die Organisation; Export-ID, Revision und weitere Dokumente bleiben ganz', () => {
    const s = datenstand(eingabe({ organisation: org, dokumente: [dok('tm', 'review', { titel, revision: 'Rev 0.1' }), dok('apx', 'review')] }))
    const f = fussText(s)
    expect(Array.from(f).length).toBeLessThanOrEqual(FUSS_MAX)
    expect(f).toMatch(/ Rev 0\.1 \+ 1 further document · DC-2026-11-01-0007$/)
    // Der Titel fällt auf 20 Zeichen, die Organisation trägt den Rest
    expect(f).toMatch(/^Aviation Academy O… · DocCheck Review · Training & Procedur… Rev/)
    // Reicht der Titel, bleibt die Organisation ganz
    const kurzeOrg = datenstand(eingabe({ dokumente: [dok('tm', 'review', { titel, revision: 'Rev 0.1' })] }))
    expect(fussText(kurzeOrg)).toMatch(/^Example ATO · DocCheck Review · Training & Procedures Manual Volume .*… Rev 0\.1 · DC-2026-11-01-0007$/)
    expect(Array.from(fussText(kurzeOrg)).length).toBe(FUSS_MAX)
    // Kurz genug: unverändert
    expect(fussText(d0(), 500)).toBe(fussText(d0()))
  })

  it('auch eine überlange Revision hält die Grenze — die Export-ID bleibt ganz', () => {
    const s = datenstand(eingabe({ organisation: org, dokumente: [dok('tm', 'review', { titel, revision: `Rev ${'9'.repeat(300)}` })] }))
    expect(Array.from(fussText(s)).length).toBeLessThanOrEqual(FUSS_MAX)
    expect(fussText(s)).toMatch(/9… · DC-2026-11-01-0007$/)
    // Paket aus sieben Dokumenten mit langer Revisionsangabe: im LibreOffice-Druck stand vorher „DC-2026-1…"
    const paket = datenstand(eingabe({ organisation: org, dokumente: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => dok(id, 'review', { titel, revision: 'Edition 1 Revision 0.0' })) }))
    expect(fussText(paket)).toMatch(/ · DC-2026-11-01-0007$/)
    expect(Array.from(fussText(paket)).length).toBeLessThanOrEqual(FUSS_MAX)
    // Bei einer winzigen Grenze gilt sie trotzdem
    expect(Array.from(fussText(s, 30)).length).toBeLessThanOrEqual(30)
  })

  function d0() {
    return datenstand(eingabe())
  }
})

describe('Ampel als Matrix Prüfpunkt × Dokument (Audit 11/2026, EXP-10)', () => {
  it('eine Zeile je Prüfpunkt, eine Spalte je Prüfdokument mit ID-Präfix; null, wo der Punkt nicht lief', () => {
    const s = datenstand(
      eingabe({
        ampeln: [
          { dokId: 'tm', gruppen: { formal: { lep: 'wait', seiten: 'ok' }, word: { unsichtbar: 'bad' } } },
          { dokId: 'apx', gruppen: { formal: { lep: 'na', seiten: 'ok' } } },
        ],
      }),
    )
    const m = ampelMatrix(s)
    expect(m.spalten).toEqual([{ dokument: 'Training Manual CL30', kuerzel: 'TM' }, { dokument: 'Appendix 4 – Line Training', kuerzel: 'TM2' }])
    expect(m.zeilen.map((z) => [z.gruppe, z.punkt, ...z.ampeln])).toEqual([
      ['Formal check', 'LEP', 'wait', 'na'],
      ['Formal check', s.ampeln[1].punkt, 'ok', 'ok'],
      ['Word check', s.ampeln[2].punkt, 'bad', null],
    ])
    expect(ampelMatrix({ ...s, ampeln: [] })).toEqual({ spalten: [], zeilen: [] })
  })

  it('Spaltenkopf aus den Befund-IDs, wo es Befunde gibt — ein älterer Prüfstand behält seine Präfixe', () => {
    const s = datenstand(eingabe())
    const alt = { ...s, befunde: s.befunde.map((b) => (b.dokId === 'tm' ? { ...b, id: b.id.replace('TM-', 'DOC2-') } : b)) }
    expect(ampelMatrix(alt).spalten[0].kuerzel).toBe('DOC2')
    // Ein Dokument, das nicht (mehr) unter den Dokumenten steht, behält seinen Namen als Kopf
    expect(ampelMatrix({ ...s, ampeln: [{ dokument: 'Unbekannt', gruppe: 'Formal check', punkt: 'LEP', ampel: 'ok' }] }).spalten).toEqual([{ dokument: 'Unbekannt', kuerzel: 'Unbekannt' }])
  })

  it('Ampeln folgen der Dokumentreihenfolge des Exports, nicht der Eingabe', () => {
    const s = datenstand(eingabe({ ampeln: [{ dokId: 'apx', gruppen: { formal: { lep: 'ok' } } }, { dokId: 'tm', gruppen: { formal: { lep: 'bad' } } }, { dokId: 'fremd', gruppen: { formal: { lep: 'ok' } } }] }))
    expect(s.ampeln.map((a) => a.dokument)).toEqual(['Training Manual CL30', 'Appendix 4 – Line Training', 'fremd'])
  })
})

describe('Fundort der Top-5-Tabellen (Audit 11/2026, TXT-16)', () => {
  it('Kapitel und Seite, soweit vorhanden — nicht das eine ODER das andere', () => {
    // Vorher zeigte die Folie unter „Chapter" das Kapitel oder, wenn es fehlte, die Seite
    const d = datenstand(eingabe())
    const nachId = new Map(d.befunde.map((b) => [b.spalten[16], b]))
    expect(fundort(nachId.get('Table total does not match: 24:00 vs 16:00.')!)).toBe('2.1 Hours · Page 3')
    expect(fundort(nachId.get('Finding F-03')!)).toBe('Page 3')
    expect(fundort(nachId.get('Finding P-01')!)).toBe('')
    expect(fundort({ spalten: ['', '', '', '', 'Table 2', ''] })).toBe('Table 2')
  })
})

/**
 * Unter „Chapter / Section" stand bis 11/2026 der Ort — nie ein Kapitel: in
 * einem Probe-Export 27 von 36 Zeilen leer, der Rest „docProps/core.xml",
 * „word/settings.xml" oder „Section 1, header1.xml (default)" (Audit
 * 11/2026, Nachtrag TXT#1).
 */
describe('Kapitel unter „Chapter / Section", die Stelle darin unter „Paragraph / Line" (Audit 11/2026, Nachtrag TXT#1)', () => {
  it('Spalten aus der Fundstelle', () => {
    const d = datenstand(eingabe({
      befunde: [
        befund('F-01', 'tm', { fundstellen: [{ seite: 'S. 3', kapitel: '2.1 Hours', ort: 'Table row 3, column 2', auszug: 'x' }] }),
        befund('F-02', 'tm', { fundstellen: [{ seite: 'S. 4', kapitel: '3 Fuel', auszug: 'y' }] }),
        befund('F-03', 'tm', { fundstellen: [{ ort: 'Header (header1.xml)', auszug: 'z' }] }),
      ],
    }))
    expect(d.befunde.map((b) => [b.spalten[4], b.spalten[6]])).toEqual([['2.1 Hours', 'Table row 3, column 2'], ['3 Fuel', ''], ['Header (header1.xml)', '']])
    expect(LABELS.columns[4]).toBe('Chapter / Section')
    expect(LABELS.columns[6]).toBe('Paragraph / Line')
  })

  it('Abnahmedateien durch die echten Prüfungen: Kapitel aus der Gliederung, kein Teil der ZIP-Datei', async () => {
    const ohnePdf = { pdfjs: async () => { throw new Error('kein PDF') } }
    const exportieren = async (name: string, daten: Uint8Array) => {
      const g = await dateiLesen({ name, daten }, ohnePdf, {})
      const p = dokumentPruefen({ dokId: 'tm', dokName: name, dateiname: name, roh: g.roh, meta: g.meta }, { formal: true, word: true, rechnen: true })
      return datenstand(eingabe({ dokumente: [dok('tm', 'review', { typ: 'TM', titel: name })], befunde: p.befunde, ampeln: [] }))
    }
    // Rechenprüfung: jede Tabelle, Umrechnung, Wettermeldung im Kapitel, in dem sie steht
    const calc = await exportieren(SBX_CALC_01_NAME, await sbxCalc01())
    const nachPunkt = (d: typeof calc) => d.befunde.map((b) => [b.spalten[16].split(':')[0], b.spalten[4]])
    expect(calc.befunde.length).toBeGreaterThan(5)
    expect(calc.befunde.every((b) => b.spalten[4] && b.spalten[4] !== 'Table')).toBe(true)
    expect(nachPunkt(calc)).toEqual(expect.arrayContaining([['Table total does not match', '1 Course Hours'], ['Weather scenario', '5 Weather Scenarios']]))
    expect(calc.befunde.find((b) => b.spalten[4] === '1 Course Hours')!.spalten[6]).toBe('Table')
    // Word-Prüfung: Textbefunde im Kapitel, Eigenschaften und Kopfzeilen so, wie Word sie nennt
    const word = await exportieren(SBX_WORD_01_NAME, await sbxWord01())
    const spalte = word.befunde.map((b) => b.spalten[4])
    expect(spalte.filter((x) => x === '1 General').length).toBeGreaterThan(5)
    for (const x of spalte) expect(x).not.toMatch(/^(docProps|word)\/|^\w+\.xml|\.xml \(/)
    expect(spalte).toEqual(expect.arrayContaining(['Document properties', 'Document settings']))
  })
})
