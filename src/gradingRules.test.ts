import { describe, expect, it } from 'vitest'
import {
  followUpStarted,
  gradingListComparator,
  hasEvidence,
  isComplete,
  isFollowUpType,
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

  it('schliesst die parentId-Luecke: ein fremdes Blatt mit erfundenem parentId hebt die Pflicht nicht auf (#50)', () => {
    const parent = rec({ trainees: [trainee('not_competent')] })
    // Ein ueber die Adresszeile angelegtes 308A, das sich als Kind ausgibt.
    const impostor = rec({ id: 'x1', formTypeId: '308A', parentId: 'r1', status: 'signed' })
    expect(missingFollowUps(parent, [parent, impostor])).toContain('306')
  })

  it('bindet das 306 an genau EIN Blatt, das 310 an den ganzen Durchgang', () => {
    const a = rec({ id: 'a', batchId: 'b1', trainees: [trainee('not_competent', 'A')], sessionStatus: 'not_completed' })
    const b = rec({ id: 'b', batchId: 'b1', trainees: [trainee('not_competent', 'B')], sessionStatus: 'not_completed' })
    const deferred = rec({ id: 'd', formTypeId: '310', parentId: 'a', status: 'signed' })
    const add306 = rec({ id: 'e', formTypeId: '306', parentId: 'a', status: 'signed' })
    // Das 310 an Blatt a deckt auch Blatt b ab (gleicher batchId) ...
    expect(missingFollowUps(b, [a, b, deferred, add306])).not.toContain('310')
    // ... das 306 dagegen nicht: b braucht sein eigenes.
    expect(missingFollowUps(b, [a, b, deferred, add306])).toContain('306')
  })

  it('fordert von einem Folgeformular selbst kein weiteres Folgeformular', () => {
    const child = rec({ formTypeId: '306', trainees: [trainee('not_competent')], sessionStatus: 'not_completed' })
    expect(missingFollowUps(child, [child])).toEqual([])
    expect(isFollowUpType('306')).toBe(true)
    expect(isFollowUpType('308A')).toBe(false)
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
  it('erkennt ein angefangenes 310 auch am Geschwisterblatt des Durchgangs', () => {
    const a = rec({ id: 'a', batchId: 'b1', sessionStatus: 'not_completed' })
    const b = rec({ id: 'b', batchId: 'b1', sessionStatus: 'not_completed' })
    const entwurf = rec({ id: 'd', formTypeId: '310', parentId: 'a', status: 'awaiting_signature' })
    expect(followUpStarted(b, [a, b, entwurf], '310')).toBe(true)
    // ... das 306 dagegen bleibt an genau einem Blatt haengen
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
