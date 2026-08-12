import { describe, expect, it } from 'vitest'
import { contentFingerprint, HASH_VERSION, shortFingerprint } from './docHash'
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

describe('contentFingerprint — Altbestand ohne optionale Felder', () => {
  /** Ein Datensatz aus der Fruehzeit fuehrt weder competencies noch
   *  sessionStatus noch attendance. Er muss sich trotzdem hashen lassen —
   *  sonst ist genau der Bestand ungeschuetzt, der am laengsten liegt. */
  const minimal = (): GradingRecord => {
    const r = rec()
    delete (r as Partial<GradingRecord>).competencies
    delete (r as Partial<GradingRecord>).attendance
    return { ...r, sessionStatus: null }
  }

  it('hasht auch ohne competencies, sessionStatus und attendance', async () => {
    expect(await contentFingerprint(minimal())).toMatch(/^[0-9a-f]{64}$/)
  })

  it('unterscheidet „Feld fehlt" nicht von „Feld ist null" — das ist gewollt', async () => {
    const fehlt = minimal()
    const istNull = { ...minimal(), competencies: undefined, attendance: undefined }
    expect(await contentFingerprint(fehlt)).toBe(await contentFingerprint(istNull))
  })

  it('bleibt stabil gegenueber einem leeren Anwesenheitsarray vs. keinem', async () => {
    // Verschiedene Inhalte muessen verschiedene Abdruecke geben.
    expect(await contentFingerprint({ ...minimal(), attendance: [] })).not.toBe(
      await contentFingerprint(minimal()),
    )
  })
})

/**
 * Der Abdruck ist ein VERSPRECHEN an bereits abgelegte Dokumente: Wer die
 * Feldliste umsortiert, ein Feld ergänzt oder `?? null` in `?? undefined`
 * ändert, bricht jeden gespeicherten `contentHash` — und die App meldete
 * danach den gesamten Altbestand als „nachträglich geändert". Die beiden
 * festen Referenzwerte hier frieren das Verfahren je Fassung ein: Sie
 * fallen um, sobald sich das Ergebnis ändert, und zwar BEVOR es Daten
 * betrifft.
 */
describe('contentFingerprint — Fassungen', () => {
  it('Fassung 1 ergibt unveraendert ihren bekannten Abdruck', async () => {
    expect(await contentFingerprint(rec(), 1)).toBe('71baa0047e77f08fda96c8dfa6b85f12da533b980a0537de01f11ceea9dadabc')
  })

  it('Fassung 2 ergibt ihren bekannten Abdruck', async () => {
    expect(await contentFingerprint(rec(), 2)).toBe('9108288edabafee351d36bf7ae43db75a6197c00e296aea99bbc40ec95823d2b')
  })

  it('Fassung 3 ergibt ihren bekannten Abdruck', async () => {
    expect(await contentFingerprint(rec(), 3)).toBe('7a90d1f365c8d1e04ec0ff14ad414e4a79335e835ae78dba39d006ed90a8ba09')
  })

  it('rechnet ohne Angabe mit der aktuellen Fassung', async () => {
    expect(await contentFingerprint(rec())).toBe(await contentFingerprint(rec(), HASH_VERSION))
    expect(HASH_VERSION).toBe(3)
  })

  /**
   * ATO-Name, Zulassungsnummer und Formularstand wurden zur Druckzeit aus den
   * Einstellungen gelesen und waren dort frei aenderbar. Ein unterschriebenes
   * Dokument druckte danach eine andere Zulassungsnummer — und der Abdruck
   * bestaetigte weiter „unveraendert". Das ist der Befund hinter Fassung 3.
   */
  it('Fassung 2 uebersieht den eingefrorenen Dokumentenstand, Fassung 3 nicht', async () => {
    const stand = { atoName: 'Aviation Academy Austria', approval: 'AT.ATO.106', formRevision: 'Rev. 0.2', formTitle: 'Grading Sheet TR' }
    const anders = { ...stand, approval: 'AT.ATO.999' }
    expect(await contentFingerprint(rec({ docSnapshot: anders }), 2)).toBe(await contentFingerprint(rec({ docSnapshot: stand }), 2))
    expect(await contentFingerprint(rec({ docSnapshot: anders }))).not.toBe(await contentFingerprint(rec({ docSnapshot: stand })))
  })

  it('Fassung 1 uebersieht die Behoerde — genau deshalb gibt es Fassung 2', async () => {
    expect(await contentFingerprint(rec({ authority: 'UK' }), 1)).toBe(await contentFingerprint(rec(), 1))
  })

  it('Fassung 2 bemerkt einen Wechsel der Behoerde AT -> UK', async () => {
    // Die Zulassung im Dokumentkopf entscheidet, unter welcher ATO die
    // Schulung lief. Sie liess sich nach der Unterschrift unbemerkt
    // umstellen — das ist der Befund hinter Fassung 2.
    expect(await contentFingerprint(rec({ authority: 'UK' }))).not.toBe(await contentFingerprint(rec()))
  })

  it('Fassung 2 liest eine fehlende Behoerde als AT — wie die Anzeige', async () => {
    // Wichtig fuer den Bestand: `authority` fehlte frueher ganz, und die
    // Anzeige liest ein fehlendes Feld als AT. Waeren beide verschieden,
    // haette dieselbe Aussage zwei Abdruecke.
    expect(await contentFingerprint(rec({ authority: undefined }))).toBe(await contentFingerprint(rec({ authority: 'AT' })))
  })

  it('Fassung 2 bemerkt zusaetzliche Empfaenger', async () => {
    expect(await contentFingerprint(rec({ extraRecipients: ['ops@example.com'] }))).not.toBe(await contentFingerprint(rec()))
  })
})
