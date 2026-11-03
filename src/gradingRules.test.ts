import { describe, expect, it } from 'vitest'
import { druckTitel } from './dateiName'
import {
  autoNotCompetent,
  behoerdeFuer,
  codeVergeben,
  bezeichnungen,
  dokumentStand,
  druckTitelTeile,
  einfrieren,
  empfaengerVon,
  followUpStarted,
  formularTypInGebrauch,
  ganzzahligNichtNegativ,
  gleichePaare,
  gradeColor,
  gradingDayKey,
  gradingListComparator,
  gradingListDate,
  hasEvidence,
  isComplete,
  isFollowUpType,
  isNotCompetent,
  istInstruktorBlatt,
  istUnterschrift,
  kopfHinweise,
  missingFollowUps,
  overallNachNote,
  personenKurz,
  personenSuche,
  personenZeile,
  teilnehmerOf,
  trafficLight,
  traineesOf,
} from './gradingRules'
import { GRADING_DEFAULTS } from './sandbox/gradingDefaults'
import type { GradingRecord, TraineeGrading } from './types'

/**
 * Diese Tests bewachen Regeln, die in den Audits schon einmal falsch waren.
 * Jeder Block nennt den Befund, den er künftig verhindern soll — wer eine
 * Regel ändert, sieht damit sofort, welche Zusage er gerade aufgibt.
 */

const trainee = (over: TraineeGrading['overall'], name = 'Sophie Berger'): TraineeGrading => ({
  traineeId: '',
  traineeName: name,
  position: 'CDR',
  grades: [],
  positiveComment: '',
  developmentComment: '',
  summaryComment: '',
  overall: over,
})

/** Vollständiger, sauber belegter Nachweis — die Basis, von der die Tests abweichen. */
const rec = (over: Partial<GradingRecord> = {}): GradingRecord => ({
  id: 'r1',
  formTypeId: '308A',
  instructorId: 'u1',
  header: { date: '2026-08-05' },
  trainees: [trainee('competent')],
  sessionStatus: 'completed',
  freeText: {},
  signatureInstructor: 'data:image/png;base64,AAA',
  signatureTrainee: 'data:image/png;base64,BBB',
  status: 'signed',
  mailStatus: 'sent',
  createdAt: Date.UTC(2026, 7, 5),
  signedAt: Date.UTC(2026, 7, 5, 13, 6),
  ...over,
})

describe('missingFollowUps', () => {
  it('verlangt ein 306, sobald ein Pilot nicht bestanden hat (#22)', () => {
    const r = rec({ trainees: [trainee('not_competent')] })
    expect(missingFollowUps(r, [r])).toContain('306')
  })

  it('verlangt ein 310, wenn die Session nicht abgeschlossen wurde', () => {
    const r = rec({ sessionStatus: 'not_completed' })
    expect(missingFollowUps(r, [r])).toContain('310')
  })

  it('ist erfüllt, sobald das Folgeformular UNTERSCHRIEBEN vorliegt', () => {
    const parent = rec({ trainees: [trainee('not_competent')] })
    const child = rec({ id: 'c1', formTypeId: '306', parentId: 'r1', status: 'signed' })
    expect(missingFollowUps(parent, [parent, child])).not.toContain('306')
  })

  it('lässt ein angelegtes, aber NICHT unterschriebenes 306 nicht als Nachweis gelten', () => {
    const parent = rec({ trainees: [trainee('not_competent')] })
    const draft = rec({ id: 'c1', formTypeId: '306', parentId: 'r1', status: 'awaiting_signature' })
    expect(missingFollowUps(parent, [parent, draft])).toContain('306')
    // ... es wartet aber sichtbar auf die Unterschrift, statt zu fehlen
    expect(followUpStarted(parent, [parent, draft], '306')).toBe(true)
  })

  /**
   * Der Name im 306 ist ein frei ueberschreibbares Textfeld. Ein 306, das
   * Pilot B nennt, hakte damit die Pflicht des Blattes von Pilot A ab —
   * dieselbe Luecke, wegen der Befund #24 das 310 vom Durchgang auf das
   * Einzelblatt umgestellt hat, nur inhaltlich statt strukturell.
   */
  it('laesst ein 306 nicht gelten, das einen ANDEREN Piloten nennt', () => {
    const parent = rec({ trainees: [trainee('not_competent', 'Sophie Berger')] })
    const fremd = rec({ id: 'c1', formTypeId: '306', parentId: 'r1', status: 'signed', header: { traineeName: 'Lukas Steiner' } })
    expect(missingFollowUps(parent, [parent, fremd])).toContain('306')
  })

  it('nimmt ein 306 ohne Namen an — Altbestand vor dem Pflichtfeld', () => {
    // Sonst meldete die App rueckwirkend Luecken, die es nie gab.
    const parent = rec({ trainees: [trainee('not_competent')] })
    const alt = rec({ id: 'c1', formTypeId: '306', parentId: 'r1', status: 'signed' })
    expect(missingFollowUps(parent, [parent, alt])).not.toContain('306')
  })

  it('verlangt EIN 306 je nicht bestandenem Piloten, nicht eines je Blatt (#22)', () => {
    // Neuanlagen werden je Pilot geteilt; Bestands- und Importblaetter nicht.
    // Ein einziges 306 machte ein Blatt mit zwei Durchgefallenen gruen.
    const parent = rec({ trainees: [trainee('not_competent', 'Sophie Berger'), trainee('not_competent', 'Lukas Steiner')] })
    const eines = rec({ id: 'c1', formTypeId: '306', parentId: 'r1', status: 'signed', header: { traineeName: 'Sophie Berger' } })
    expect(missingFollowUps(parent, [parent, eines])).toContain('306')
    const zweites = rec({ id: 'c2', formTypeId: '306', parentId: 'r1', status: 'signed', header: { traineeName: 'Lukas Steiner' } })
    expect(missingFollowUps(parent, [parent, eines, zweites])).not.toContain('306')
  })

  it('schliesst die parentId-Luecke: ein fremdes Blatt mit erfundenem parentId hebt die Pflicht nicht auf (#50)', () => {
    const parent = rec({ trainees: [trainee('not_competent')] })
    // Ein ueber die Adresszeile angelegtes 308A, das sich als Kind ausgibt.
    const impostor = rec({ id: 'x1', formTypeId: '308A', parentId: 'r1', status: 'signed' })
    expect(missingFollowUps(parent, [parent, impostor])).toContain('306')
  })

  /**
   * ERWARTUNG GEAENDERT (vorher: „das 310 gilt fuer den ganzen Durchgang").
   * Mit Befund #24 hat das Formular 310 ein PFLICHTFELD „Pilot / Student
   * Name" bekommen. Seither kann ein 310, das Pilot A nennt, unmoeglich der
   * Nachweis fuer Pilot B sein — es hakte dessen offene Punkte ab, ohne ihn
   * je zu erwaehnen. 306 und 310 haengen deshalb beide an genau EINEM Blatt.
   */
  it('bindet 306 UND 310 an genau ein Blatt — je Pilot ein eigener Nachweis', () => {
    const a = rec({ id: 'a', batchId: 'b1', trainees: [trainee('not_competent', 'A')], sessionStatus: 'not_completed' })
    const b = rec({ id: 'b', batchId: 'b1', trainees: [trainee('not_competent', 'B')], sessionStatus: 'not_completed' })
    const deferred = rec({ id: 'd', formTypeId: '310', parentId: 'a', status: 'signed' })
    const add306 = rec({ id: 'e', formTypeId: '306', parentId: 'a', status: 'signed' })
    const alle = [a, b, deferred, add306]
    // Blatt a ist versorgt ...
    expect(missingFollowUps(a, alle)).toEqual([])
    // ... Blatt b dagegen nicht: es braucht beides selbst.
    expect(missingFollowUps(b, alle).sort()).toEqual(['306', '310'])
  })

  it('fordert von einem Folgeformular selbst kein weiteres Folgeformular', () => {
    const child = rec({ formTypeId: '306', trainees: [trainee('not_competent')], sessionStatus: 'not_completed' })
    expect(missingFollowUps(child, [child])).toEqual([])
    expect(isFollowUpType('306')).toBe(true)
    expect(isFollowUpType('308A')).toBe(false)
  })
})

