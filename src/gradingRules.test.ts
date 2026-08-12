import { describe, expect, it } from 'vitest'
import {
  autoNotCompetent,
  followUpStarted,
  gradingDayKey,
  gradingListComparator,
  gradingListDate,
  hasEvidence,
  isComplete,
  isFollowUpType,
  isNotCompetent,
  missingFollowUps,
  trafficLight,
  traineesOf,
} from './gradingRules'
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
