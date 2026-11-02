import { getDefaultNormalizer, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../i18n'
import { GRADING_DEFAULTS } from '../sandbox/gradingDefaults'
import type { GradingRecord, TraineeGrading } from '../types'
import { GradingView } from './GradingView'

/**
 * Die Ansicht eines Nachweises (Ebene 2) — dort, wo sie auf dem Ausdruck
 * schon einmal zerbrochen war. Ob die Kopfdaten breit und mit Umbruechen
 * stehen, ist eine Eigenschaft des Markups (Klassen), nicht der Logik;
 * welche Zeilen es gibt, prueft gradingKopf.test.ts.
 *
 * Der Store ist ersetzt: Die Ansicht liest nur Bestand, Einstellungen und
 * den angemeldeten Nutzer, und genau das bekommt sie hier.
 */

const store = vi.hoisted(() => ({ records: [] as GradingRecord[] }))

vi.mock('../store', async (original) => {
  const echt = await original<typeof import('../store')>()
  const mika = { id: 'u-mika', name: 'Mika Beispiel', role: 'admin', active: true }
  return {
    ...echt,
    useStore: () => ({
      state: {
        settings: {
          grading: GRADING_DEFAULTS,
          documentHeader: { atoName: 'Aviation Academy Austria', approvalNumber: 'AT.ATO.106', formRevision: 'Rev 1' },
        },
        users: [mika],
        gradingRecords: store.records,
        timeOffsetMs: 0,
      },
      currentUser: mika,
      saveGradingRecord: vi.fn(),
      retryGradingMail: vi.fn(),
      gradingRecordById: (id: string) => store.records.find((r) => r.id === id),
    }),
  }
})

const pilot = (name = 'Emil Renew'): TraineeGrading => ({
  traineeName: name,
  traineeId: '',
  position: 'CDR',
  seat: 'Left',
  grades: [{ code: 'KNO', grade: 4, comment: '' }],
  positiveComment: '',
  developmentComment: '',
  summaryComment: '',
  overall: 'competent',
})

const blatt = (u: Partial<GradingRecord>): GradingRecord => ({
  id: 'r1',
  formTypeId: '308E',
  instructorId: 'u-mika',
  header: { aircraftType: 'C560 XLS+', date: '2026-11-01', event: 'Renewal Check', trainingDevice: 'FFS' },
  trainees: [pilot()],
  sessionStatus: 'completed',
  freeText: {},
  signatureInstructor: null,
  signatureTrainee: null,
  status: 'signed',
  mailStatus: 'sent',
  createdAt: 0,
  ...u,
})

/** Die Zeile (dt + dd) zu einer Beschriftung. */
const zeileZu = (label: string) => {
  const dt = screen.getAllByText(label).find((el) => el.tagName === 'DT')!
  return { zeile: dt.parentElement!, dd: dt.nextElementSibling as HTMLElement }
}

beforeEach(() => {
  store.records = []
})

describe('Kopfdaten im Ausdruck (Audit 11/2026, GTY-01)', () => {
  it('308E: „Topics Covered" ueber die volle Breite, mit Zeilenumbruechen, Beschriftung darueber', () => {
    const topics = 'Steep turns\nApproach to stall\nEngine failure after V1'
    store.records = [blatt({ header: { ...blatt({}).header, topicsCovered: topics } })]
    render(<GradingView recordId="r1" />)
    const { zeile, dd } = zeileZu('Topics Covered')
    expect(zeile).toHaveClass('sm:col-span-2', 'print:col-span-2')
    // Kein „flex justify-between": die Beschriftung teilt sich die Zeile nicht
    // mit einem Fliesstext, der sie zusammendrueckt.
    expect(zeile).not.toHaveClass('flex')
    expect(dd).toHaveClass('whitespace-pre-wrap', 'text-left')
    expect(dd.textContent).toBe(topics)
  })

  it('308H: Event-Mehrfachauswahl breit, je Eintrag ungetrennt', () => {
    store.records = [
      blatt({ formTypeId: '308H', header: { ...blatt({}).header, event: 'Adverse Weather, LVO / CAT II / CAT III, UPRT' } }),
    ]
    render(<GradingView recordId="r1" />)
    const { zeile, dd } = zeileZu('Event')
    expect(zeile).toHaveClass('sm:col-span-2', 'print:col-span-2', 'flex-wrap')
    const eintraege = [...dd.querySelectorAll('span')]
    // Das Komma gehoert zu seinem Eintrag — sonst stuende es nach einem
    // Umbruch am Anfang der Folgezeile.
    expect(eintraege.map((s) => s.textContent)).toEqual(['Adverse Weather,', 'LVO / CAT II / CAT III,', 'UPRT'])
    // Umbrochen wird zwischen den Eintraegen: jeder ein atomarer Block.
    eintraege.forEach((s) => expect(s).toHaveClass('inline-block', 'max-w-full'))
    expect(dd.textContent).toBe('Adverse Weather, LVO / CAT II / CAT III, UPRT')
  })

  it('308F: ein Eintrag, der allein breiter ist als die Zeile, darf in sich umbrechen', () => {
    // Gegenpruefung P2: Mit `whitespace-nowrap` stand „ATA21 Air
    // Conditioning / Environmental / Pressurization" bei 360 px ueber den
    // Rand — die ganze Seite liess sich waagerecht verschieben (gemessen:
    // scrollWidth 376 bei 360). `max-w-full` begrenzt den Block auf die
    // Zeile, darin bricht er an seinen Leerzeichen.
    const ata = 'ATA21 Air Conditioning / Environmental / Pressurization, ATA49 APU'
    store.records = [blatt({ formTypeId: '308F', header: { ...blatt({}).header, ataChapters: ata } })]
    render(<GradingView recordId="r1" />)
    const { dd } = zeileZu('Recurrent Training — Recurrent by ATA')
    const eintraege = [...dd.querySelectorAll('span')]
    expect(eintraege.map((s) => s.textContent)).toEqual(['ATA21 Air Conditioning / Environmental / Pressurization,', 'ATA49 APU'])
    eintraege.forEach((s) => expect(s).not.toHaveClass('whitespace-nowrap'))
    expect(dd).not.toHaveClass('whitespace-nowrap')
  })

  it('schmale Felder bleiben in einer Spalte; der Wert rueckt geschlossen unter die Beschriftung, statt sie zu quetschen', () => {
    store.records = [blatt({})]
    render(<GradingView recordId="r1" />)
    const { zeile, dd } = zeileZu('Aircraft Type')
    expect(zeile).not.toHaveClass('sm:col-span-2')
    expect(zeile).toHaveClass('flex', 'flex-wrap')
    expect(dd).toHaveClass('ml-auto', 'text-right')
    expect(dd).toHaveTextContent('C560 XLS+')
  })
})

describe('Personenzeile (Audit 11/2026, PRT-02)', () => {
  it('307A nennt „Participants (26)" statt „Pilot / Student Name"', () => {
    store.records = [
      blatt({
        formTypeId: '307A',
        header: { event: 'CRM Refresher', date: '2026-10-29', duration: '04:00', location: 'AAA Neusiedl', traineeName: '' },
        trainees: [],
        sessionStatus: null,
        attendance: Array.from({ length: 26 }, (_, i) => ({ name: `Jürgen Müller ${i + 1}`, signature: null })),
      }),
    ]
    render(<GradingView recordId="r1" />)
    expect(screen.getByText('Participants (26): Jürgen Müller 1 +25')).toBeInTheDocument()
    expect(screen.queryByText(/Pilot \/ Student Name/)).toBeNull()
  })

  it('308A behaelt „Pilot / Student Name" im Kopf und in den Kopfdaten', () => {
    store.records = [blatt({ formTypeId: '308A' })]
    render(<GradingView recordId="r1" />)
    expect(screen.getByText('Pilot / Student Name: Emil Renew')).toBeInTheDocument()
    expect(zeileZu('Pilot / Student Name').dd).toHaveTextContent('Emil Renew')
  })
})

describe('Fussnotenzeichen (Audit 11/2026, MOB-09)', () => {
  it('haengt mit geschuetztem Leerzeichen am letzten Wort', () => {
    store.records = [blatt({ formTypeId: '308A' })]
    render(<GradingView recordId="r1" />)
    // Ohne eigenen Normalisierer machte Testing Library aus dem geschuetzten
    // ein normales Leerzeichen — der Test saehe den Fehler nicht.
    const roh = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) }
    expect(screen.getByText('Not Competent / Additional training required\u00a0*', roh)).toBeInTheDocument()
    expect(screen.getByText('Session not completed\u00a0**', roh)).toBeInTheDocument()
    expect(screen.queryByText('Session not completed **', roh)).toBeNull()
  })
})