/**
 * Die Automatik (eine „1" oder zwei „2" ⇒ Not Competent) stand nur im
 * Formular. Die Pflichtkette las danach ausschliesslich `overall` — ein
 * Datensatz mit zwei Zweien und `overall: 'competent'` kam ohne 306 durch
 * und zeigte gruen. Genau so lagen die Demo-Sessions im Bestand.
 */
describe('autoNotCompetent / isNotCompetent — die Automatik gilt auch nachtraeglich', () => {
  const mitNoten = (noten: (1 | 2 | 3 | 4 | 5 | 'NO')[], overall: TraineeGrading['overall'] = 'competent'): TraineeGrading => ({
    ...trainee(overall),
    grades: noten.map((grade, i) => ({ code: `C${i}`, grade, comment: '' })),
  })

  it('eine einzelne 1 genuegt', () => {
    expect(autoNotCompetent(mitNoten([1, 3, 3]))).toBe(true)
  })

  it('zwei Zweien genuegen', () => {
    expect(autoNotCompetent(mitNoten([2, 2, 3]))).toBe(true)
  })

  it('eine einzelne 2 genuegt NICHT — ein schlechter Tag ist kein Befund', () => {
    expect(autoNotCompetent(mitNoten([2, 3, 3]))).toBe(false)
  })

  it('erklaertes Not Competent zaehlt auch ohne auffaellige Noten', () => {
    expect(isNotCompetent(mitNoten([3, 3, 3], 'not_competent'))).toBe(true)
  })

  it('verlangt ein 306 auch dann, wenn overall faelschlich auf competent steht', () => {
    const r = rec({ trainees: [mitNoten([2, 2, 3])] })
    expect(missingFollowUps(r, [r])).toContain('306')
  })

  it('verlangt kein 306 bei sauberen Noten', () => {
    const r = rec({ trainees: [mitNoten([3, 4, 3])] })
    expect(missingFollowUps(r, [r])).toEqual([])
  })
})

describe('hasEvidence — Ampel prueft Unterschrift UND Beleg (#46)', () => {
  it('erkennt einen vollstaendigen Nachweis', () => {
    expect(hasEvidence(rec())).toBe(true)
  })

  it('verweigert den Beleg ohne Instruktorunterschrift', () => {
    expect(hasEvidence(rec({ signatureInstructor: null }))).toBe(false)
  })

  it('verweigert den Beleg ohne Unterschriftszeitpunkt', () => {
    expect(hasEvidence(rec({ signedAt: undefined }))).toBe(false)
  })

  it('verweigert den Beleg ohne Gegenzeichnung des Piloten', () => {
    expect(hasEvidence(rec({ signatureTrainee: null }))).toBe(false)
  })

  it('laesst Anwesenheitslisten ohne Pilotenunterschrift zu — aber nicht ohne Anwesende', () => {
    const withPeople = rec({ signatureTrainee: null, attendance: [{ name: 'Sophie Berger', signature: null }] })
    const empty = rec({ signatureTrainee: null, attendance: [{ name: '   ', signature: null }] })
    expect(hasEvidence(withPeople)).toBe(true)
    expect(hasEvidence(empty)).toBe(false)
  })
})

describe('trafficLight', () => {
  it('rot bei fehlgeschlagenem Versand — schlaegt alles andere', () => {
    expect(trafficLight(rec({ mailStatus: 'failed' }))).toBe('red')
  })

  it('gelb, solange ein Pflicht-Folgeformular fehlt', () => {
    const r = rec({ trainees: [trainee('not_competent')] })
    expect(trafficLight(r, [r])).toBe('yellow')
  })

  it('gelb, solange der Versand aussteht', () => {
    expect(trafficLight(rec({ mailStatus: 'queued' }))).toBe('yellow')
  })

  it('gruen nur bei unterschrieben, versendet UND belegt', () => {
    expect(trafficLight(rec())).toBe('green')
    // Ohne Beleg bleibt es gelb, auch wenn Status und Mail „fertig" sagen (#46).
    expect(trafficLight(rec({ signatureTrainee: null }))).toBe('yellow')
  })

  it('isComplete ist genau das gruene Licht', () => {
    const done = rec()
    const open = rec({ mailStatus: 'queued' })
    expect(isComplete(done, [done])).toBe(true)
    expect(isComplete(open, [open])).toBe(false)
  })
})

describe('gradingListComparator', () => {
  it('sortiert nach Schulungsdatum absteigend, dann rot vor gelb vor gruen', () => {
    const alt = rec({ id: 'alt', header: { date: '2026-08-01' } })
    const neuGruen = rec({ id: 'gruen', header: { date: '2026-08-05' } })
    const neuGelb = rec({ id: 'gelb', header: { date: '2026-08-05' }, mailStatus: 'queued' })
    const neuRot = rec({ id: 'rot', header: { date: '2026-08-05' }, mailStatus: 'failed' })
    const all = [alt, neuGruen, neuGelb, neuRot]
    const sorted = [...all].sort(gradingListComparator(all)).map((r) => r.id)
    expect(sorted).toEqual(['rot', 'gelb', 'gruen', 'alt'])
  })

  it('faellt ohne Kopfdatum auf den Erfassungszeitpunkt zurueck', () => {
    const mitDatum = rec({ id: 'mit', header: { date: '2026-08-05' } })
    const ohneDatum = rec({ id: 'ohne', header: {}, createdAt: Date.UTC(2026, 7, 9) })
    const all = [mitDatum, ohneDatum]
    expect([...all].sort(gradingListComparator(all))[0].id).toBe('ohne')
  })
})

