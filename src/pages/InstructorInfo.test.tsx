import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { StoreProvider, useStore } from '../store'
import { InstructorInfo } from './InstructorInfo'

/**
 * Ebene 2: Instructor Info — Gueltigkeit beim Anlegen und der Stern
 * (Audit 11/2026, KERN-12, KERN-20).
 *
 * Nachgestellt im Audit: „Gültig ab" in fuenf Tagen, „Gültig bis" vor
 * fuenf Tagen — Speichern ging, die Karte stand danach als „abgelaufen"
 * UND „Geplant" da, und die Zielgruppe sah den Eintrag nie.
 *
 * Angemeldet ist Alex (Superadmin), Oberflaeche deutsch.
 */

/** Was die Ansicht herunterladen wollte — Name und Inhalt (EXM-10/FN-01). */
const downloads: { name: string; inhalt: string }[] = []
vi.mock('../csv', async (original) => {
  const echt = await original<typeof import('../csv')>()
  return {
    ...echt,
    downloadCsv: (name: string, inhalt: string) => {
      downloads.push({ name, inhalt })
    },
  }
})

let laden: ReturnType<typeof useStore> | null = null
function Griff() {
  laden = useStore()
  return null
}
const store = () => laden!

beforeEach(async () => {
  await i18n.changeLanguage('de')
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  const mittag = new Date(2026, 10, 3, 12, 0, 0)
  vi.setSystemTime(mittag)
  const ende = new Date(mittag)
  ende.setHours(23, 59, 59, 999)
  localStorage.setItem('aaa-user', 'u-patrick')
  localStorage.setItem('aaa-session-exp', String(ende.getTime()))
  laden = null
  downloads.length = 0
})

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

const zeichne = () =>
  render(
    <StoreProvider>
      <Griff />
      <InstructorInfo />
    </StoreProvider>,
  )

/** Dialog „Neuer Eintrag" mit allem ausser der Gueltigkeit ausgefuellt. */
function dialogAusgefuellt(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: 'Neuer Eintrag' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Titel'), { target: { value: 'Sim-Wartung' } })
  const kategorie = within(dialog).getByLabelText('Kategorie') as HTMLSelectElement
  fireEvent.change(kategorie, { target: { value: kategorie.options[1].value } })
  fireEvent.change(within(dialog).getByLabelText('Text'), { target: { value: 'Am Freitag gesperrt.' } })
  return dialog
}

describe('Neuer Eintrag: „Gültig bis" vor „Gültig ab" (KERN-12)', () => {
  it('Meldung am Bis-Feld, Speichern gesperrt; gleicher Tag geht und speichert', () => {
    zeichne()
    const dialog = dialogAusgefuellt()
    const ab = within(dialog).getByLabelText('Gültig ab')
    const bis = within(dialog).getByLabelText('Gültig bis')
    const speichern = within(dialog).getByRole('button', { name: 'Speichern' })
    expect(speichern).toBeEnabled()

    fireEvent.change(ab, { target: { value: '2026-11-08' } })
    fireEvent.change(bis, { target: { value: '2026-10-29' } })
    expect(within(dialog).getByText('„Gültig bis“ liegt vor „Gültig ab“ – so wäre der Eintrag nie sichtbar.')).toBeInTheDocument()
    expect(bis).toHaveAttribute('aria-invalid', 'true')
    expect(bis).toHaveAccessibleDescription('„Gültig bis“ liegt vor „Gültig ab“ – so wäre der Eintrag nie sichtbar.')
    // Der Kalender bietet gar nichts davor an.
    expect(bis).toHaveAttribute('min', '2026-11-08')
    expect(ab).toHaveAttribute('max', '2026-10-29')
    expect(speichern).toBeDisabled()

    fireEvent.change(bis, { target: { value: '2026-11-08' } })
    expect(within(dialog).queryByText(/liegt vor „Gültig ab“/)).toBeNull()
    expect(bis).not.toHaveAttribute('aria-invalid')
    expect(speichern).toBeEnabled()
    fireEvent.click(speichern)
    const neu = store().state.infoEntries.find((e) => e.title === 'Sim-Wartung')
    expect(neu).toMatchObject({ validFrom: '2026-11-08', validUntil: '2026-11-08' })
  })

  it('je eine Seite leer: keine Meldung (leeres bis = UFN)', () => {
    zeichne()
    const dialog = dialogAusgefuellt()
    fireEvent.change(within(dialog).getByLabelText('Gültig bis'), { target: { value: '2026-10-29' } })
    expect(within(dialog).queryByText(/liegt vor „Gültig ab“/)).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeEnabled()
  })
})

describe('Stern mit Name und Zustand (KERN-20)', () => {
  it('meldet aria-pressed und schaltet um — vorher nur `title` und die Fuellung', () => {
    zeichne()
    const name = 'Für mich als wichtig markieren'
    const gedrueckt = () => screen.queryAllByRole('button', { name, pressed: true }).length
    const vorher = gedrueckt()
    const frei = screen.getAllByRole('button', { name, pressed: false })
    expect(frei.length).toBeGreaterThan(0)
    act(() => fireEvent.click(frei[0]))
    expect(gedrueckt()).toBe(vorher + 1)
    expect(store().starredInfoIds.size).toBe(vorher + 1)
  })
})

/**
 * Kontrollliste: Der Downloadname kommt aus `ackListeDateiName` (infoAcks.ts)
 * — mit Umlauten und dem Stand-Datum desselben Zeitpunkts wie im Dateikopf.
 * Vorher ersetzte die Ansicht mit `/[^\w-]+/` jeden Umlaut und liess das
 * Datum weg (Audit 11/2026, EXM-10/FN-01).
 */
describe('Kontrollliste exportieren: Dateiname (EXM-10/FN-01)', () => {
  it('behaelt Umlaute und traegt den Tag des Exports', () => {
    zeichne()
    act(() =>
      store().addInfoEntry({
        type: 'text',
        title: 'Änderung Lärmschutzverfahren Übung 2026',
        description: '',
        body: 'Neue Abflugstrecke.',
        category: store().state.settings.infoCategories[0],
        aircraftType: '',
        validFrom: '',
        validUntil: '',
        requiresAck: true,
      }),
    )
    for (const knopf of screen.getAllByRole('button', { name: 'Kontrollliste exportieren (CSV)' })) fireEvent.click(knopf)
    const unserer = downloads.find((d) => d.inhalt.includes('Änderung Lärmschutzverfahren Übung 2026'))
    expect(unserer?.name).toBe('read-confirmations_Änderung-Lärmschutzverfahren-Übung-2026_2026-11-03.csv')
    // Kopf und Name nennen denselben Tag.
    expect(unserer?.inhalt).toContain('03.11.2026')
    // Jeder Auszug traegt sein Datum — keiner wird zur „(1)"-Kopie.
    expect(downloads.length).toBeGreaterThan(1)
    for (const d of downloads) expect(d.name).toMatch(/^read-confirmations_.+_2026-11-03\.csv$/)
  })
})
