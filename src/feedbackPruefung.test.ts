import { describe, expect, it } from 'vitest'
import { feedbackFehlt, type FeedbackEntwurf } from './feedbackPruefung'

/**
 * Feedback-Pflichtfelder (Audit 11/2026, A11Y-16): Das Formular markiert
 * genau die Felder, die diese Liste nennt, und springt zum ersten. Die
 * Reihenfolge ist deshalb Teil der Zusage.
 */

const voll: FeedbackEntwurf = { recipient: 'Training', category: 'Simulator', scope: 'general', aircraftType: '', message: 'Sitz klemmt.' }

describe('feedbackFehlt', () => {
  it('vollstaendig: nichts fehlt', () => {
    expect(feedbackFehlt(voll)).toEqual([])
  })

  it('leer: alle Pflichtfelder, in Formular-Reihenfolge', () => {
    expect(feedbackFehlt({ recipient: '', category: '', scope: 'general', aircraftType: '', message: '' })).toEqual([
      'recipient',
      'category',
      'message',
    ])
  })

  it('je ein fehlendes Feld', () => {
    expect(feedbackFehlt({ ...voll, recipient: '' })).toEqual(['recipient'])
    expect(feedbackFehlt({ ...voll, category: '' })).toEqual(['category'])
    expect(feedbackFehlt({ ...voll, message: '' })).toEqual(['message'])
  })

  it('Nachricht nur aus Leerraum ist keine', () => {
    expect(feedbackFehlt({ ...voll, message: '  \n ' })).toEqual(['message'])
  })

  it('Musterbezug ohne Muster: das Muster fehlt — vor der Nachricht', () => {
    expect(feedbackFehlt({ ...voll, scope: 'aircraft' })).toEqual(['aircraft'])
    expect(feedbackFehlt({ ...voll, scope: 'aircraft', message: '' })).toEqual(['aircraft', 'message'])
    expect(feedbackFehlt({ ...voll, scope: 'aircraft', aircraftType: 'CL30' })).toEqual([])
  })

  it('allgemein: ein liegengebliebenes Muster zaehlt nicht', () => {
    expect(feedbackFehlt({ ...voll, scope: 'general', aircraftType: '' })).toEqual([])
  })
})