describe('traineesOf', () => {
  it('nimmt die eigenen Piloten, wenn vorhanden', () => {
    expect(traineesOf(rec(), []).map((t) => t.traineeName)).toEqual(['Sophie Berger'])
  })

  it('nennt bei Folgeformularen den Piloten aus den Kopfdaten (#24)', () => {
    const child = rec({ formTypeId: '306', trainees: [], header: { traineeName: 'Max Payne' } })
    expect(traineesOf(child, [child]).map((t) => t.traineeName)).toEqual(['Max Payne'])
  })

  it('erbt den Piloten vom Ausgangsformular, wenn das Folgeformular keinen fuehrt', () => {
    const parent = rec({ id: 'p1' })
    const child = rec({ id: 'c1', formTypeId: '306', trainees: [], header: {}, parentId: 'p1' })
    expect(traineesOf(child, [parent, child]).map((t) => t.traineeName)).toEqual(['Sophie Berger'])
  })
})

describe('followUpStarted — Reichweite wie bei der Pflichtpruefung', () => {
  /** ERWARTUNG GEAENDERT, gleiche Begruendung wie oben: das 310 nennt seit
   *  #24 genau einen Piloten und deckt deshalb nur sein eigenes Blatt ab. */
  it('meldet ein angefangenes Folgeformular nur am eigenen Blatt', () => {
    const a = rec({ id: 'a', batchId: 'b1', sessionStatus: 'not_completed' })
    const b = rec({ id: 'b', batchId: 'b1', sessionStatus: 'not_completed' })
    const entwurf = rec({ id: 'd', formTypeId: '310', parentId: 'a', status: 'awaiting_signature' })
    expect(followUpStarted(a, [a, b, entwurf], '310')).toBe(true)
    expect(followUpStarted(b, [a, b, entwurf], '310')).toBe(false)
    const draft306 = rec({ id: 'e', formTypeId: '306', parentId: 'a', status: 'awaiting_signature' })
    expect(followUpStarted(b, [a, b, draft306], '306')).toBe(false)
    expect(followUpStarted(a, [a, b, draft306], '306')).toBe(true)
  })

  it('meldet nichts, wenn gar kein Folgeformular angefangen wurde', () => {
    const r = rec()
    expect(followUpStarted(r, [r], '306')).toBe(false)
  })
})

describe('traineesOf — Rueckfall ins Leere', () => {
  it('liefert eine leere Liste, wenn weder eigene Piloten noch ein auffindbares Elternblatt da sind', () => {
    const waise = rec({ formTypeId: '306', trainees: [], header: {}, parentId: 'gibt-es-nicht' })
    expect(traineesOf(waise, [waise])).toEqual([])
  })

  it('liefert eine leere Liste, wenn das Folgeformular gar kein Elternblatt nennt', () => {
    const ohne = rec({ formTypeId: '306', trainees: [], header: {} })
    expect(traineesOf(ohne, [ohne])).toEqual([])
  })
})

/**
 * Die Liste sortierte nach dem SCHULUNGSTAG (#51), zeigte in der Zeile aber
 * `createdAt` — zwei verschiedene Daten für dieselbe Zeile. Seit die Liste
 * nach Tagen gruppiert ist, muss beides dieselbe Quelle haben.
 */
describe('gradingListDate / gradingDayKey — der Schulungstag zaehlt', () => {
  it('nimmt den Schulungstag aus dem Kopf, nicht den Anlagezeitpunkt', () => {
    const r = rec({ header: { date: '2026-08-05' }, createdAt: Date.UTC(2026, 7, 9) })
    expect(gradingDayKey(r)).toBe('2026-08-05')
  })

  it('faellt auf den Anlagezeitpunkt zurueck, wenn kein Datum im Kopf steht', () => {
    const r = rec({ header: {}, createdAt: new Date(2026, 7, 9, 12).getTime() })
    expect(gradingDayKey(r)).toBe('2026-08-09')
  })

  it('faellt auch bei unlesbarem Datum zurueck, statt NaN zu liefern', () => {
    const r = rec({ header: { date: 'kein Datum' }, createdAt: new Date(2026, 7, 9, 12).getTime() })
    expect(gradingDayKey(r)).toBe('2026-08-09')
    expect(Number.isNaN(gradingListDate(r))).toBe(false)
  })

  it('gibt Blaettern desselben Tages denselben Schluessel — auch bei anderem createdAt', () => {
    const a = rec({ id: 'a', header: { date: '2026-08-05' }, createdAt: Date.UTC(2026, 7, 5) })
    const b = rec({ id: 'b', header: { date: '2026-08-05' }, createdAt: Date.UTC(2026, 7, 9) })
    expect(gradingDayKey(a)).toBe(gradingDayKey(b))
  })
})

/**
 * Audit 11/2026, MOB-01: Im Querformat verschwand der Strich, gespeichert
 * wurde ein transparentes PNG — und weil nur die Truthiness zaehlte, ging der
 * Nachweis mit LEERER Instruktorunterschrift als „signed" durch. Dass ein
 * Bild Tinte traegt, prueft die Zeichenflaeche (signaturBild.test.ts); hier
 * faellt durch, was gar kein Bild ist.
 */
describe('istUnterschrift — eine leere data-URL ist keine Unterschrift', () => {
  it('nimmt ein Bild mit Inhalt', () => {
    expect(istUnterschrift('data:image/png;base64,iVBORw0KGgo')).toBe(true)
    expect(istUnterschrift('data:image/svg+xml;base64,PHN2Zz4=')).toBe(true)
  })

  it('verwirft leer, null und das, was ein Canvas ohne Flaeche liefert', () => {
    expect(istUnterschrift(null)).toBe(false)
    expect(istUnterschrift(undefined)).toBe(false)
    expect(istUnterschrift('')).toBe(false)
    expect(istUnterschrift('data:,')).toBe(false)
    expect(istUnterschrift('data:image/png;base64,')).toBe(false)
  })

  it('verwirft, was gar kein Bild ist', () => {
    expect(istUnterschrift('Sophie Berger')).toBe(false)
    expect(istUnterschrift('data:text/plain,signed')).toBe(false)
  })

  it('die Ampel zaehlt eine leere data-URL nicht als Beleg', () => {
    expect(hasEvidence(rec({ signatureInstructor: 'data:,' }))).toBe(false)
    expect(hasEvidence(rec({ signatureTrainee: 'data:image/png;base64,' }))).toBe(false)
    expect(trafficLight(rec({ signatureInstructor: 'data:,' }))).toBe('yellow')
  })
})

