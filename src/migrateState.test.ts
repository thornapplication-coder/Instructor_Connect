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

/** Ein Bestandsgeraet kennt die Nachtrags-Marke noch nicht — genau das ist
 *  der Zustand, fuer den die Migration gebaut ist. */
const bestand = (over: Partial<ReturnType<typeof createSeedState>> = {}) => {
  const st = { ...createSeedState(), ...over }
  delete (st as { seedHistoryMigrated?: boolean }).seedHistoryMigrated
  return st
}

describe('migrateState — historische Sessions', () => {
  it('traegt die Verlaufs-Blaetter nach, wenn sie fehlen', () => {
    const alt = bestand({ gradingRecords: createSeedState().gradingRecords.filter((r) => !HIST.includes(r.id)) })
    expect(idsOf(alt).filter((id) => HIST.includes(id))).toEqual([])
    const neu = migrateState(alt)
    expect(idsOf(neu).filter((id) => HIST.includes(id)).sort()).toEqual([...HIST].sort())
  })

  it('doppelt nichts bei mehrfachem Lauf', () => {
    const einmal = migrateState(bestand())
    const zweimal = migrateState(einmal)
    expect(idsOf(zweimal).length).toBe(idsOf(einmal).length)
    HIST.forEach((id) => expect(idsOf(zweimal).filter((x) => x === id)).toHaveLength(1))
  })

  it('laesst bestehende Formulare unangetastet', () => {
    const alt = bestand({ gradingRecords: createSeedState().gradingRecords.filter((r) => !HIST.includes(r.id)) })
    const vorher = idsOf(alt)
    const neu = migrateState(alt)
    vorher.forEach((id) => expect(idsOf(neu)).toContain(id))
  })

  it('holt sie nicht zurueck, solange noch eines der Blaetter da ist', () => {
    // Wer bewusst aufraeumt, soll nicht gegen die Migration ankaempfen.
    const nurEines = bestand({ gradingRecords: createSeedState().gradingRecords.filter((r) => r.id !== 'gr-hist2' && r.id !== 'gr-hist3') })
    const neu = migrateState(nurEines)
    expect(idsOf(neu)).toContain('gr-hist1')
    expect(idsOf(neu)).not.toContain('gr-hist2')
  })

  /**
   * Der eigentliche Befund: Der Nachtrag entschied allein danach, ob noch
   * eines der drei Blaetter im Bestand lag. Wer sie als Superadmin
   * VOLLSTAENDIG loeschte, bekam sie beim naechsten Start zurueck — und
   * weil createSeedState() alle Zeitstempel gegen die aktuelle Uhr rechnet,
   * jedes Mal mit neuem Datum. Ein Loeschen, das sich von selbst rueckgaengig
   * macht, ist in einer Ausbildungsablage nicht hinnehmbar.
   */
  it('holt vollstaendig geloeschte Blaetter NICHT zurueck', () => {
    const nachNachtrag = migrateState(bestand())
    expect(nachNachtrag.seedHistoryMigrated).toBe(true)
    const geloescht = { ...nachNachtrag, gradingRecords: nachNachtrag.gradingRecords.filter((r) => !HIST.includes(r.id)) }
    const neuGeladen = migrateState(geloescht)
    expect(idsOf(neuGeladen).filter((id) => HIST.includes(id))).toEqual([])
    // Auch nach mehreren Starts bleibt das Loeschen bestehen.
    expect(idsOf(migrateState(migrateState(neuGeladen))).filter((id) => HIST.includes(id))).toEqual([])
  })

  it('setzt die Marke auch dann, wenn nichts nachzutragen war', () => {
    // Sonst bliebe das Fenster offen: einmal ohne Marke geladen, danach
    // geloescht — und der Nachtrag griffe beim uebernaechsten Start doch.
    const alt = bestand()
    expect(alt.seedHistoryMigrated).toBeUndefined()
    expect(migrateState(alt).seedHistoryMigrated).toBe(true)
  })

  it('der Seed traegt die Marke bereits — er bringt die Blaetter selbst mit', () => {
    expect(createSeedState().seedHistoryMigrated).toBe(true)
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

describe('migrateState — Zusagen, die bisher niemand geprueft hat', () => {
  it('laesst eine bewusst gesetzte eigene ATO-Angabe unangetastet', () => {
    // Der Kommentar verspricht das ausdruecklich; eine Erweiterung von
    // OLD_NAMES wuerde sonst echte Kundendaten ueberschreiben.
    const st = createSeedState()
    st.settings.documentHeader = { ...st.settings.documentHeader, atoName: 'Meine ATO', approvalNumber: 'AT.ATO.999' }
    const dh = migrateState(st).settings.documentHeader
    expect(dh.atoName).toBe('Meine ATO')
    expect(dh.approvalNumber).toBe('AT.ATO.999')
  })

  it('ergaenzt die fehlende UK-Nummer, ohne eine vorhandene zu ueberschreiben', () => {
    const ohne = createSeedState()
    ohne.settings.documentHeader = { ...ohne.settings.documentHeader, approvalNumberUK: '' }
    expect(migrateState(ohne).settings.documentHeader.approvalNumberUK).toBe('GBR.ATO.0541')

    const eigen = createSeedState()
    eigen.settings.documentHeader = { ...eigen.settings.documentHeader, approvalNumberUK: 'GBR.ATO.1234' }
    expect(migrateState(eigen).settings.documentHeader.approvalNumberUK).toBe('GBR.ATO.1234')
  })

  it('steigt ohne documentHeader aus, statt zu stolpern', () => {
    // Altbestand ohne Kopfdaten: die Migration darf nicht werfen.
    const st = createSeedState()
    delete (st.settings as { documentHeader?: unknown }).documentHeader
    expect(() => migrateState(st)).not.toThrow()
    expect(migrateState(st)).toBe(st)
  })

  it('benennt den Demo-Platzhalter um, aber nur solange der alte Name steht', () => {
    const st = createSeedState()
    st.users = st.users.map((u) => (u.id === 'u-max' ? { ...u, name: 'Max Mustermann' } : u))
    st.contacts = st.contacts.map((c) => (c.id === 'c2' ? { ...c, name: 'Max Mustermann' } : c))
    const neu = migrateState(st)
    expect(neu.users.find((u) => u.id === 'u-max')?.name).toBe('Steven Fermie')
    expect(neu.contacts.find((c) => c.id === 'c2')?.name).toBe('Steven Fermie')

    // Ein bewusst vergebener eigener Name bleibt stehen
    const eigen = createSeedState()
    eigen.users = eigen.users.map((u) => (u.id === 'u-max' ? { ...u, name: 'Eigener Name' } : u))
    expect(migrateState(eigen).users.find((u) => u.id === 'u-max')?.name).toBe('Eigener Name')
  })
})

describe('migrateState — Schulungsarten der Lesson Plans', () => {
  it('traegt die Liste nach, wenn sie fehlt', () => {
    // Im alten Schema gab es sie nicht; ohne Nachtrag stuende das
    // Auswahlfeld auf Bestandsgeraeten leer.
    const alt = createSeedState()
    delete (alt.settings as { lessonCategories?: string[] }).lessonCategories
    expect(migrateState(alt).settings.lessonCategories).toContain('Type Rating')
  })

  it('laesst eine eigene Liste unangetastet', () => {
    const alt = createSeedState()
    alt.settings.lessonCategories = ['Nur das hier']
    expect(migrateState(alt).settings.lessonCategories).toEqual(['Nur das hier'])
  })
})
