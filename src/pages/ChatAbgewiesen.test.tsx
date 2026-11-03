import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { ToastHost } from '../components/Toast'
import { StoreProvider, useStore } from '../store'
import { ChatInfo } from './ChatInfo'
import { ChatList } from './ChatList'
import { ChatRoom } from './ChatRoom'

/**
 * Ebene 2: Der Chat sagt, wenn etwas nicht geht (Audit 11/2026, KERN-08,
 * KERN-09, KERN-06, KERN-01).
 *
 * Nachgestellt im Audit: Text getippt, Enter — Eingabefeld leer, Nachricht
 * gibt es nicht. Umfrage mit vergangenem Datum — Dialog zu, Umfrage weg.
 * Gruppe „autothrottle" — Dialog zu, keine Gruppe. „Entfernen" bei Mikas
 * letzter Gruppe — nichts. Jetzt bleibt stehen, was getippt ist, und der
 * Grund steht da.
 *
 * Angemeldet ist Alex (Superadmin), Oberflaeche deutsch.
 */

let laden: ReturnType<typeof useStore> | null = null
function Griff() {
  laden = useStore()
  return null
}
const store = () => laden!
let rollen: ReturnType<typeof vi.fn<(o: ScrollToOptions) => void>>

beforeEach(async () => {
  await i18n.changeLanguage('de')
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  const mittag = new Date(2026, 10, 3, 12, 0, 0)
  vi.setSystemTime(mittag)
  const ende = new Date(mittag)
  ende.setHours(23, 59, 59, 999)
  localStorage.setItem('aaa-user', 'u-patrick')
  localStorage.setItem('aaa-session-exp', String(ende.getTime()))
  rollen = vi.fn<(o: ScrollToOptions) => void>()
  window.scrollTo = rollen as unknown as typeof window.scrollTo
  laden = null
})

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

const zeichne = (inhalt: React.ReactNode) =>
  render(
    <StoreProvider>
      <Griff />
      <ToastHost />
      {inhalt}
    </StoreProvider>,
  )

describe('Nachricht abgewiesen: Text bleibt, Grund steht da (KERN-08)', () => {
  it('Anhang ueber dem Limit wird schon beim Anfuegen abgewiesen', () => {
    zeichne(<ChatRoom groupId="g-defects" />)
    act(() => store().updateSettings({ maxUploadMB: 2 }))
    fireEvent.click(screen.getByRole('button', { name: 'Datei anhängen (max. 2 MB)' }))
    expect(screen.getByText(/ist 3\.2 MB groß — erlaubt sind 2 MB\./)).toBeInTheDocument()
    // Kein Anhang vorgemerkt: kein „… — Löschen"-Knopf fuer ihn.
    expect(screen.queryByRole('button', { name: /photo-\d+\.jpg — Löschen/ })).toBeNull()
  })

  it('Limit sinkt nach dem Anfuegen: Senden wird abgewiesen, Text und Anhang bleiben', () => {
    zeichne(<ChatRoom groupId="g-defects" />)
    fireEvent.click(screen.getByRole('button', { name: 'Datei anhängen (max. 25 MB)' }))
    const eingabe = screen.getByPlaceholderText('Nachricht …')
    fireEvent.change(eingabe, { target: { value: 'Wichtiger Text der nicht verloren geht' } })
    act(() => store().updateSettings({ maxUploadMB: 2 }))
    const vorher = store().state.messages.length
    fireEvent.keyDown(eingabe, { key: 'Enter' })
    expect(store().state.messages.length).toBe(vorher)
    expect(eingabe).toHaveValue('Wichtiger Text der nicht verloren geht')
    expect(screen.getByRole('button', { name: /photo-\d+\.jpg — Löschen/ })).toBeInTheDocument()
    expect(screen.getByText(/Nicht gesendet: Der Anhang ist größer als erlaubt \(max\. 2 MB\)/)).toBeInTheDocument()
  })

  it('Gutfall: gesendet — dann erst ist die Eingabe leer, und der Verlauf rollt ans Seitenende (KERN-01)', () => {
    zeichne(<ChatRoom groupId="g-defects" />)
    // Beim Oeffnen: ans Seitenende, nicht ein Anker an den Fensterrand.
    expect(rollen).toHaveBeenCalledWith({ top: document.documentElement.scrollHeight })
    rollen.mockClear()
    const eingabe = screen.getByPlaceholderText('Nachricht …')
    fireEvent.change(eingabe, { target: { value: 'Gegenprobe' } })
    fireEvent.keyDown(eingabe, { key: 'Enter' })
    expect(eingabe).toHaveValue('')
    expect(store().state.messages.at(-1)?.text).toBe('Gegenprobe')
    expect(rollen).toHaveBeenCalledTimes(1)
  })
})