/**
 * Audit 11/2026, GRD-03: 306/310/307A/307B froren den Dokumentenstand nicht
 * ein; die Anzeige las ihn spaeter aus den Einstellungen. Eine geaenderte
 * Zulassungsnummer stand damit auf einem laengst unterschriebenen Nachweis.
 */
describe('dokumentStand', () => {
  const kopf = { atoName: 'Aviation Academy Austria', approvalNumber: 'AT.ATO.106', approvalNumberUK: 'GBR.ATO.0541', formRevision: 'Rev. 0.2' }

  it('nimmt bei UK die UK-Zulassung', () => {
    expect(dokumentStand(kopf, 'UK', 'Additional Training')).toEqual({
      atoName: 'Aviation Academy Austria',
      approval: 'GBR.ATO.0541',
      formRevision: 'Rev. 0.2',
      formTitle: 'Additional Training',
    })
  })

  it('nimmt bei AT die oesterreichische', () => {
    expect(dokumentStand(kopf, 'AT', 'X').approval).toBe('AT.ATO.106')
  })

  it('faellt ohne UK-Nummer auf die oesterreichische zurueck — wie die Anzeige', () => {
    expect(dokumentStand({ ...kopf, approvalNumberUK: '' }, 'UK', 'X').approval).toBe('AT.ATO.106')
    expect(dokumentStand({ ...kopf, approvalNumberUK: undefined }, 'UK', 'X').approval).toBe('AT.ATO.106')
  })

  it('kommt ohne Dokumentkopf in den Einstellungen aus (Altbestand)', () => {
    expect(dokumentStand(undefined, 'AT', 'Attendance')).toEqual({ atoName: '', approval: '', formRevision: '', formTitle: 'Attendance' })
  })
})

/**
 * Audit 11/2026, GTY-06: Die Empfaengerzeile wurde zur ANZEIGEZEIT aus den
 * Einstellungen berechnet — und stand zweimal, verschieden: Das Formular
 * kannte die Eskalation bei 306 nicht. Jetzt EINE Regel, deren Ergebnis beim
 * Absenden gespeichert wird.
 */
describe('empfaengerVon — je Formulartyp', () => {
  const grading = {
    defaultRecipients: ['records@example.test'],
    deferredRecipients: ['ta@example.test'],
    escalationRecipients: ['hot@example.test', 'records@example.test'],
  }

  it('bestanden: nur die Standardempfaenger und die zusaetzlichen', () => {
    expect(empfaengerVon(rec({ extraRecipients: ['ops@example.test'] }), grading)).toEqual(['records@example.test', 'ops@example.test'])
  })

  it('310 geht immer zusaetzlich an den Training Admin', () => {
    expect(empfaengerVon(rec({ formTypeId: '310', trainees: [], sessionStatus: null }), grading)).toEqual(['records@example.test', 'ta@example.test'])
  })

  it('306 eskaliert immer — das Formular kannte das nicht', () => {
    expect(empfaengerVon(rec({ formTypeId: '306', trainees: [], sessionStatus: null }), grading)).toEqual(['records@example.test', 'hot@example.test'])
  })

  it('Not Competent — erklaert oder rechnerisch — und Session not completed eskalieren', () => {
    expect(empfaengerVon(rec({ trainees: [trainee('not_competent')] }), grading)).toContain('hot@example.test')
    const rechnerisch = { ...trainee('competent'), grades: [{ code: 'KNO', grade: 1 as const, comment: 'x' }] }
    expect(empfaengerVon(rec({ trainees: [rechnerisch] }), grading)).toContain('hot@example.test')
    expect(empfaengerVon(rec({ sessionStatus: 'not_completed' }), grading)).toContain('hot@example.test')
  })

  it('nennt niemanden doppelt', () => {
    const r = rec({ formTypeId: '306', trainees: [], sessionStatus: null, extraRecipients: ['records@example.test', 'hot@example.test'] })
    expect(empfaengerVon(r, grading)).toEqual(['records@example.test', 'hot@example.test'])
  })

  it('307A/307B: Standardempfaenger', () => {
    expect(empfaengerVon(rec({ formTypeId: '307A', trainees: [], sessionStatus: null }), grading)).toEqual(['records@example.test'])
  })
})

/**
 * Audit 11/2026, GRD-04: Das 306/310 einer UK-Session startete mit AT und
 * druckte AT.ATO.106. Ein Folgeformular gehoert zur Zulassung seines
 * Elternblatts.
 */
describe('behoerdeFuer', () => {
  it('ein Folgeformular uebernimmt die Behoerde des Elternblatts', () => {
    expect(behoerdeFuer(undefined, { authority: 'UK' })).toBe('UK')
  })

  it('das Elternblatt geht auch einem gesicherten Entwurf vor', () => {
    expect(behoerdeFuer(undefined, { authority: 'UK' }, 'AT')).toBe('UK')
  })

  it('ein Elternblatt ohne Angabe (Altbestand) gilt als AT', () => {
    expect(behoerdeFuer(undefined, {})).toBe('AT')
  })

  it('ein bestehender Datensatz behaelt seine eigene Angabe', () => {
    expect(behoerdeFuer({ authority: 'AT' }, { authority: 'UK' })).toBe('AT')
    expect(behoerdeFuer({}, { authority: 'UK' })).toBe('AT')
  })

  it('ohne Elternblatt: der Entwurf, sonst AT', () => {
    expect(behoerdeFuer(undefined, undefined, 'UK')).toBe('UK')
    expect(behoerdeFuer(undefined, undefined, 'kaputt')).toBe('AT')
    expect(behoerdeFuer(undefined, undefined)).toBe('AT')
  })
})

describe('gradingDayKey — Ortszeit, nicht UTC (GRD-16)', () => {
  it('ein Blatt ohne Kopfdatum, angelegt um 00:30 in Wien, gehoert zum neuen Tag', () => {
    const vorher = process.env.TZ
    process.env.TZ = 'Europe/Vienna'
    try {
      expect(gradingDayKey(rec({ header: {}, createdAt: Date.UTC(2026, 10, 1, 23, 30) }))).toBe('2026-11-02')
    } finally {
      if (vorher === undefined) delete process.env.TZ
      else process.env.TZ = vorher
    }
  })
})

