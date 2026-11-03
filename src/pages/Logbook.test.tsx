import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import type { LogbookStand } from '../logbook'
import type { GradingRecord, Role, User } from '../types'
import { Logbook } from './Logbook'

/**
 * Das Logbuch als Seite (Ebene 2, Audit 11/2026, P10). Die Regeln selbst
 * prueft logbook.test.ts; hier geht es darum, dass die Seite sie auch
 * benutzt — dass eine unlesbare Dauer das Speichern sperrt, statt still
 * 00:00 zu speichern, dass der Mustervorbehalt dasteht und dass sich ein
 * entfernter Formular-Eintrag zuruecknehmen laesst.
 *
 * Der Store ist ersetzt: Die Seite liest Nutzer, Formulare und Logbuch und
 * schreibt nur ueber die Logbuch-Aktionen — die werden mitgeschrieben.
 */

const store = vi.hoisted(() => ({
  records: [] as GradingRecord[],
  logbook: {} as Record<string, LogbookStand>,
  ich: null as unknown as User,
  users: [] as User[],
  override: vi.fn(),
  addManual: vi.fn(),
  csv: [] as string[],
  csvNamen: [] as string[],
}))

vi.mock('../store', async (original) => {
  const echt = await original<typeof import('../store')>()
  return {
    ...echt,
    useStore: () => ({
      state: {
        users: store.users,
        gradingRecords: store.records,
        logbook: store.logbook,
        timeOffsetMs: 0,
        settings: { aircraftTypes: ['CL30', 'C560 XLS+'] },
      },
      currentUser: store.ich,
      logbookOverride: store.override,
      logbookAddManual: store.addManual,
      logbookUpdateManual: vi.fn(),
      logbookDeleteManual: vi.fn(),
    }),
  }
})

vi.mock('../csv', async (original) => {
  const echt = await original<typeof import('../csv')>()
  return {
    ...echt,
    downloadCsv: (name: string, inhalt: string) => {
      store.csvNamen.push(name)
      store.csv.push(inhalt)
    },
  }
})

const person = (id: string, name: string, role: Role, aircraftTypes: string[] = []): User =>
  ({ id, name, role, aircraftTypes, active: true, email: `${id}@example.org` }) as User

const blatt = (over: Partial<GradingRecord> = {}): GradingRecord => ({
  id: 'r1',
  formTypeId: '308A',
  instructorId: 'u-mika',
  header: { date: '2026-08-10', aircraftType: 'C560 XLS+', flightTimePF: '02:00', flightTimePM: '02:00' },
  trainees: [{ traineeId: '', traineeName: 'Sophie Berger', position: 'CDR', grades: [], positiveComment: '', developmentComment: '', summaryComment: '', overall: null }],
  sessionStatus: null,
  freeText: {},
  signatureInstructor: 'sig',
  signatureTrainee: 'sig',
  status: 'signed',
  mailStatus: 'sent',
  createdAt: 1000,
  ...over,
})

const mika = person('u-mika', 'Mika Beispiel', 'member', ['C560 XLS+'])
const chris = person('u-chris', 'Chris Beispiel', 'group_admin', ['CL30'])

beforeEach(async () => {
  await i18n.changeLanguage('de')
  store.records = []
  store.logbook = {}
  store.ich = mika
  store.users = [mika, chris]
  store.override.mockReset()
  store.addManual.mockReset()
  store.csv = []
  store.csvNamen = []
})

describe('Ein Durchgang, eine Karte (LOG-01)', () => {
  it('zwei Piloten im selben Durchgang ergeben 05:30, nicht 11:00', () => {
    const pilot = (name: string) => [{ ...blatt().trainees[0], traineeName: name }]
    store.records = [blatt({ id: 'a', batchId: 'd', trainees: pilot('Sophie Berger') }), blatt({ id: 'b', batchId: 'd', trainees: pilot('Lukas Steiner') })]
    render(<Logbook />)
    expect(screen.getByText('Sophie Berger, Lukas Steiner')).toBeInTheDocument()
    expect(screen.getAllByText('05:30').length).toBeGreaterThan(0)
    expect(screen.queryByText('11:00')).not.toBeInTheDocument()
  })
})

