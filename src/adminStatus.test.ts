import { describe, expect, it } from 'vitest'
import { adminStatus } from './adminStatus'
import type { FeedbackEntry, GradingRecord } from './types'

/**
 * Die Statuszeile ist eine Zusage: Was hier nicht steht, wartet auch nicht.
 *
 * Deshalb hier auf dem Pruefstand, was sie zaehlt und was sie verschweigt:
 *  - Ein Punkt mit 0 kommt gar nicht erst vor. Eine Zeile, die „0 offen"
 *    meldet, ist Rauschen und macht die echten Meldungen unsichtbar.
 *  - Die Reihenfolge ist Dringlichkeit, nicht Zufall: ein gescheiterter
 *    Versand ist ein Fehler, eine fehlende Unterschrift nur unfertig.
 *  - Ein Gruppen-Admin bekommt keine Meldung zum Grading Tool — er kann den
 *    Bereich nicht oeffnen, und ein Hinweis ohne Weg dorthin ist eine
 *    Sackgasse.
 */

const blatt = (u: Partial<GradingRecord> = {}): GradingRecord =>
  ({
    id: 'r1',
    formTypeId: '308A',
    instructorId: 'u1',
    header: { aircraftType: 'CL30', date: '2026-08-08' },
    trainees: [],
    sessionStatus: 'completed',
    freeText: {},
    signatureInstructor: null,
    signatureTrainee: null,
    status: 'signed',
    mailStatus: 'sent',
    createdAt: 0,
    ...u,
  }) as GradingRecord

const feedback = (u: Partial<FeedbackEntry> = {}): FeedbackEntry =>
  ({ id: 'f1', authorId: 'u1', category: 'Ops', recipient: 'x', urgent: false, message: 'm', createdAt: 0, ...u }) as FeedbackEntry

const quelle = (u: Partial<Parameters<typeof adminStatus>[0]> = {}) => ({
  gradingRecords: [] as GradingRecord[],
  feedbackEntries: [] as FeedbackEntry[],
  darfGrading: true,
  darfFeedback: true,
  ...u,
})

describe('Statuszeile des Admin-Panels', () => {
  it('bleibt leer, wenn nichts wartet', () => {
    // Kein „0 offen": ein Punkt ohne Zahl dahinter ist keine Meldung.
    expect(adminStatus(quelle({ gradingRecords: [blatt()], feedbackEntries: [feedback({ resolvedAt: 5 })] }))).toEqual([])
  })

  it('meldet gescheiterten Versand vor fehlender Unterschrift', () => {
    const punkte = adminStatus(
      quelle({ gradingRecords: [blatt({ id: 'a', status: 'awaiting_signature' }), blatt({ id: 'b', mailStatus: 'failed' })] }),
    )
    expect(punkte.map((p) => p.key)).toEqual(['failedMails', 'openSignatures'])
    expect(punkte[0].tone).toBe('bad')
    expect(punkte[1].tone).toBe('wait')
  })

  it('zaehlt fehlende Pflicht-Folgeformulare', () => {
    // 308A mit einem durchgefallenen Piloten verlangt ein 306 (siehe
    // gradingRules). Fehlt es, wartet etwas — und zwar dringend.
    const durchgefallen = blatt({
      trainees: [{ traineeName: 'Sophie Berger', traineeId: '', position: 'FO', grades: [], positiveComment: '', developmentComment: '', summaryComment: '', overall: 'not_competent' }],
    })
    const punkte = adminStatus(quelle({ gradingRecords: [durchgefallen] }))
    // Gelb wie die Ampel derselben Zeile — nicht rot; siehe adminStatus.ts.
    expect(punkte.find((p) => p.key === 'openFollowUps')).toMatchObject({ count: 1, tone: 'wait' })
  })

  it('zaehlt nur unbearbeitetes Feedback', () => {
    const punkte = adminStatus(
      quelle({ feedbackEntries: [feedback({ id: 'a' }), feedback({ id: 'b' }), feedback({ id: 'c', resolvedAt: 9 })] }),
    )
    expect(punkte).toEqual([{ key: 'openFeedback', count: 2, tone: 'wait', to: '/admin/feedback' }])
  })

  it('verschweigt dem Gruppen-Admin das Grading Tool, nicht aber das Feedback', () => {
    const punkte = adminStatus(
      quelle({ darfGrading: false, gradingRecords: [blatt({ mailStatus: 'failed', status: 'draft' })], feedbackEntries: [feedback()] }),
    )
    expect(punkte.map((p) => p.key)).toEqual(['openFeedback'])
  })

  it('fuehrt jeden Punkt an den Ort, an dem er zu erledigen ist', () => {
    const punkte = adminStatus(quelle({ gradingRecords: [blatt({ mailStatus: 'failed' })], feedbackEntries: [feedback()] }))
    expect(punkte.map((p) => p.to)).toEqual(['/admin/grading/dashboard', '/admin/feedback'])
  })
})

describe('Ein Punkt fuehrt nur dorthin, wo die Rolle hindarf', () => {
  /*
   * Die Statuszeile meldet nicht nur, sie springt auch — jeder Punkt ist ein
   * Knopf mit Ziel. Das Feedback stand hier lange bedingungslos, mit der
   * Begruendung, es stehe „auch dem Gruppen-Admin offen". Seit der Training
   * Admin ein Panel hat, stimmt das nicht mehr: Er sieht das Grading, aber
   * kein Feedback — und bekam einen Punkt, der ihn in die Uebersicht
   * zurueckwarf.
   */
  it('verschweigt dem Training Admin das Feedback, nicht aber das Grading', () => {
    const punkte = adminStatus(
      quelle({
        darfGrading: true,
        darfFeedback: false,
        gradingRecords: [blatt({ mailStatus: 'failed', status: 'draft' })],
        feedbackEntries: [feedback()],
      }),
    )
    expect(punkte.map((p) => p.key)).not.toContain('openFeedback')
    expect(punkte.map((p) => p.key)).toContain('failedMails')
  })

  it('meldet gar nichts, wenn beides zu ist', () => {
    expect(
      adminStatus(quelle({ darfGrading: false, darfFeedback: false, gradingRecords: [blatt({ mailStatus: 'failed' })], feedbackEntries: [feedback()] })),
    ).toEqual([])
  })
})
