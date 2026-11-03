import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { VERLAUF_SCHRITT } from '../chatRules'
import { formatDateTime } from '../datum'
import { StoreProvider, useStore } from '../store'
import { ChatInfo } from './ChatInfo'
import { ChatRoom } from './ChatRoom'

/**
 * Ebene 2: Verlauf, Umfrage und Bedienung des Chats (Audit 11/2026, TEC-10,
 * KERN-15, KERN-20, A11Y-07, A11Y-08, A11Y-10, MOB-05).
 *
 * Gezaehlt wird, wie oft eine Nachrichtenblase zeichnet, ueber ihre
 * Zeitangabe: Jede Blase ruft beim Zeichnen genau einmal `formatDateTime`.
 * Die Funktion bleibt echt, sie wird nur mitgezaehlt.
 *
 * Angemeldet ist Alex (Superadmin), Oberflaeche deutsch. Seed: „SIM
 * Defects" mit Alex und Mika, „Ground Training" (ohne Muster) mit Alex und
 * Chris als Admin.
 */
vi.mock('../datum', async (original) => {
  const echt = await original<typeof import('../datum')>()
  return { ...echt, formatDateTime: vi.fn(echt.formatDateTime) }
})
const zeichnungen = vi.mocked(formatDateTime)

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
  window.scrollTo = (() => {}) as typeof window.scrollTo
  laden = null
  zeichnungen.mockClear()
})

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const zeichne = (inhalt: React.ReactNode) =>
  render(
    <StoreProvider>
      <Griff />
      {inhalt}
    </StoreProvider>,
  )

/** Blasen im Verlauf — direkte Kinder von <main>, wie in e2e/mobil.spec.ts. */
const blasen = (container: HTMLElement) => container.querySelectorAll('main > div')