describe('einfrieren — jeder Formulartyp, nicht nur die Grading Sheets (GRD-03, GTY-06)', () => {
  const kopf = { atoName: 'Aviation Academy Austria', approvalNumber: 'AT.ATO.106', approvalNumberUK: 'GBR.ATO.0541', formRevision: 'Rev. 0.2' }
  const grading = { defaultRecipients: ['records@example.test'], deferredRecipients: ['ta@example.test'], escalationRecipients: ['hot@example.test'] }

  it('ein 306 einer UK-Session traegt GBR.ATO.0541 und die Eskalation', () => {
    const r = einfrieren(rec({ formTypeId: '306', trainees: [], sessionStatus: null, authority: 'UK' }), kopf, 'Additional Training', grading)
    expect(r.docSnapshot).toEqual({ atoName: 'Aviation Academy Austria', approval: 'GBR.ATO.0541', formRevision: 'Rev. 0.2', formTitle: 'Additional Training' })
    expect(r.recipients).toEqual(['records@example.test', 'hot@example.test'])
  })

  it('ein 307A ohne Angabe der Behoerde gilt als AT', () => {
    const r = einfrieren(rec({ formTypeId: '307A', trainees: [], sessionStatus: null, authority: undefined }), kopf, 'Attendance', grading)
    expect(r.docSnapshot?.approval).toBe('AT.ATO.106')
    expect(r.recipients).toEqual(['records@example.test'])
  })

  it('aendert sonst nichts am Datensatz', () => {
    const vorher = rec({ formTypeId: '310', trainees: [], sessionStatus: null })
    const { docSnapshot: _d, recipients: _r, ...rest } = einfrieren(vorher, kopf, 'Deferred Item', grading)
    expect(rest).toEqual(vorher)
  })
})

/**
 * Audit 11/2026, GRD-08: Die Automatik setzte „Not Competent", nahm es aber
 * nie zurueck. Nach einem Tippfehler (1 statt 4) blieb der Pilot nicht
 * bestanden — mit Pflicht-306, Eskalation und NC-Statistik, aber ohne eine
 * Note, die das traegt.
 */
describe('overallNachNote — die Automatik nimmt sich selbst zurueck', () => {
  const mit = (noten: (1 | 2 | 3 | 4 | 5 | 'NO' | null)[], overall: TraineeGrading['overall']): TraineeGrading => ({
    ...trainee(overall),
    grades: noten.map((grade, i) => ({ code: ['KNO', 'PRO', 'COM'][i], grade, comment: '' })),
  })

  it('setzt Not Competent, sobald die Bedingung greift', () => {
    expect(overallNachNote(mit([3, 3, 3], null), mit([1, 3, 3], null)).overall).toBe('not_competent')
    expect(overallNachNote(mit([2, 3, 3], 'competent'), mit([2, 2, 3], 'competent')).overall).toBe('not_competent')
  })

  it('KNO 1 → 4: das automatische Not Competent faellt weg und muss bewusst gewaehlt werden', () => {
    const vorher = overallNachNote(mit([null, 3, 3], null), mit([1, 3, 3], null))
    expect(vorher.overall).toBe('not_competent')
    expect(overallNachNote(vorher, mit([4, 3, 3], 'not_competent')).overall).toBeNull()
  })

  it('1 → 2 bei einer zweiten 2: die Bedingung haelt weiter, Not Competent bleibt', () => {
    expect(overallNachNote(mit([1, 2, 3], 'not_competent'), mit([2, 2, 3], 'not_competent')).overall).toBe('not_competent')
  })

  it('ein von Hand gewaehltes Not Competent ohne vorherige Automatik bleibt stehen', () => {
    expect(overallNachNote(mit([3, 3, 3], 'not_competent'), mit([4, 3, 3], 'not_competent')).overall).toBe('not_competent')
  })

  it('ein bewusst gewaehltes Competent bleibt nach einer harmlosen Korrektur', () => {
    expect(overallNachNote(mit([3, 3, 3], 'competent'), mit([4, 3, 3], 'competent')).overall).toBe('competent')
  })

  it('aendert nichts ausser overall', () => {
    const nachher = mit([4, 3, 3], 'not_competent')
    expect(overallNachNote(mit([1, 3, 3], 'not_competent'), nachher)).toEqual({ ...nachher, overall: null })
  })
})

/** Felder eines Formulartyps aus dem echten Katalog — die Regeln haengen an
 *  den Schluesseln, die dort stehen. */
const felder = (id: string) => GRADING_DEFAULTS.formTypes.find((f) => f.id === id)!.fields

/**
 * Audit 11/2026, GTY-05: Die Zukunftswarnung pruefte jedes Datumsfeld. Ein
 * korrektes Due Date des 310 loeste „The date is in the future" aus, ein
 * Due Date VOR dem Formulardatum ging ohne Rueckfrage durch.
 */
describe('kopfHinweise — Zukunft nur beim Schulungsdatum, Due Date nicht davor', () => {
  const heute = '2026-11-02'

  it('ein Due Date in der Zukunft ist keine Warnung', () => {
    expect(kopfHinweise(felder('310'), { date: '2026-11-01', dueDate: '2026-12-15' }, heute)).toEqual({ zukunft: false, fehler: [] })
  })

  it('ein Due Date vor dem Datum ist ein Fehler am Feld dueDate', () => {
    const { zukunft, fehler } = kopfHinweise(felder('310'), { date: '2026-10-30', dueDate: '2026-10-01' }, heute)
    expect(zukunft).toBe(false)
    expect(fehler).toEqual([{ feld: 'dueDate', schluessel: 'forms:errDueBeforeDate', werte: { due: 'Due Date', date: 'Date' } }])
  })

  it('am selben Tag faellig ist erlaubt', () => {
    expect(kopfHinweise(felder('310'), { date: '2026-10-30', dueDate: '2026-10-30' }, heute).fehler).toEqual([])
  })

  it('ohne Due Date oder ohne Datum gibt es nichts zu vergleichen', () => {
    expect(kopfHinweise(felder('310'), { date: '2026-10-30' }, heute).fehler).toEqual([])
    expect(kopfHinweise(felder('310'), { dueDate: '2026-10-01' }, heute).fehler).toEqual([])
  })

  it('ein Schulungsdatum in der Zukunft warnt weiter', () => {
    expect(kopfHinweise(felder('310'), { date: '2026-11-03', dueDate: '2026-12-15' }, heute).zukunft).toBe(true)
    expect(kopfHinweise(felder('308A'), { date: '2026-11-03' }, heute).zukunft).toBe(true)
  })

  it('heute ist nicht die Zukunft', () => {
    expect(kopfHinweise(felder('308A'), { date: heute }, heute).zukunft).toBe(false)
  })

  it('ein Formulartyp ohne Due Date kennt den Fehler nicht', () => {
    expect(kopfHinweise(felder('308A'), { date: '2026-10-30', dueDate: '2026-10-01' }, heute).fehler).toEqual([])
  })
})

/**
 * Audit 11/2026, GTY-07: Takeoffs/Landings (308E, 308H) nahmen „-3", „2.5"
 * und „1e5" an; ein getipptes „e" verschwand still (type=number meldet dann
 * den Wert ""). Das Feld ist jetzt Text mit Ziffernfeld, die Regel hier.
 */