describe('Dauer eingeben (KERN-02)', () => {
  const korrektur = () => {
    store.records = [blatt()]
    render(<Logbook />)
    fireEvent.click(screen.getByRole('button', { name: /Bearbeiten/ }))
    return screen.getByRole('dialog')
  }

  it('versteht „130" vom Ziffernblock als 1:30 und speichert es', () => {
    const dialog = korrektur()
    const session = within(dialog).getByLabelText('Session (HH:MM)')
    fireEvent.change(session, { target: { value: '130' } })
    fireEvent.blur(session)
    expect(session).toHaveValue('01:30')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    expect(store.override).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', blattIds: ['r1'] }), expect.objectContaining({ session: 90 }))
  })

  it('meldet „90", statt es still zu 00:00 zu machen — Speichern bleibt gesperrt', () => {
    const dialog = korrektur()
    const session = within(dialog).getByLabelText('Session (HH:MM)')
    fireEvent.change(session, { target: { value: '90' } })
    fireEvent.blur(session)
    expect(session).toHaveValue('90')
    expect(session).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('„90“ ist keine eindeutige Dauer')
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeDisabled()
    // Wird die Eingabe lesbar, ist die Meldung weg und Speichern frei.
    fireEvent.change(session, { target: { value: '1:30' } })
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeEnabled()
  })

  /* Der eigentliche Fall des Befunds: Ein EIGENER Eintrag liess sich am
     iPhone gar nicht speichern — der Ziffernblock hat keinen Doppelpunkt,
     und „130" wurde still zu 00:00, was Speichern sperrte. */
  it('eigener Eintrag: „130" vom Ziffernblock wird 1:30 und laesst sich speichern', () => {
    render(<Logbook />)
    fireEvent.click(screen.getByRole('button', { name: /Eintrag hinzufügen/ }))
    const dialog = screen.getByRole('dialog')
    const dauer = within(dialog).getByLabelText('Dauer (HH:MM)')
    expect(dauer).toHaveAttribute('inputmode', 'numeric')
    fireEvent.change(dauer, { target: { value: '130' } })
    fireEvent.blur(dauer)
    expect(dauer).toHaveValue('01:30')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    expect(store.addManual).toHaveBeenCalledWith(expect.objectContaining({ dauer: 90 }))
  })

  it('eigener Eintrag: „90" wird gemeldet und sperrt Speichern', () => {
    render(<Logbook />)
    fireEvent.click(screen.getByRole('button', { name: /Eintrag hinzufügen/ }))
    const dialog = screen.getByRole('dialog')
    const dauer = within(dialog).getByLabelText('Dauer (HH:MM)')
    fireEvent.change(dauer, { target: { value: '130' } })
    fireEvent.change(dauer, { target: { value: '90' } })
    fireEvent.blur(dauer)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('„90“ ist keine eindeutige Dauer')
    // Der zuletzt gueltige Wert (1:30) darf nicht still gespeichert werden.
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })

  it('laesst die Session nicht auf 00:00 korrigieren', () => {
    const dialog = korrektur()
    const session = within(dialog).getByLabelText('Session (HH:MM)')
    fireEvent.change(session, { target: { value: '0' } })
    fireEvent.blur(session)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('über 00:00')
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })
})

describe('Mustervorbehalt beim fremden Logbuch (KERN-03)', () => {
  beforeEach(() => {
    store.ich = chris
    store.records = ['m1', 'm2', 'm3'].map((id, i) => blatt({ id, header: { ...blatt().header, date: `2026-08-0${i + 1}` } }))
  })

  it('sagt, dass nur die eigenen Muster zu sehen sind — statt „noch keine Eintraege"', () => {
    render(<Logbook />)
    fireEvent.change(screen.getByLabelText('Logbuch von'), { target: { value: 'u-mika' } })
    expect(screen.getByRole('note')).toHaveTextContent('nur Einträge in deinen Mustern (CL30)')
    expect(screen.getByRole('note')).toHaveTextContent('3 weitere Einträge sind nicht sichtbar.')
    expect(screen.getByText(/In deinen Mustern \(CL30\) hat Mika Beispiel keine Einträge/)).toBeInTheDocument()
    expect(screen.queryByText(/Noch keine Einträge/)).not.toBeInTheDocument()
  })

  it('der Export nennt den Bereich und die nicht gezeigten Eintraege', () => {
    render(<Logbook />)
    fireEvent.change(screen.getByLabelText('Logbuch von'), { target: { value: 'u-mika' } })
    fireEvent.click(screen.getByRole('button', { name: /CSV-Export/ }))
    expect(store.csv[0]).toContain('Aircraft type;CL30 (scope of viewer)\n')
    expect(store.csv[0]).toContain('Outside scope (not shown);3\n')
    expect(store.csv[0]).toContain(';Exported by;Chris Beispiel\n')
    // Name nach dem gemeinsamen Schema mit Stand-Datum (EXM-10/FN-01) —
    // der Name des Inhabers, nicht des Exportierenden.
    expect(store.csvNamen[0]).toMatch(/^aaa-logbook_Mika-Beispiel_\d{4}-\d{2}-\d{2}\.csv$/)
  })
})