describe('Umfrage-Dialog: Grund am Datumsfeld, Grenze der Aufbewahrung (KERN-08, KERN-09)', () => {
  const oeffnen = () => {
    zeichne(<ChatRoom groupId="g-defects" />)
    fireEvent.click(screen.getByRole('button', { name: 'Umfrage' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Passt Freitag?' } })
    return dialog
  }
  const datum = (dialog: HTMLElement) => dialog.querySelector('input[type="date"]') as HTMLInputElement

  it('nennt die Grenze und begrenzt den Kalender auf heute … Ende der Aufbewahrung (7 Tage)', () => {
    const dialog = oeffnen()
    expect(within(dialog).getByText(/Spätestens bis 10\.11\.2026 \d\d:\d\d UTC – dann löscht die Aufbewahrung der Gruppe \(7 Tage\)/)).toBeInTheDocument()
    expect(datum(dialog).min).toBe('2026-11-03')
    expect(datum(dialog).max).toBe('2026-11-10')
  })

  it('vergangenes Datum: Meldung am Feld, Erstellen gesperrt, Dialog bleibt', () => {
    const dialog = oeffnen()
    fireEvent.change(datum(dialog), { target: { value: '2026-10-01' } })
    expect(within(dialog).getByText('Dieser Zeitpunkt liegt in der Vergangenheit.')).toBeInTheDocument()
    expect(datum(dialog)).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByRole('button', { name: 'Umfrage erstellen' })).toBeDisabled()
  })

  it('jenseits der Aufbewahrung: Meldung, gesperrt; innerhalb: angelegt und zu', () => {
    const dialog = oeffnen()
    fireEvent.change(datum(dialog), { target: { value: '2026-11-21' } })
    expect(within(dialog).getByText(/Zu spät: Die Aufbewahrung der Gruppe löscht die Umfrage spätestens am 10\.11\.2026/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Umfrage erstellen' })).toBeDisabled()
    fireEvent.change(datum(dialog), { target: { value: '2026-11-06' } })
    const knopf = within(dialog).getByRole('button', { name: 'Umfrage erstellen' })
    expect(knopf).toBeEnabled()
    fireEvent.click(knopf)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(store().state.polls.some((p) => p.question === 'Passt Freitag?')).toBe(true)
  })
})

describe('Gruppe anlegen aus der Chatliste: vergebener Name (KERN-08)', () => {
  it('nennt den Grund am Feld und sperrt Speichern', () => {
    zeichne(<ChatList />)
    fireEvent.click(screen.getByRole('button', { name: 'Gruppe anlegen' }))
    const dialog = screen.getByRole('dialog')
    const name = within(dialog).getAllByRole('textbox')[0]
    fireEvent.change(name, { target: { value: 'autothrottle ' } })
    expect(within(dialog).getByText('Eine Gruppe mit diesem Namen gibt es bereits.')).toBeInTheDocument()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })
})

/*
 * Audit 11/2026, R3-DIALOGMELDUNG: Die Ablehnung kam als Toast — der liegt
 * im unteren Stapel UNTER dem Dialog, am iPhone vom Bottom-Sheet verdeckt.
 * Nachgestellt: Dialog offen, Name getippt, dann das Recht weg (Rolle in
 * einem anderen Tab geändert) — „Speichern" schien nichts zu tun.
 */
describe('Gruppe anlegen: Ablehnung steht IM Dialog (R3-DIALOGMELDUNG)', () => {
  it('Recht inzwischen entzogen: Grund in der Meldezeile, Dialog und Eingabe bleiben, kein Toast', () => {
    zeichne(<ChatList />)
    fireEvent.click(screen.getByRole('button', { name: 'Gruppe anlegen' }))
    const dialog = screen.getByRole('dialog')
    const name = within(dialog).getAllByRole('textbox')[0]
    fireEvent.change(name, { target: { value: 'Ground Ops Linz' } })
    // Ab jetzt handelt ein Mitglied — es darf keine Gruppen anlegen.
    act(() => store().switchUser('u-michael'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent(i18n.t('dialog.groupNotCreated'))
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(name).toHaveValue('Ground Ops Linz')
    expect(store().state.groups.some((g) => g.name === 'Ground Ops Linz')).toBe(false)
    // Nichts mehr im Toast-Stapel unter dem Dialog.
    const toasts = screen.getAllByRole('status').filter((s) => !dialog.contains(s))
    expect(toasts.map((s) => s.textContent).join('')).toBe('')
  })
})

describe('Chat-Info (KERN-08, KERN-06)', () => {
  it('„Entfernen" bei Mikas letzter erreichbarer Gruppe: gesperrt, mit Grund', () => {
    zeichne(<ChatInfo groupId="g-defects" />)
    const knopf = screen.getByRole('button', { name: 'Entfernen' })
    expect(knopf).toBeDisabled()
    expect(knopf).toHaveAccessibleDescription(/Mika Beispiel hätte sonst keine erreichbare Gruppe mehr/)
  })

  it('Stummschalten gilt nur fuer den eigenen Nutzer', () => {
    zeichne(<ChatInfo groupId="g-defects" />)
    const schalter = screen.getByRole('button', { name: /Benachrichtigungen stumm schalten/ })
    expect(schalter).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(schalter)
    expect(screen.getByRole('button', { name: /Benachrichtigungen stumm/ })).toHaveAttribute('aria-pressed', 'true')
    expect(store().state.mutedGroups).toEqual({ 'u-patrick': ['g-defects'] })
  })
})