describe('ganzzahligNichtNegativ', () => {
  it('verwirft negative, gebrochene und Exponentenwerte', () => {
    for (const v of ['-3', '2.5', '1e5', 'e', '3,0', '+3', '0x1']) expect(ganzzahligNichtNegativ(v), v).toBe(false)
  })

  it('nimmt ganze Zahlen ab 0', () => {
    for (const v of ['0', '3', '12', ' 4 ']) expect(ganzzahligNichtNegativ(v), v).toBe(true)
  })

  it('leer ist bei einem optionalen Feld erlaubt, bei einem Pflichtfeld nicht', () => {
    expect(ganzzahligNichtNegativ('')).toBe(true)
    expect(ganzzahligNichtNegativ(undefined)).toBe(true)
    expect(ganzzahligNichtNegativ('  ', true)).toBe(false)
    expect(ganzzahligNichtNegativ('2', true)).toBe(true)
  })

  it('kopfHinweise meldet jedes Zahlenfeld mit seinem Namen', () => {
    const { fehler } = kopfHinweise(felder('308E'), { takeoffs: '-3', landings: '2.5' }, '2026-11-02')
    expect(fehler).toEqual([
      { feld: 'takeoffs', schluessel: 'forms:errWholeNumber', werte: { field: 'Takeoffs' } },
      { feld: 'landings', schluessel: 'forms:errWholeNumber', werte: { field: 'Landings' } },
    ])
    expect(kopfHinweise(felder('308E'), { takeoffs: '3', landings: '' }, '2026-11-02').fehler).toEqual([])
  })
})

/**
 * Audit 11/2026, GTY-11: 308C „From ATR PEC → To ATR PEC" und 308D
 * „Single → Single Pilot Ops" gingen ohne Rueckfrage durch.
 */
describe('gleichePaare — Von und Nach muessen verschieden sein', () => {
  it('gleiche Werte sind ein Fehler am Nach-Feld', () => {
    expect(gleichePaare(felder('308C'), { variantFrom: 'ATR PEC', variantTo: 'ATR PEC' })).toEqual([{ von: 'variantFrom', nach: 'variantTo' }])
    expect(kopfHinweise(felder('308D'), { convFrom: 'Single Pilot Ops', convTo: 'Single Pilot Ops' }, '2026-11-02').fehler).toEqual([
      { feld: 'convTo', schluessel: 'forms:errSameFromTo', werte: { from: 'Conv. From', to: 'Conv. To' } },
    ])
  })

  it('verschiedene Werte sind in Ordnung', () => {
    expect(gleichePaare(felder('308C'), { variantFrom: 'ATR PEC', variantTo: 'ATR NON PEC' })).toEqual([])
  })

  it('leere Felder meldet diese Regel nicht — das ist Sache der Pflichtpruefung', () => {
    expect(gleichePaare(felder('308C'), { variantFrom: '', variantTo: '' })).toEqual([])
    expect(gleichePaare(felder('308C'), {})).toEqual([])
  })

  it('nur Paare, deren beide Felder der Formulartyp fuehrt', () => {
    expect(gleichePaare(felder('308A'), { variantFrom: 'X', variantTo: 'X' })).toEqual([])
  })
})

/**
 * Audit 11/2026, GTY-10: Das 308G-Formular nannte Personen und
 * Unterschriften anders als das Dokument („Instructor signature" /
 * „Trainee signature" gegen „Signature Course Instructor (COI)" /
 * „Signature Candidate Instructor (CAI)"), bot „Add another pilot" an und
 * nannte in den offenen Punkten Kürzel, die das Formular nie zeigt.
 */
describe('bezeichnungen — Formular und Dokument benennen gleich', () => {
  const typ = (id: string) => GRADING_DEFAULTS.formTypes.find((f) => f.id === id)!

  it('308G: Candidate und Course Instructor, ohne Kürzel', () => {
    const b = bezeichnungen(typ('308G'))
    expect(b.sigAusbilder).toBe('forms:sigCOI')
    expect(b.sigPerson).toBe('forms:sigCAI')
    expect(b.hinzufuegen).toBe('forms:addCandidate')
    expect(b.person).toBe('forms:candidateInstructor')
    expect(b.ausbilder).toBe('forms:courseInstructor')
    expect(b.personN).toBe('forms:candidateN')
    expect(b.personZeile).toBe('forms:personCai')
    expect(b.kuerzel).toBe(false)
  })

  it('Pilotenblätter und Formulare ohne Bewertung bleiben bei Pilot/Trainee', () => {
    for (const id of ['308A', '308F', '306', '310', '307A']) {
      const b = bezeichnungen(typ(id))
      expect(b.sigAusbilder).toBe('forms:sigInstructor')
      expect(b.sigPerson).toBe('forms:sigTrainee')
      expect(b.hinzufuegen).toBe('forms:addTrainee')
      expect(b.personZeile).toBe('forms:personPilot')
      expect(b.kuerzel).toBe(true)
    }
  })

  it('der Kompetenzsatz entscheidet — die Kennung nur, wenn der Typ fehlt', () => {
    // Ein im Admin Panel angelegtes Instruktorenblatt beurteilt ebenfalls einen CAI.
    expect(istInstruktorBlatt({ id: 'X1', competencySet: 'instructor' })).toBe(true)
    expect(istInstruktorBlatt({ id: 'X1', competencySet: 'pilot' })).toBe(false)
    // Ansicht eines 308G, dessen Typ nicht im Katalog steht.
    expect(istInstruktorBlatt({ id: '308G' })).toBe(true)
    expect(bezeichnungen({ id: '308G', competencySet: undefined }).sigAusbilder).toBe('forms:sigCOI')
    expect(istInstruktorBlatt({ id: '308A', competencySet: null })).toBe(false)
  })

  it('jede Bezeichnung hat beide Fassungen — keine bleibt auf dem 308G pilotenhaft', () => {
    const pilot = bezeichnungen(typ('308A'))
    const cai = bezeichnungen(typ('308G'))
    expect(Object.keys(cai).sort()).toEqual(Object.keys(pilot).sort())
    for (const k of Object.keys(pilot) as (keyof typeof pilot)[]) expect(cai[k]).not.toBe(pilot[k])
  })
})

describe('teilnehmerOf — Anwesenheitslisten (GRD-02/EXP-01)', () => {
  it('liefert die Namen der Teilnehmer ohne leere Zeilen', () => {
    const r = rec({ formTypeId: '307A', trainees: [], attendance: [
      { name: ' Jürgen Müller ', signature: null },
      { name: '   ', signature: null },
      { name: 'Zoë Ångström', signature: 'data:image/png;base64,AAA' },
    ] })
    expect(teilnehmerOf(r)).toEqual(['Jürgen Müller', 'Zoë Ångström'])
  })

  it('ist ohne Teilnehmerliste leer — und laesst traineesOf unberuehrt', () => {
    expect(teilnehmerOf(rec())).toEqual([])
    // traineesOf meint die Piloten eines Blattes; Folgeformulare erben genau
    // sie. Die Listen fragen personenSuche (siehe unten).
    const r = rec({ formTypeId: '307A', trainees: [], header: {}, attendance: [{ name: 'Jürgen Müller', signature: null }] })
    expect(traineesOf(r, [r])).toEqual([])
  })
})