describe('Tippen zeichnet den Verlauf nicht neu (TEC-10)', () => {
  it('zehn Zeichen: keine Blase zeichnet neu — vorher jede Blase je Zeichen', () => {
    zeichne(<ChatRoom groupId="g-defects" />)
    expect(zeichnungen.mock.calls.length).toBeGreaterThan(0)
    zeichnungen.mockClear()
    const eingabe = screen.getByRole('textbox', { name: 'Nachricht schreiben' })
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) fireEvent.change(eingabe, { target: { value: 'x'.repeat(n) } })
    expect(eingabe).toHaveValue('xxxxxxxxxx')
    expect(zeichnungen).not.toHaveBeenCalled()
  })

  it('eine neue Nachricht zeichnet nur ihre eigene Blase', () => {
    zeichne(<ChatRoom groupId="g-defects" />)
    zeichnungen.mockClear()
    const eingabe = screen.getByRole('textbox', { name: 'Nachricht schreiben' })
    fireEvent.change(eingabe, { target: { value: 'Neu' } })
    fireEvent.keyDown(eingabe, { key: 'Enter' })
    expect(store().state.messages.at(-1)?.text).toBe('Neu')
    expect(zeichnungen).toHaveBeenCalledTimes(1)
  })

  it('Loeschen wirkt weiter ueber die stabile Funktion — auch nach Aenderungen im Store', () => {
    zeichne(<ChatRoom groupId="g-defects" />)
    const eingabe = screen.getByRole('textbox', { name: 'Nachricht schreiben' })
    fireEvent.change(eingabe, { target: { value: 'Gleich weg' } })
    fireEvent.keyDown(eingabe, { key: 'Enter' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const blase = screen.getByText('Gleich weg').closest('main > div') as HTMLElement
    fireEvent.click(within(blase).getByRole('button', { name: 'Löschen' }))
    expect(store().state.messages.some((m) => m.text === 'Gleich weg')).toBe(false)
  })
})

describe('Lange Verlaeufe schrittweise (TEC-10)', () => {
  const fuellen = (n: number) =>
    act(() => {
      for (let i = 0; i < n; i++) store().sendMessage('g-ground', `Nr. ${i}`)
    })

  it('zeigt die juengsten Eintraege; „Ältere anzeigen" laedt nach, bis nichts mehr davor liegt', () => {
    const { container } = zeichne(<ChatRoom groupId="g-ground" />)
    fuellen(VERLAUF_SCHRITT + 40)
    const gesamt = store().visibleMessages('g-ground').length + store().visiblePolls('g-ground').length
    expect(blasen(container)).toHaveLength(VERLAUF_SCHRITT)
    // Die juengste steht da, die aelteste noch nicht.
    expect(screen.getByText(`Nr. ${VERLAUF_SCHRITT + 39}`)).toBeInTheDocument()
    expect(screen.queryByText('Nr. 0')).toBeNull()
    const knopf = screen.getByRole('button', { name: `Ältere Einträge anzeigen (noch ${gesamt - VERLAUF_SCHRITT} davor)` })
    fireEvent.click(knopf)
    expect(blasen(container)).toHaveLength(gesamt)
    expect(screen.getByText('Nr. 0')).toBeInTheDocument()
    // Nichts mehr davor: Der Knopf ist weg, der Fokus steht im Verlauf statt im Leeren.
    expect(screen.queryByRole('button', { name: /Ältere Einträge anzeigen/ })).toBeNull()
    expect(document.activeElement).toBe(container.querySelector('main'))
  })

  it('kurzer Verlauf: kein Knopf', () => {
    zeichne(<ChatRoom groupId="g-defects" />)
    expect(screen.queryByRole('button', { name: /Ältere Einträge anzeigen/ })).toBeNull()
  })
})

describe('Umfrage: Anteile, Wahl, Schliessen (KERN-15, A11Y-08, MOB-05)', () => {
  /** Drei Optionen in „Ground Training", je eine Stimme von Alex, Chris, Mika. */
  function dreiGleiche(): string {
    act(() => {
      store().setGroupMembers('g-ground', ['u-patrick', 'u-christian', 'u-michael'])
    })
    act(() => {
      store().createPoll('g-ground', 'Welcher Tag?', 'multi', ['A', 'B', 'C'], Date.now() + 2 * 86_400_000)
    })
    const id = store().state.polls.find((p) => p.question === 'Welcher Tag?')!.id
    act(() => store().vote(id, 0))
    act(() => store().switchUser('u-christian'))
    act(() => store().vote(id, 1))
    act(() => store().switchUser('u-michael'))
    act(() => store().vote(id, 2))
    act(() => store().switchUser('u-patrick'))
    return id
  }

  /** Der Raum erscheint erst, wenn Alex wieder angemeldet ist. */
  function Raum() {
    const { state } = useStore()
    return state.currentUserId === 'u-patrick' ? <ChatRoom groupId="g-ground" /> : null
  }

  it('drei gleich starke Optionen: 34 + 33 + 33 = 100 % — vorher 99 %', () => {
    zeichne(<Raum />)
    dreiGleiche()
    const karte = screen.getByText('Welcher Tag?').parentElement!
    const prozente = within(karte)
      .getAllByText(/^1 · \d+%$/)
      .map((el) => Number(/(\d+)%/.exec(el.textContent!)![1]))
    expect(prozente).toEqual([34, 33, 33])
  })

  it('die eigene Wahl traegt aria-pressed — nicht nur Fettschrift und Farbe', () => {
    zeichne(<Raum />)
    dreiGleiche()
    const karte = screen.getByText('Welcher Tag?').parentElement!
    expect(within(karte).getByRole('button', { pressed: true })).toHaveTextContent(/^A/)
    expect(within(karte).getAllByRole('button', { pressed: false })).toHaveLength(2)
  })

  it('„Umfrage schließen" fragt nach; abgelehnt bleibt sie offen, bestaetigt schliesst sie', () => {
    zeichne(<Raum />)
    const id = dreiGleiche()
    // Alex ist Autor der Umfrage.
    const frage = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Umfrage schließen' }))
    expect(frage).toHaveBeenCalledWith('Umfrage jetzt schließen? Danach kann niemand mehr abstimmen oder seine Stimme ändern.')
    expect(store().state.polls.find((p) => p.id === id)!.closed).toBe(false)
    frage.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Umfrage schließen' }))
    expect(store().state.polls.find((p) => p.id === id)!.closed).toBe(true)
  })
})

describe('Namen statt Platzhalter (KERN-20, A11Y-07, A11Y-10)', () => {
  it('Umfrage-Dialog: Datum und Uhrzeit haben je einen eigenen Namen, die Gruppe die Ueberschrift', () => {
    zeichne(<ChatRoom groupId="g-defects" />)
    fireEvent.click(screen.getByRole('button', { name: 'Umfrage' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('group', { name: 'Gültig bis (UTC) *' })).toBeInTheDocument()
    const datum = within(dialog).getByLabelText('Datum (UTC)')
    const zeit = within(dialog).getByLabelText('Uhrzeit (UTC)')
    expect(datum).toHaveAttribute('type', 'date')
    expect(zeit).toHaveAttribute('type', 'time')
    // Der Hinweis beschreibt, statt Teil des Namens zu sein.
    expect(zeit).toHaveAccessibleDescription(/Datum und Uhrzeit gelten in UTC/)
    expect(datum).toHaveAccessibleName('Datum (UTC)')
  })

  it('Umfrage-Optionen: Name bleibt, auch wenn getippt ist', () => {
    zeichne(<ChatRoom groupId="g-defects" />)
    fireEvent.click(screen.getByRole('button', { name: 'Umfrage' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mehrfachauswahl' }))
    const option = within(dialog).getByRole('textbox', { name: 'Option 1' })
    fireEvent.change(option, { target: { value: 'Montag' } })
    expect(within(dialog).getByRole('textbox', { name: 'Option 1' })).toHaveValue('Montag')
  })

  it('Chat-Eingabe: eigener Name, Rand im Feldton, lesbarer Platzhalter', () => {
    zeichne(<ChatRoom groupId="g-defects" />)
    const eingabe = screen.getByRole('textbox', { name: 'Nachricht schreiben' })
    expect(eingabe).toHaveAttribute('placeholder', 'Nachricht …')
    expect(eingabe.className).toContain('border-field')
    expect(eingabe.className).toContain('placeholder:text-dim')
    expect(eingabe.className).not.toContain('border-line/10')
  })
})

describe('Chat-Info: „Entfernen" mit Rueckfrage und 44 px (MOB-05)', () => {
  it('fragt nach; abgelehnt bleibt das Mitglied, bestaetigt geht es', () => {
    // Mika in „Ground Training" dazu — dort ist er entfernbar (er hat noch „SIM Defects").
    zeichne(<ChatInfo groupId="g-ground" />)
    act(() => {
      store().setGroupMembers('g-ground', ['u-patrick', 'u-christian', 'u-michael'])
    })
    const zeile = screen.getByText('Mika Beispiel').closest('li') as HTMLElement
    const knopf = within(zeile).getByRole('button', { name: 'Entfernen' })
    expect(knopf.className).toContain('min-h-11')
    const frage = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(knopf)
    expect(frage).toHaveBeenCalledWith(
      'Mika Beispiel aus „Ground Training“ entfernen? Der Gruppenchat ist für Mika Beispiel danach nicht mehr erreichbar.',
    )
    expect(store().state.groups.find((g) => g.id === 'g-ground')!.memberIds).toContain('u-michael')
    frage.mockReturnValue(true)
    fireEvent.click(knopf)
    expect(store().state.groups.find((g) => g.id === 'g-ground')!.memberIds).not.toContain('u-michael')
  })

  it('geht dabei der letzte Admin, kommt EINE Frage — die des Admin-Panels', () => {
    zeichne(<ChatInfo groupId="g-ground" />)
    // Chris steht auch als Admin-Marke oben — gemeint ist seine Zeile.
    const zeile = screen.getAllByText('Chris Beispiel').map((el) => el.closest('li')).find(Boolean) as HTMLElement
    const frage = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(within(zeile).getByRole('button', { name: 'Entfernen' }))
    expect(frage).toHaveBeenCalledTimes(1)
    expect(frage.mock.calls[0][0]).toMatch(/hätte danach keinen Admin mehr/)
  })
})
