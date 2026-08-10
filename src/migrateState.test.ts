import { describe, expect, it } from 'vitest'
import { createSeedState } from './sandbox/seed'
import { migrateState } from './migrateState'

/**
 * Die Migration holt Bestandsgeraete auf den aktuellen Stand, ohne dass
 * jemand die Sandbox zuruecksetzen muss. Wichtig ist dabei zweierlei: sie
 * muss greifen, und sie darf bei mehrfachem Lauf nichts doppeln.
 */

const HIST = ['gr-hist1', 'gr-hist2', 'gr-hist3']
const idsOf = (st: ReturnType<typeof createSeedState>) => st.gradingRecords.map((r) => r.id)

describe('migrateState — historische Sessions', () => {
  it('traegt die Verlaufs-Blaetter nach, wenn sie fehlen', () => {
    const alt = { ...createSeedState(), gradingRecords: createSeedState().gradingRecords.filter((r) => !HIST.includes(r.id)) }
    expect(idsOf(alt).filter((id) => HIST.includes(id))).toEqual([])
    const neu = migrateState(alt)
    expect(idsOf(neu).filter((id) => HIST.includes(id)).sort()).toEqual([...HIST].sort())
  })

  it('doppelt nichts bei mehrfachem Lauf', () => {
    const einmal = migrateState(createSeedState())
    const zweimal = migrateState(einmal)
    expect(idsOf(zweimal).length).toBe(idsOf(einmal).length)
    HIST.forEach((id) => expect(idsOf(zweimal).filter((x) => x === id)).toHaveLength(1))
  })

  it('laesst bestehende Formulare unangetastet', () => {
    const alt = { ...createSeedState(), gradingRecords: createSeedState().gradingRecords.filter((r) => !HIST.includes(r.id)) }
    const vorher = idsOf(alt)
    const neu = migrateState(alt)
    vorher.forEach((id) => expect(idsOf(neu)).toContain(id))
  })

  it('holt sie nicht zurueck, solange noch eines der Blaetter da ist', () => {
    // Wer bewusst aufraeumt, soll nicht gegen die Migration ankaempfen.
    const seed = createSeedState()
    const nurEines = { ...seed, gradingRecords: seed.gradingRecords.filter((r) => r.id !== 'gr-hist2' && r.id !== 'gr-hist3') }
    const neu = migrateState(nurEines)
    expect(idsOf(neu)).toContain('gr-hist1')
    expect(idsOf(neu)).not.toContain('gr-hist2')
  })
})

describe('migrateState — bestehende Zusagen', () => {
  it('setzt den ATO-Kopf auf die echte Organisation', () => {
    const alt = createSeedState()
    alt.settings.documentHeader = { ...alt.settings.documentHeader, atoName: 'Austrian Aviation Academy', approvalNumber: 'AT.ATO.007' }
    const dh = migrateState(alt).settings.documentHeader
    expect(dh.atoName).toBe('Aviation Academy Austria')
    expect(dh.approvalNumber).toBe('AT.ATO.106')
    expect(dh.approvalNumberUK).toBe('GBR.ATO.0541')
  })

  it('haelt den Changelog auf dem einzelnen 1.0.0-Erststand', () => {
    const alt = { ...createSeedState(), changelog: [{ version: '0.9.0', at: 1, changes: 'alt' }, { version: '0.8.0', at: 0, changes: 'aelter' }] }
    const cl = migrateState(alt).changelog
    expect(cl).toHaveLength(1)
    expect(cl[0].version).toBe('1.0.0')
  })

  it('stellt „General" in beiden Kategorielisten sicher', () => {
    const alt = createSeedState()
    alt.settings.feedbackCategories = alt.settings.feedbackCategories.filter((c) => c !== 'General')
    alt.settings.infoCategories = alt.settings.infoCategories.filter((c) => c !== 'General')
    const s = migrateState(alt).settings
    expect(s.feedbackCategories).toContain('General')
    expect(s.infoCategories).toContain('General')
  })
})