describe('personenZeile — wen das Dokument unter welcher Beschriftung nennt (PRT-02)', () => {
  const name = (tr: { traineeName?: string; traineeId: string }) => tr.traineeName || (tr.traineeId === 'u-berger' ? 'Sophie Berger' : '')

  it('307A: „Participants" mit Anzahl, Kopf und Fuss verkuerzt', () => {
    // Vorher: „Pilot / Student Name: Jürgen Müller 1 +25" auf jedem Blatt.
    const r = rec({
      formTypeId: '307A',
      trainees: [],
      header: { traineeName: '' },
      attendance: Array.from({ length: 26 }, (_, i) => ({ name: `Jürgen Müller ${i + 1}`, signature: null })),
    })
    expect(personenZeile(r, { id: '307A', competencySet: null }, [r], name)).toEqual({
      schluessel: 'forms:attendees',
      anzahl: 26,
      namen: ['Jürgen Müller 1 +25'],
      ausBlatt: false,
    })
    const einer = rec({ formTypeId: '307B', trainees: [], header: {}, attendance: [{ name: 'Lukas Steiner', signature: null }] })
    expect(personenZeile(einer, { id: '307B', competencySet: null }, [einer], name).namen).toEqual(['Lukas Steiner'])
  })

  it('308A: Pilot aus dem Blatt, mit eigener Zeile in den Kopfdaten', () => {
    const r = rec({ trainees: [trainee('competent'), trainee(null, ''), { ...trainee(null, ''), traineeId: 'u-berger', traineeName: undefined }] })
    expect(personenZeile(r, { id: '308A', competencySet: 'pilot' }, [r], name)).toEqual({
      schluessel: 'forms:personPilot',
      anzahl: 2,
      namen: ['Sophie Berger', 'Sophie Berger'],
      ausBlatt: true,
    })
  })

  it('308G: Candidate Instructor statt Pilot (GTY-10)', () => {
    const r = rec({ formTypeId: '308G', trainees: [trainee('competent', 'Anna Kandidatin')] })
    const z = personenZeile(r, { id: '308G', competencySet: 'instructor' }, [r], name)
    expect(z.schluessel).toBe('forms:personCai')
    expect(z.namen).toEqual(['Anna Kandidatin'])
  })

  it('306/310: Name aus dem Kopffeld, sonst geerbt vom Ausgangsblatt — ohne eigene Kopfzeile', () => {
    const eltern = rec({ id: 'p1', trainees: [trainee('not_competent', 'Lukas Steiner')] })
    const mitNamen = rec({ id: 'c1', formTypeId: '310', trainees: [], parentId: 'p1', header: { traineeName: ' Sophie Berger ' } })
    expect(personenZeile(mitNamen, { id: '310', competencySet: null }, [eltern, mitNamen], name)).toEqual({
      schluessel: 'forms:personPilot',
      anzahl: 1,
      namen: ['Sophie Berger'],
      ausBlatt: false,
    })
    // Altbestand vor dem Pflichtfeld: Name vom Ausgangsblatt.
    const geerbt = rec({ id: 'c2', formTypeId: '306', trainees: [], parentId: 'p1', header: {} })
    const z = personenZeile(geerbt, { id: '306', competencySet: null }, [eltern, geerbt], name)
    expect([z.schluessel, z.namen, z.ausBlatt]).toEqual(['forms:personPilot', ['Lukas Steiner'], false])
  })

  it('ohne jede Person keine Namen', () => {
    const r = rec({ id: 'c3', formTypeId: '306', trainees: [], header: {} })
    expect(personenZeile(r, { id: '306', competencySet: null }, [r], name)).toEqual({
      schluessel: 'forms:personPilot',
      anzahl: 0,
      namen: [],
      ausBlatt: false,
    })
  })
})

describe('personenKurz / personenSuche — Personen in den Ablage-Listen (Nachtrag zu GRD-02/EXP-01)', () => {
  // Vorher fragten die Listen nur traineesOf: 307A/307B standen als
  // „no trainee" da, ihre Teilnehmer waren weder such- noch filterbar.
  const name = (tr: { traineeName?: string; traineeId: string }) => tr.traineeName || '—'
  const kurs = rec({
    id: 'a1',
    formTypeId: '307A',
    trainees: [],
    header: { traineeName: '' },
    attendance: [
      { name: 'Jürgen Müller', signature: null },
      { name: ' ', signature: null },
      { name: 'Zoë Ångström', signature: null },
      { name: 'Lukas Steiner', signature: null },
    ],
  })

  it('307A: zeigt „Erster +N" wie Kopf und Fuss des Dokuments und findet jeden Teilnehmer', () => {
    expect(personenKurz(kurs, [kurs], name)).toBe('Jürgen Müller +2')
    // Auch der letzte Teilnehmer, der in der Kurzform nicht steht, ist
    // auffindbar — die Leerzeile ist keiner.
    expect(personenSuche(kurs, [kurs], name)).toEqual(['Jürgen Müller', 'Zoë Ångström', 'Lukas Steiner'])
    // Dieselbe Kurzform wie auf dem Dokument, nicht eine zweite Regel.
    expect(personenKurz(kurs, [kurs], name)).toBe(personenZeile(kurs, { id: '307A', competencySet: null }, [kurs], name).namen.join(', '))
  })

  it('308A: alle Piloten des Blattes, unveraendert gegenueber traineesOf', () => {
    const r = rec({ trainees: [trainee('competent', 'Sophie Berger'), trainee(null, 'Lukas Steiner')] })
    expect(personenKurz(r, [r], name)).toBe('Sophie Berger, Lukas Steiner')
    expect(personenSuche(r, [r], name)).toEqual(traineesOf(r, [r]).map(name))
  })

  it('306/310: Name aus dem Kopffeld, sonst geerbt vom Ausgangsblatt', () => {
    const eltern = rec({ id: 'p1', trainees: [trainee('not_competent', 'Lukas Steiner')] })
    const mitNamen = rec({ id: 'c1', formTypeId: '310', trainees: [], parentId: 'p1', header: { traineeName: 'Sophie Berger' } })
    const geerbt = rec({ id: 'c2', formTypeId: '306', trainees: [], parentId: 'p1', header: {} })
    const alle = [eltern, mitNamen, geerbt]
    expect([personenKurz(mitNamen, alle, name), personenKurz(geerbt, alle, name)]).toEqual(['Sophie Berger', 'Lukas Steiner'])
    expect(personenSuche(geerbt, alle, name)).toEqual(['Lukas Steiner'])
  })

  it('ohne jede Person leer — die Ansicht setzt dann ihren Platzhalter', () => {
    const leer = rec({ id: 'c3', formTypeId: '307B', trainees: [], header: {}, attendance: [{ name: '', signature: null }] })
    expect(personenKurz(leer, [leer], name)).toBe('')
    expect(personenSuche(leer, [leer], name)).toEqual([])
  })
})

