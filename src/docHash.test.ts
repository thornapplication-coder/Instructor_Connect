import { describe, expect, it } from 'vitest'
import { contentFingerprint, shortFingerprint } from './docHash'
import type { GradingRecord } from './types'

/**
 * Der Fingerabdruck ist das, was eine gezeichnete Unterschrift überhaupt
 * belastbar macht: Er bindet sie an den Inhalt, unter dem sie steht (#57).
 * Ändert jemand nach der Unterschrift etwas, muss der Abdruck abweichen —
 * sonst ist die nachträgliche Änderung unsichtbar.
 */

const rec = (over: Partial<GradingRecord> = {}): GradingRecord => ({
  id: 'r1',
  formTypeId: '308A',
  instructorId: 'u1',
  header: { date: '2026-08-05' },
  trainees: [
    {
      traineeId: '',
      traineeName: 'Sophie Berger',
      position: 'CDR',
      grades: [{ code: 'KNO', grade: 3, comment: '' }],
      positiveComment: 'gut vorbereitet',
      developmentComment: '',
      summaryComment: '',
      overall: 'competent',
    },
  ],
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

describe('contentFingerprint', () => {
  it('liefert denselben Abdruck fuer denselben Inhalt', async () => {
    expect(await contentFingerprint(rec())).toBe(await contentFingerprint(rec()))
  })

  it('ist ein vollstaendiger SHA-256 in Hex', async () => {
    expect(await contentFingerprint(rec())).toMatch(/^[0-9a-f]{64}$/)
  })

  it('aendert sich, wenn eine Note nachtraeglich geaendert wird', async () => {
    const geaendert = rec({
      trainees: [{ ...rec().trainees[0], grades: [{ code: 'KNO', grade: 5, comment: '' }] }],
    })
    expect(await contentFingerprint(geaendert)).not.toBe(await contentFingerprint(rec()))
  })

  it('aendert sich, wenn ein Bewertungstext nachtraeglich geaendert wird', async () => {
    const geaendert = rec({ trainees: [{ ...rec().trainees[0], summaryComment: 'nachtraeglich ergaenzt' }] })
    expect(await contentFingerprint(geaendert)).not.toBe(await contentFingerprint(rec()))
  })

  it('aendert sich, wenn das Unterschriftsbild ausgetauscht wird', async () => {
    expect(await contentFingerprint(rec({ signatureTrainee: 'data:image/png;base64,ZZZ' }))).not.toBe(
      await contentFingerprint(rec()),
    )
  })

  it('aendert sich, wenn die Kopfdaten angetastet werden', async () => {
    expect(await contentFingerprint(rec({ header: { date: '2026-08-06' } }))).not.toBe(await contentFingerprint(rec()))
  })

  it('aendert sich, wenn die Chronologie der Unterschriften verschoben wird (#57)', async () => {
    expect(await contentFingerprint(rec({ countersignedAt: Date.UTC(2026, 7, 6) }))).not.toBe(
      await contentFingerprint(rec()),
    )
  })

  it('bleibt gleich, wenn sich nur Nebensaechliches aendert', async () => {
    // Versandstatus und Ausblenden gehoeren nicht zum unterschriebenen
    // Dokument — sie duerfen den Abdruck nicht brechen.
    expect(await contentFingerprint(rec({ mailStatus: 'failed', hiddenFor: ['u9'] }))).toBe(
      await contentFingerprint(rec()),
    )
  })
})

describe('shortFingerprint', () => {
  it('kuerzt auf zwei lesbare Bloecke zum Abgleich zweier Ausdrucke', () => {
    expect(shortFingerprint('0123456789abcdef'.repeat(4))).toBe('01234567-89abcdef')
  })
})
