import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { StoreProvider, useStore } from '../store'
import { ChatRoom } from './ChatRoom'

/**
 * Chat ohne Mitgliedschaft (Ebene 2, Audit 11/2026, KERN-19).
 *
 * Seit die Store-Aktionen den Handelnden fragen (storeRechte.ts), verwerfen
 * sie Nachricht, Umfrage und Stimme eines Nichtmitglieds. Der Superadmin
 * sieht aber jede Gruppe — ohne diese Pruefung in der Ansicht stand er vor
 * einem Eingabefeld und Abstimmknoepfen, die still nichts taten.
 */

let laden: ReturnType<typeof useStore> | null = null
function Griff() {
  laden = useStore()
  return null
}
const store = () => laden!

beforeEach(async () => {
  await i18n.changeLanguage('de')
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  const mittag = new Date(2026, 10, 2, 12, 0, 0)
  vi.setSystemTime(mittag)
  const ende = new Date(mittag)
  ende.setHours(23, 59, 59, 999)
  localStorage.setItem('aaa-user', 'u-patrick')
  localStorage.setItem('aaa-session-exp', String(ende.getTime()))
  // jsdom kennt kein scrollIntoView; der Chat rollt beim Zeichnen ans Ende.
  Element.prototype.scrollIntoView = () => {}
  laden = null
})

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

/** Chris legt eine eigene Gruppe mit Umfrage an — Alex ist dort nicht Mitglied. */
function gruppeOhneAlex(): void {
  act(() => store().switchUser('u-christian'))
  act(() => store().addGroup('Nur CL30-Admins', 'Test', 'CL30'))
  const id = store().state.groups.find((g) => g.name === 'Nur CL30-Admins')!.id
  act(() => store().createPoll(id, 'Passt Freitag?', 'yesno', [], Date.now() + 3 * 86_400_000))
  act(() => store().switchUser('u-patrick'))
}

describe('Chat: schreiben und abstimmen nur als Mitglied (KERN-19)', () => {
  it('Superadmin ohne Mitgliedschaft liest mit, bekommt aber kein Eingabefeld und keine Stimme', () => {
    // Ein Store fuer beide Schritte: Der Raum erscheint erst, wenn die
    // Gruppe da ist und Alex wieder angemeldet ist.
    function Raum() {
      const { state } = useStore()
      const g = state.groups.find((x) => x.name === 'Nur CL30-Admins')
      return g && state.currentUserId === 'u-patrick' ? <ChatRoom groupId={g.id} /> : null
    }
    render(
      <StoreProvider>
        <Griff />
        <Raum />
      </StoreProvider>,
    )
    gruppeOhneAlex()
    expect(screen.getByText('Du bist nicht Mitglied dieser Gruppe – mitlesen ja, schreiben und abstimmen nur als Mitglied.')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Nachricht …')).toBeNull()
    expect(screen.getByRole('button', { name: /^Ja/ })).toBeDisabled()
    // Die Umfrage selbst bleibt sichtbar — mitlesen ist erlaubt.
    expect(screen.getByText('Passt Freitag?')).toBeInTheDocument()
  })

  it('als Mitglied: Eingabefeld und Abstimmknoepfe wie gewohnt', () => {
    render(
      <StoreProvider>
        <Griff />
        <ChatRoom groupId="g-auto" />
      </StoreProvider>,
    )
    expect(screen.getByPlaceholderText('Nachricht …')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Ja/ })).toBeEnabled()
  })
})
