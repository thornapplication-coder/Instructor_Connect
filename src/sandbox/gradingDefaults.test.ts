import { describe, expect, it } from 'vitest'
import { ATA_CHAPTERS, DURATION_OPTIONS, FELD_NACHTRAEGE, FORM_TYPES, GRADING_DEFAULTS, MUSTER_PFLICHT } from './gradingDefaults'

/**
 * Katalog des Grading Tools ab Werk (OM Appendix 5). Er stand außerhalb
 * beider Testwachen (Audit 11/2026, TEC-18) — dabei hängen Formular,
 * Nachweis, Logbuch und Export an seinen Schlüsseln: Ein doppelter
 * Feldschlüssel überschreibt still den Wert des anderen Feldes, ein Code
 * zweimal im Kompetenzsatz zählt eine Note doppelt in die Statistik.
 */
const doppelt = (werte: string[]) => werte.filter((w, i) => werte.indexOf(w) !== i)

describe('Grading-Katalog ab Werk', () => {
  it('Formulartypen, Kompetenzsätze, Codes und Feldschlüssel sind eindeutig', () => {
    expect(doppelt(GRADING_DEFAULTS.formTypes.map((t) => t.id))).toEqual([])
    expect(doppelt(GRADING_DEFAULTS.competencySets.map((s) => s.key))).toEqual([])
    for (const set of GRADING_DEFAULTS.competencySets) {
      expect(doppelt(set.competencies.map((c) => c.code)), set.key).toEqual([])
    }
    for (const typ of FORM_TYPES) {
      expect(doppelt(typ.fields.map((f) => f.key)), typ.id).toEqual([])
    }
  })

  it('jeder Formulartyp nennt einen vorhandenen Kompetenzsatz oder bewusst keinen', () => {
    const saetze = new Set(GRADING_DEFAULTS.competencySets.map((s) => s.key))
    for (const typ of FORM_TYPES) {
      if (typ.competencySet !== null) expect(saetze.has(typ.competencySet), typ.id).toBe(true)
    }
  })

  it('Pflichtfelder: jeder Typ hat ein Datum; Auswahlfelder haben Optionen', () => {
    for (const typ of FORM_TYPES) {
      const datum = typ.fields.find((f) => f.key === 'date')
      expect(datum, typ.id).toMatchObject({ type: 'date', required: true })
      for (const f of typ.fields.filter((x) => ['select', 'checkgroup', 'radiogroup'].includes(x.type))) {
        expect(f.options?.length, `${typ.id}.${f.key}`).toBeGreaterThan(0)
        expect(doppelt(f.options ?? []), `${typ.id}.${f.key}`).toEqual([])
      }
    }
  })

  it('Entweder-oder-Paare zeigen aufeinander', () => {
    for (const typ of FORM_TYPES) {
      for (const f of typ.fields.filter((x) => x.exclusiveWith)) {
        const partner = typ.fields.find((x) => x.key === f.exclusiveWith)
        expect(partner?.exclusiveWith, `${typ.id}.${f.key}`).toBe(f.key)
      }
    }
  })

  it('jeder Kompetenzsatz trägt Codes, Titel und Observable Behaviours', () => {
    for (const set of GRADING_DEFAULTS.competencySets) {
      expect(set.competencies.length, set.key).toBeGreaterThan(0)
      for (const c of set.competencies) {
        expect(c.code.trim(), set.key).not.toBe('')
        expect(c.title.trim(), c.code).not.toBe('')
      }
    }
  })

  it('Nachträge: Marken eindeutig, Zieltypen vorhanden, Feld im Katalog schon enthalten', () => {
    // Der Seed-Katalog führt die nachgetragenen Felder selbst (seed.ts setzt
    // die Marken als erledigt) — fehlte das Feld hier, bekäme ein neues
    // Gerät es nie.
    expect(doppelt(FELD_NACHTRAEGE.map((n) => n.marke))).toEqual([])
    for (const n of FELD_NACHTRAEGE) {
      for (const id of n.typen) {
        const typ = FORM_TYPES.find((t) => t.id === id)
        expect(typ, `${n.marke}: ${id}`).toBeDefined()
        expect(typ!.fields.some((f) => f.key === n.feld.key), `${n.marke}: ${id}`).toBe(true)
      }
    }
    expect(MUSTER_PFLICHT).toMatchObject({ key: 'aircraftType', required: true })
  })

  it('Zeitraster und ATA-Liste: Halbstunden ab 00:00, keine Kommas (die Auswahl wird mit „, " gespeichert)', () => {
    expect(DURATION_OPTIONS[0]).toBe('00:00')
    expect(DURATION_OPTIONS[1]).toBe('00:30')
    expect(DURATION_OPTIONS.at(-1)).toBe('14:30')
    expect(ATA_CHAPTERS.filter((a) => a.includes(','))).toEqual([])
  })

  it('Empfänger ab Werk: Standardliste nicht leer, Form 310 an den Training Admin', () => {
    expect(GRADING_DEFAULTS.defaultRecipients.length).toBeGreaterThan(0)
    expect(GRADING_DEFAULTS.deferredRecipients.some((e) => /^training\.admin@/.test(e))).toBe(true)
  })
})