describe('druckTitelTeile — Name des gedruckten Nachweises (EXM-10)', () => {
  it('folgt dem Schema Form_Titel_Person_Instruktor_Datum_Event und behaelt Wortgrenzen im Event', () => {
    const r = rec({ formTypeId: '308F', header: { date: '2026-08-05', event: 'OPC  Recurrent' } })
    const teile = druckTitelTeile(r, { formTitel: 'Grading Sheet Recurrent', personen: ['Sophie Berger', 'Lukas Steiner'], instruktor: 'Mika Beispiel' })
    expect(teile).toEqual(['308F', 'Grading Sheet Recurrent', 'Sophie Berger, Lukas Steiner', 'Mika Beispiel', '05.08.2026', 'OPC  Recurrent'])
    // Zusammengesetzt nach dem gemeinsamen Schema — vorher „…_05.08.2026_OPCRecurrent".
    expect(druckTitel(teile)).toBe('308F_Grading Sheet Recurrent_Sophie Berger, Lukas Steiner_Mika Beispiel_05.08.2026_OPC Recurrent')
  })

  it('307A: die Teilnehmer wie im Kopf; fehlende Angaben bleiben leer', () => {
    const r = rec({ formTypeId: '307A', trainees: [], header: {} })
    const teile = druckTitelTeile(r, { formTitel: 'Record of Attendance', personen: ['Jürgen Müller +25'], instruktor: '' })
    expect(teile).toEqual(['307A', 'Record of Attendance', 'Jürgen Müller +25', '', '', ''])
    expect(druckTitel(teile)).toBe('307A_Record of Attendance_Jürgen Müller +25')
  })

  it('308H: eine Mehrfachauswahl im Event bleibt lesbar', () => {
    const r = rec({ formTypeId: '308H', header: { date: '2026-11-02', event: 'Adverse Weather, LVO / CAT II / CAT III, UPRT' } })
    expect(druckTitel(druckTitelTeile(r, { formTitel: 'Grading Sheet Other Trainings', personen: [], instruktor: 'Mika Beispiel' }))).toBe(
      '308H_Grading Sheet Other Trainings_Mika Beispiel_02.11.2026_Adverse Weather, LVO - CAT II - CAT III, UPRT',
    )
  })
})

describe('formularTypInGebrauch — Löschknopf und Store fragen dieselbe Regel (Audit 11/2026, GRD-18)', () => {
  it('306 und 310 bleiben immer — auch ohne einen einzigen Datensatz', () => {
    expect(formularTypInGebrauch('306', [])).toBe('pflicht')
    expect(formularTypInGebrauch('310', [])).toBe('pflicht')
  })

  it('ein Typ mit Datensätzen bleibt; der Grund ist ein anderer als bei 306/310', () => {
    expect(formularTypInGebrauch('308A', [rec({ formTypeId: '308A' })])).toBe('datensaetze')
  })

  it('ein unbenutzter neuer Typ ist frei löschbar — vorher sagte der Dialog dasselbe für alle', () => {
    expect(formularTypInGebrauch('399X', [rec({ formTypeId: '308A' })])).toBeNull()
    expect(formularTypInGebrauch('308A', [])).toBeNull()
  })
})

describe('codeVergeben — ein Kürzel je Kompetenzsatz (Audit 11/2026, GRD-19)', () => {
  // Der echte Pilotensatz: Daran hängen Formular, Auswertung und Export.
  const pilot = GRADING_DEFAULTS.competencySets.find((s) => s.key === 'pilot')!.competencies

  it('ein vorhandenes Kürzel ist für eine NEUE Kompetenz vergeben — vorher liess sich „COM" ein zweites Mal speichern', () => {
    expect(pilot.some((c) => c.code === 'COM')).toBe(true)
    expect(codeVergeben('COM', pilot, null)).toBe(true)
  })

  it('Gross-/Kleinschreibung und Leerraum zählen nicht: gespeichert wird „ COM " als „COM"', () => {
    expect(codeVergeben('com', pilot, null)).toBe(true)
    expect(codeVergeben(' Com ', pilot, null)).toBe(true)
  })

  it('beim Bearbeiten darf die Kompetenz ihr eigenes Kürzel behalten, auch anders geschrieben', () => {
    expect(codeVergeben('COM', pilot, 'COM')).toBe(false)
    expect(codeVergeben('com', pilot, 'COM')).toBe(false)
  })

  it('beim Bearbeiten ist das Kürzel einer ANDEREN Kompetenz vergeben', () => {
    expect(codeVergeben('KNO', pilot, 'COM')).toBe(true)
  })

  it('ein neues Kürzel ist frei; leer entscheidet die Pflichtprüfung, nicht diese', () => {
    expect(codeVergeben('XYZ', pilot, null)).toBe(false)
    expect(codeVergeben('', pilot, null)).toBe(false)
    expect(codeVergeben('   ', pilot, 'COM')).toBe(false)
  })
})

/**
 * Notenfarben (Spez. 5.3). Lagen in src/pages/Grading.tsx, von vier Ansichten
 * benutzt und ohne Test — die Testwache sah keine `.tsx` (Audit 11/2026,
 * TEC-18). Festgehalten wird die Zuordnung, nicht der genaue Ton: Die Töne
 * sind auf 4,5:1 gewählt (Kommentar in gradingRules.ts).
 */
describe('gradeColor — Notenfarben nach Spez. 5.3', () => {
  it('5 und 4 grün, 3 dunkelgrün, 2 orange, 1 rot', () => {
    expect(gradeColor(5)).toBe(gradeColor(4))
    expect(gradeColor(4)).toMatch(/\bbg-emerald-700\b/)
    expect(gradeColor(3)).toMatch(/\bbg-emerald-800\b/)
    expect(gradeColor(2)).toMatch(/\bbg-amber-500\b/)
    expect(gradeColor(1)).toMatch(/\bbg-red-700\b/)
  })

  it('„NO" und keine Note sind grau — keine Note ist keine schlechte Note', () => {
    expect(gradeColor('NO')).toBe('bg-line/10 text-dim')
    expect(gradeColor(null)).toBe('bg-line/10 text-dim')
  })

  it('jede Vollfläche bringt ihre Schriftfarbe mit (sonst erbt sie text-ink und kippt im Dunkelmodus)', () => {
    for (const g of [1, 2, 3, 4, 5]) expect(gradeColor(g)).toMatch(/\btext-(white|black)\b/)
  })
})
