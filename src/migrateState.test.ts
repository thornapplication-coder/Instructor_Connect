import { describe, expect, it } from 'vitest'
import { createSeedState } from './sandbox/seed'
import { migrateState } from './migrateState'
import { imprintHash, IMPRINT_LEGACY_HASHES } from './sandbox/imprintDefaults'

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

  it('stolpert nicht ueber fehlende Kopfdaten — ergaenzt sie aber, statt auszusteigen', () => {
    /*
     * Hier stand `expect(migrateState(st)).toBe(st)`: Ohne Kopfdaten sollte
     * die Migration den Bestand unveraendert zurueckgeben. Diese Zusage wird
     * bewusst aufgegeben. Sie hiess in der Praxis, dass ein Geraet ohne
     * `documentHeader` auch KEINE `notes`, keine Schulungsarten und keine
     * Kategorien bekam — alle Nachtraege liegen unter jenem Ausstieg. Der
     * Bestand blieb unangetastet, die App war dafuer unbenutzbar.
     * Geblieben ist die eigentliche Zusage: werfen darf sie nicht.
     */
    const st = createSeedState()
    delete (st.settings as { documentHeader?: unknown }).documentHeader
    expect(() => migrateState(st)).not.toThrow()
    expect(migrateState(st).settings.documentHeader?.approvalNumber).toBe('AT.ATO.106')
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

describe('migrateState — fehlende Kopfdaten blockieren nichts mehr', () => {
  /**
   * Hier stand ein `if (!dh) return st` GANZ OBEN, und darunter liegen
   * saemtliche Feld-Nachtraege. Ein Bestandsgeraet ohne `documentHeader`
   * bekam damit auch keine `notes` — und jede Stelle, die
   * `state.notes.length` liest, lief auf `undefined`.
   */
  it('traegt Notizen und Schulungsarten auch ohne documentHeader nach', () => {
    const alt = createSeedState()
    delete (alt.settings as { documentHeader?: unknown }).documentHeader
    delete (alt as { notes?: unknown }).notes
    delete (alt.settings as { lessonCategories?: string[] }).lessonCategories
    const neu = migrateState(alt)
    expect(neu.notes).toEqual([])
    expect(neu.settings.lessonCategories).toContain('Type Rating')
  })

  it('ergaenzt die fehlenden Kopfdaten selbst', () => {
    const alt = createSeedState()
    delete (alt.settings as { documentHeader?: unknown }).documentHeader
    const neu = migrateState(alt)
    expect(neu.settings.documentHeader?.atoName).toBe('Aviation Academy Austria')
    expect(neu.settings.documentHeader?.approvalNumber).toBe('AT.ATO.106')
  })

  it('macht aus einer fehlenden Formularliste eine leere', () => {
    // Der Offline-Streifen zaehlt darauf den Ausgangskorb, ungeprueft.
    const alt = createSeedState()
    delete (alt as { gradingRecords?: unknown }).gradingRecords
    expect(migrateState(alt).gradingRecords).toEqual([])
  })

  it('laesst einen Zustand ohne Einstellungen unveraendert, statt abzustuerzen', () => {
    const kaputt = { users: [] } as unknown as ReturnType<typeof createSeedState>
    expect(migrateState(kaputt)).toBe(kaputt)
  })
})

describe('migrateState — Impressum', () => {
  /**
   * Der Text steht in den EINSTELLUNGEN; eine geaenderte Vorgabe erreicht
   * Bestandsgeraete sonst nie. Ersetzt werden darf aber nur, was noch
   * unveraendert die alte Vorgabe ist — sonst ueberschreibt ein Update den
   * selbst geschriebenen Text des Superadmins. Erkannt wird das an der
   * Pruefsumme der vorigen Vorgabe (IMPRINT_LEGACY_HASHES).
   */
  it('rechnet die Pruefsumme stabil — sonst faende die Migration den Altstand nie', () => {
    // Aendert jemand das Verfahren, passt keine der hinterlegten Pruefsummen
    // mehr, und der Nachtrag liefe stillschweigend ins Leere.
    expect(imprintHash('Instructor Connect')).toBe(imprintHash('Instructor Connect'))
    expect(imprintHash('a')).toBe(177604)
    expect(imprintHash('b')).not.toBe(imprintHash('a'))
  })

  it('haelt die aktuelle Vorgabe von der Altstands-Liste fern', () => {
    // Stuende sie darin, ersetzte sich der Text bei jedem Start selbst.
    const st = createSeedState()
    expect(IMPRINT_LEGACY_HASHES).not.toContain(imprintHash(st.settings.imprint.de))
    expect(IMPRINT_LEGACY_HASHES).not.toContain(imprintHash(st.settings.imprint.en))
  })

  it('laesst einen selbst geschriebenen Text unangetastet', () => {
    const alt = createSeedState()
    alt.settings.imprint = { de: 'Eigener Text', en: 'Own text' }
    expect(migrateState(alt).settings.imprint).toEqual({ de: 'Eigener Text', en: 'Own text' })
  })

  it('laesst die aktuelle Vorgabe unveraendert — sie ist ja schon die neue', () => {
    const st = createSeedState()
    expect(migrateState(st).settings.imprint.de).toBe(st.settings.imprint.de)
  })

  it('nennt in beiden Sprachen einen Datenschutz-Abschnitt', () => {
    const st = createSeedState()
    expect(st.settings.imprint.de).toContain('# 6. Datenschutz')
    expect(st.settings.imprint.en).toContain('# 6. Data protection')
  })
})