describe('Korrigierte Zeiten sind markiert (KERN-04)', () => {
  it('zeigt „Korrigiert" und die Zeit laut Formular', () => {
    store.records = [blatt()]
    store.logbook = { 'u-mika': { overrides: { r1: { session: 0 } }, manuell: [] } }
    render(<Logbook />)
    expect(screen.getByText('Korrigiert')).toBeInTheDocument()
    expect(screen.getByText('Laut Formular: 05:30')).toBeInTheDocument()
  })
})

describe('Entfernte Formular-Eintraege (KERN-05)', () => {
  it('lassen sich im eigenen Logbuch wiederherstellen', () => {
    store.records = [blatt()]
    store.logbook = { 'u-mika': { overrides: { r1: { geloescht: true } }, manuell: [] } }
    render(<Logbook />)
    const auf = screen.getByRole('button', { name: 'Entfernte Formular-Einträge (1)' })
    expect(auf).toHaveAttribute('aria-expanded', 'false')
    // Der Fokusring liegt innen: Die Ueberschrift kuerzt mit overflow hidden
    // und schnitt einen Ring mit Abstand nach aussen ab (Gegenpruefung P10).
    expect(auf.className).toContain('focus-visible:-outline-offset-2')
    fireEvent.click(auf)
    expect(auf).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Wiederherstellen/ }))
    expect(store.override).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), null)
  })

  it('der Loeschdialog sagt, dass sich ein Formular-Eintrag zuruecknehmen laesst', () => {
    store.records = [blatt()]
    const frage = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Logbook />)
    fireEvent.click(screen.getByRole('button', { name: /Löschen/ }))
    expect(frage.mock.calls[0][0]).toContain('wiederherstellen')
    expect(store.override).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), { geloescht: true })
    frage.mockRestore()
  })

  it('stehen nicht im fremden Logbuch', () => {
    store.ich = person('u-sa', 'Super Admin', 'superadmin')
    store.users = [store.ich, mika]
    store.records = [blatt()]
    store.logbook = { 'u-mika': { overrides: { r1: { geloescht: true } }, manuell: [] } }
    render(<Logbook />)
    fireEvent.change(screen.getByLabelText('Logbuch von'), { target: { value: 'u-mika' } })
    expect(screen.queryByRole('button', { name: /Entfernte Formular-Einträge/ })).not.toBeInTheDocument()
  })
})

describe('308G ohne Zeit (GTY-03)', () => {
  it('sagt „Zeit fehlt" statt Session 00:00 — und bietet im eigenen Logbuch „Zeit ergänzen"', () => {
    store.records = [blatt({ formTypeId: '308G', header: { date: '2026-08-10', aircraftType: 'C560 XLS+' } })]
    render(<Logbook />)
    expect(screen.getByText('Zeit fehlt')).toBeInTheDocument()
    // Testing Library fasst Leerraum (auch U+00A0) zu einem Leerzeichen
    // zusammen; das geschuetzte Leerzeichen selbst prueft i18n.test.ts.
    expect(screen.getByText(/Session —/)).toBeInTheDocument()
    expect(screen.queryByText(/Session 00:00/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Zeit ergänzen/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Session (HH:MM)'), { target: { value: '300' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    expect(store.override).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), expect.objectContaining({ session: 180 }))
  })

  it('ein 308G mit Session Time zaehlt sie', () => {
    store.records = [blatt({ formTypeId: '308G', header: { date: '2026-08-10', aircraftType: 'C560 XLS+', sessionTime: '03:00' } })]
    render(<Logbook />)
    expect(screen.queryByText('Zeit fehlt')).not.toBeInTheDocument()
    expect(screen.getByText(/Session 03:00/)).toBeInTheDocument()
  })
})

describe('Darstellung (UID-15, UID-11, MOB-10)', () => {
  it('„Löschen" in voller Gefahrenfarbe — /80 lag im Dunkelmodus bei 4,06:1', () => {
    store.records = [blatt()]
    render(<Logbook />)
    const loeschen = screen.getByRole('button', { name: /Löschen/ })
    expect(loeschen.className).toMatch(/(?:^|\s)text-danger(?:\s|$)/)
    expect(loeschen.className).not.toMatch(/text-danger\//)
  })

  it('der Platzhalter „Pilot" nutzt die Hinweisfarbe statt Browser-Grau', () => {
    render(<Logbook />)
    expect(screen.getByLabelText('Pilot').className).toContain('placeholder:text-dim')
  })

  it('Filter am Telefon als Raster aus zwei Spalten, Von/Bis mit Beschriftung darueber', () => {
    render(<Logbook />)
    const von = screen.getByLabelText('Von')
    const zeile = von.closest('label')!.parentElement!
    expect(zeile.className).toContain('grid-cols-2')
    expect(von.closest('label')!.className).toContain('flex-col')
    for (const name of ['Muster', 'Kategorie', 'Formulartyp', 'Pilot']) expect(within(zeile).getByLabelText(name).className, name).toContain('w-full')
  })
})
