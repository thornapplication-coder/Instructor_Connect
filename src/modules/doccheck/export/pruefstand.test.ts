import { describe, expect, it } from 'vitest'
import { csvBefunde } from './csv'
import { datenstand, fussText, LABELS } from './datenstand'
import { eingabe } from './beispiel'
import { datenstandAus, hashAbgleich, MAX_BYTES, pruefstandAus, pruefstandDateiLesen, pruefstandLesen, pruefstandText, type Pruefstand } from './pruefstand'

describe('Prüfstand-Datei .doccheck.json (Spez. v1.1 Kap. 12)', () => {
  const d = datenstand(eingabe())
  const p = pruefstandAus(d, 'u-patrick', ['xlsx', 'csv'], '2026-11-01T09:30:00Z')

  it('Schema, Prüfer, Bewertung, Ampeln, Export-Verlauf; KEINE Dokumentinhalte', () => {
    expect(p.schema).toBe('doccheck/1')
    expect(p.reviewer).toEqual({ userId: 'u-patrick', name: 'Alex Beispiel', function: 'Head of Training' })
    expect(p.assessment).toEqual({ overall: 'not_ready', top5: d.top5, confirmedBy: '', confirmedAt: '' })
    expect(p.formalChecks).toContainEqual({ document: 'Training Manual CL30', group: 'Formal check', check: 'LEP', status: 'yellow' })
    expect(p.exports).toEqual([{ exportId: 'DC-2026-11-01-0007', formats: ['xlsx', 'csv'], ts: '2026-11-01T09:30:00Z' }])
    expect(p.documents[0]).toMatchObject({ id: 'tm', role: 'review', docType: 'TM', pages: 42 })
    expect(Object.keys(p.documents[0])).not.toContain('text')
    // Seite bewusst geändert: vorher „S. 3" im englischen Prüfstand (Audit 11/2026, EXP-07/TXT-01)
    expect(p.findings[0]).toMatchObject({ id: 'TM-001', docId: 'tm', priority: 'High', category: 'Inconsistency', pageLabel: 'Page 3' })
    // Was wirklich lief — nicht die feste Liste aller Prüfungen (EXP-01/DC-12)
    expect(p.settings.checks).toEqual(d.pruefungen)
    expect(p.settings.checks).toEqual([LABELS.checks.formal, LABELS.checks.word, LABELS.checks.paket])
  })

  it('Roundtrip: speichern → laden → derselbe Datenstand (neue Export-ID), CSV identisch', () => {
    const geladen = pruefstandLesen(pruefstandText(p))
    expect(typeof geladen).toBe('object')
    const d2 = datenstandAus(geladen as Pruefstand, '2026-11-02T08:00:00Z', 1, '1.22.0')
    expect(d2.exportId).toBe('DC-2026-11-02-0001')
    expect(d2.befunde.map((b) => b.spalten)).toEqual(d.befunde.map((b) => b.spalten))
    expect([d2.zaehlung, d2.zuPruefen, d2.top5, d2.gesamt, d2.ampeln]).toEqual([d.zaehlung, d.zuPruefen, d.top5, d.gesamt, d.ampeln])
    // Hauptdokument und Zahl der weiteren kommen aus den Dokumenten der Datei (EXP-08)
    expect(d2.dateiStamm).toBe('2026-11-02_Review_TM-CL30-plus-1_Rev0.1')
    expect([d2.haupt, fussText(d2).replace(d2.exportId, '')]).toEqual([d.haupt, fussText(d).replace(d.exportId, '')])
    expect(csvBefunde(d2)).toBe(csvBefunde(d))
    // „Checks performed" übersteht den Weg über die Datei (EXP-01/DC-12)
    expect(d2.pruefungen).toEqual(d.pruefungen)
    // „Nicht bewertbar" übersteht den Weg über die Datei (Audit 11/2026, DC-03)
    const scan = pruefstandAus(datenstand(eingabe({ befunde: [], lesestand: { ocrSeiten: 2, ohneText: 1 } })), 'u', ['xlsx'], '2026-11-01T09:30:00Z')
    expect(scan.assessment.overall).toBe('not_assessable')
    expect(datenstandAus(pruefstandLesen(pruefstandText(scan)) as Pruefstand, '2026-11-02T08:00:00Z', 1, '1.22.0').gesamt).toBe('notAssessable')
    // BOM wird toleriert
    const mitBom = pruefstandLesen(`﻿${pruefstandText({ ...p, assessment: { ...p.assessment, top5: ['TM-001'] } })}`) as Pruefstand
    expect(datenstandAus(mitBom, '2026-11-02', 1, '1.22.0').top5).toEqual(['TM-001'])
  })

  it('wird abgewiesen statt geraten: kein JSON, fremdes oder neueres Schema, fehlende Felder, falsche Werte, zu groß', () => {
    const t = (x: unknown) => pruefstandLesen(JSON.stringify(x))
    expect(pruefstandLesen('{kaputt')).toBe('DC-STATE-JSON')
    expect(t(null)).toBe('DC-STATE-FORMAT')
    expect(t({ schema: 'anderes/1' })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, schema: 'doccheck/2' })).toBe('DC-STATE-VERSION')
    expect(t({ ...p, findings: undefined })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, findings: [{ ...p.findings[0], priority: 'Critical' }] })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, findings: [{ ...p.findings[0], description: 42 }] })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, findings: [null] })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, documents: [{ ...p.documents[0], role: 'admin' }] })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, formalChecks: [{ check: 'x', status: 'purple' }] })).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, assessment: { ...p.assessment, overall: 'great' } })).toBe('DC-STATE-FORMAT')
    expect(pruefstandLesen(' '.repeat(MAX_BYTES + 1))).toBe('DC-STATE-SIZE')
  })

  it('prüft das GANZE Interface: unvollständig oder falscher Typ → DC-STATE-FORMAT, kein Modulabsturz (Audit 11/2026, SEC-03)', () => {
    const t = (x: unknown) => pruefstandLesen(JSON.stringify(x))
    const ohne = (k: string) => Object.fromEntries(Object.entries(p).filter(([x]) => x !== k))
    // Die drei Dateien des Prüfers: „geöffnet" im Toast, daneben die Fehlerseite DC-LOAD
    expect(t({ schema: 'doccheck/1', documents: [], findings: [], assessment: { overall: 'ready', top5: [] }, formalChecks: [] })).toBe('DC-STATE-FORMAT')
    expect(t(ohne('reviewer'))).toBe('DC-STATE-FORMAT')
    expect(t({ ...p, documents: [{ ...p.documents[0], title: { a: 1 } }] })).toBe('DC-STATE-FORMAT')
    // Jedes Feld der obersten Ebene ist Pflicht
    for (const k of Object.keys(p)) expect(t(ohne(k)), k).toBe('DC-STATE-FORMAT')
    const falsch: [string, unknown][] = [
      ['app', { version: 1, exportLayout: '1.0' }],
      ['app', 'x'],
      ['library', {}],
      ['createdAt', 'gestern'],
      ['updatedAt', 42],
      ['organisation', null],
      ['reviewType', 'x'],
      ['reviewer', { userId: 'u', name: 'n' }],
      ['settings', { checks: 'Formal check', model: '', language: 'en' }],
      ['settings', { checks: [1], model: '', language: 'en' }],
      ['settings', { checks: [], model: '', language: 'de' }],
      ['assessment', { ...p.assessment, top5: [1] }],
      ['assessment', { ...p.assessment, top5: ['GIBT-ES-NICHT'] }],
      ['assessment', { ...p.assessment, confirmedBy: null }],
      ['formalChecks', [{ check: 'x', status: 'green' }]],
      ['exports', {}],
      ['exports', [{ exportId: 'x', formats: 'xlsx', ts: '' }]],
    ]
    for (const [k, v] of falsch) expect(t({ ...p, [k]: v }), `${k}: ${JSON.stringify(v)}`).toBe('DC-STATE-FORMAT')
    for (const feld of ['fileName', 'docType', 'title', 'docNumber', 'revision', 'date', 'rank'])
      expect(t({ ...p, documents: [{ ...p.documents[0], [feld]: 1 }] }), feld).toBe('DC-STATE-FORMAT')
    for (const seiten of [-1, 1.5, '3', null]) expect(t({ ...p, documents: [{ ...p.documents[0], pages: seiten }] })).toBe('DC-STATE-FORMAT')
    expect(t([])).toBe('DC-STATE-FORMAT')
    // Zwei Befunde mit derselben ID
    expect(t({ ...p, findings: [p.findings[0], { ...p.findings[1], id: p.findings[0].id }] })).toBe('DC-STATE-FORMAT')
    // Was ein Export schreibt, besteht — auch mit Ortsversatz im Zeitstempel (EXM-01)
    expect(typeof t({ ...p, createdAt: '2026-11-02T00:30:00+01:00', updatedAt: '2026-11-02T00:30:00.000Z' })).toBe('object')
  })

  it('jede akzeptierte Datei lässt sich exportieren: datenstandAus und CSV laufen durch', () => {
    const faelle = [p, { ...p, findings: [], assessment: { ...p.assessment, top5: [] } }, { ...p, documents: [], formalChecks: [], exports: [] }]
    for (const x of faelle) {
      const geladen = pruefstandLesen(JSON.stringify(x))
      expect(typeof geladen).toBe('object')
      expect(() => csvBefunde(datenstandAus(geladen as Pruefstand, '2026-11-02T08:00:00Z', 1, '1.22.0'))).not.toThrow()
    }
  })

  it('Größe VOR dem Einlesen: eine zu große Datei wird nicht erst ganz gelesen (SEC-03)', async () => {
    const wirft = () => Promise.reject(new Error('darf nicht gelesen werden'))
    expect(await pruefstandDateiLesen({ size: MAX_BYTES + 1, text: wirft })).toBe('DC-STATE-SIZE')
    // Lesefehler des Browsers: wie eine unlesbare Datei, kein unbehandelter Fehler
    expect(await pruefstandDateiLesen({ size: 10, text: wirft })).toBe('DC-STATE-JSON')
    expect(await pruefstandDateiLesen({ size: 10, text: async () => pruefstandText(p) })).toEqual(pruefstandLesen(pruefstandText(p)))
  })

  it('geladene Datei mit Steuerzeichen und alten Seitenangaben: Export daraus sauber und englisch (SEC-04, EXP-07)', () => {
    // JSON darf „\u0002" tragen — beim Einfrieren fällt es weg wie beim frischen Stand
    const alt = { ...p, organisation: 'Example\u0002 ATO', findings: [{ ...p.findings[0], description: 'Bullet\u0002text', pageLabel: 'ca. 1' }, { ...p.findings[1], pageLabel: 'S. 2 (±1)' }], assessment: { ...p.assessment, top5: [p.findings[0].id] } }
    const d2 = datenstandAus(pruefstandLesen(JSON.stringify(alt)) as Pruefstand, '2026-11-02T08:00:00Z', 1, '1.22.0')
    expect(d2.organisation).toBe('Example ATO')
    expect(d2.befunde[0].spalten[16]).toBe('Bullettext')
    // Ältere Prüfstände trugen „S." und „ca." — der Export daraus ist englisch
    expect(d2.befunde.slice(0, 2).map((b) => [b.spalten[5], b.seiteNr])).toEqual([['approx. page 1', 1], ['Page 2 (±1)', 2]])
    expect(csvBefunde(d2)).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/)
  })

  it('älterer Prüfstand mit „Lib 3 · 28.10.2026": der Export daraus nennt den Bibliotheksstand ISO (Audit 11/2026, EXP-16/TXT-15)', () => {
    const alt = pruefstandLesen(JSON.stringify({ ...p, library: { label: 'Lib 3 · 28.10.2026' } })) as Pruefstand
    const d2 = datenstandAus(alt, '2026-11-02T08:00:00+01:00', 1, '1.22.0')
    expect(d2.bibliothek).toBe('Lib 3 · 2026-10-28')
    expect(pruefstandAus(d2, 'u', ['json'], '2026-11-02T08:00:00+01:00', alt).library.label).toBe('Lib 3 · 2026-10-28')
  })

  it('Export aus geladenem Prüfstand erhält dessen Herkunft: Prüfer, Anlagedatum, Bestätigung, Verlauf (Audit 11/2026, EXP-15)', () => {
    // Vorher: reviewer.userId des Exportierenden neben dem Namen des Prüfers, createdAt = Exportzeit,
    // exports durch einen Eintrag ersetzt, im Bericht die App-Version aus der Datei
    const vonA = { ...pruefstandAus(d, 'u-patrick', ['xlsx'], '2026-11-01T09:30:00+01:00'), assessment: { ...p.assessment, confirmedBy: 'u-patrick', confirmedAt: '2026-11-01T10:00:00+01:00' } }
    const geladen = pruefstandLesen(pruefstandText(vonA)) as Pruefstand
    const d2 = datenstandAus(geladen, '2026-11-03T08:00:00+01:00', 4, '1.23.0')
    // Diese App erzeugt den Export: ihre Version im Bericht, nicht die der Datei
    expect(d2.appVersion).toBe('1.23.0')
    const vonB = pruefstandAus(d2, 'u-christian', ['xlsx', 'json'], '2026-11-03T08:00:00+01:00', geladen)
    expect(vonB.reviewer).toEqual({ userId: 'u-patrick', name: 'Alex Beispiel', function: 'Head of Training' })
    expect(vonB.createdAt).toBe('2026-11-01T09:30:00+01:00')
    expect(vonB.updatedAt).toBe('2026-11-03T08:00:00+01:00')
    expect(vonB.assessment).toMatchObject({ confirmedBy: 'u-patrick', confirmedAt: '2026-11-01T10:00:00+01:00' })
    expect(vonB.exports).toEqual([...geladen.exports, { exportId: 'DC-2026-11-03-0004', formats: ['xlsx', 'json'], ts: '2026-11-03T08:00:00+01:00' }])
    expect(vonB.exports).toHaveLength(geladen.exports.length + 1)
    expect(vonB.app).toEqual({ version: '1.23.0', exportLayout: d2.layout, sourceAppVersion: '1.22.0' })
    // Inhalte unverändert
    expect([vonB.documents, vonB.findings, vonB.formalChecks, vonB.settings]).toEqual([geladen.documents, geladen.findings, geladen.formalChecks, geladen.settings])
    // Die neue Datei lädt wieder; die Ursprungsversion bleibt über weitere Exporte die erste
    const nochmal = pruefstandLesen(pruefstandText(vonB)) as Pruefstand
    expect(typeof nochmal).toBe('object')
    const vonC = pruefstandAus(datenstandAus(nochmal, '2026-11-04T08:00:00+01:00', 1, '1.24.0'), 'u-dritte', ['csv'], '2026-11-04T08:00:00+01:00', nochmal)
    expect([vonC.app.version, vonC.app.sourceAppVersion, vonC.reviewer.userId, vonC.exports.length]).toEqual(['1.24.0', '1.22.0', 'u-patrick', 3])
    // Ein neuer Stand trägt keine Ursprungsversion; eine falsch getypte wird abgewiesen
    expect(p.app).not.toHaveProperty('sourceAppVersion')
    expect(pruefstandLesen(JSON.stringify({ ...vonB, app: { ...vonB.app, sourceAppVersion: 1 } }))).toBe('DC-STATE-FORMAT')
    // Steuerzeichen im Prüfernamen der Datei fallen weg wie im Bericht (SEC-04)
    const schmutzig = { ...geladen, reviewer: { ...geladen.reviewer, name: 'Alex\u0002 Beispiel' } }
    expect(pruefstandAus(datenstandAus(schmutzig, '2026-11-03', 1, '1'), 'u', [], '2026-11-03', schmutzig).reviewer.name).toBe('Alex Beispiel')
  })

  it('Hash-Abgleich: wiedergeladen nur bei gleichem Hash, nicht bei gleichem Namen', () => {
    expect(hashAbgleich(p, [{ sha256: p.documents[0].sha256 }, { sha256: 'anders' }])).toEqual([
      { id: 'tm', titel: 'Training Manual CL30', da: true },
      { id: 'apx', titel: 'Appendix 4 – Line Training', da: false },
      { id: 'ear', titel: 'Part-ORA extract', da: false },
    ])
  })
})
