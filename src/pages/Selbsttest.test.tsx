import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import type { Ergebnis } from '../selbsttest'
import { StoreProvider, useStore } from '../store'
import { ToastHost } from '../components/Toast'

/**
 * Ebene 2: die Seite „Selbsttest" — wer welche Gruppe sieht, was die Zeilen
 * sagen und anbieten, und dass der Bericht dort ankommt, wo er hin soll.
 * Die Messungen sind ersetzt (selbsttestGeraet.dom.test.ts prüft sie).
 */

const ausfuehren = vi.fn<(o: { daten: boolean; docCheck: boolean }) => Promise<Ergebnis[]>>()
vi.mock('../selbsttestGeraet', async (orig) => ({
  ...(await orig<typeof import('../selbsttestGeraet')>()),
  selbsttestAusfuehren: (o: { daten: boolean; docCheck: boolean }) => ausfuehren(o),
}))
const { Selbsttest } = await import('./Selbsttest')

let laden: ReturnType<typeof useStore> | null = null
function Griff() {
  laden = useStore()
  return null
}

const GESUND: Ergebnis[] = [
  { id: 'speicher', gruppe: 'geraet', stufe: 'ok', werte: { ms: 4 } },
  { id: 'uhr', gruppe: 'geraet', stufe: 'ok' },
  { id: 'version', gruppe: 'geraet', stufe: 'ok', werte: { stand: '89abcdef' } },
]

beforeEach(async () => {
  await i18n.changeLanguage('de')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 4, 12, 0))
  localStorage.setItem('aaa-user', 'u-patrick')
  localStorage.setItem('aaa-session-exp', String(new Date(2026, 10, 4, 23, 59).getTime()))
  ausfuehren.mockReset()
  ausfuehren.mockResolvedValue(GESUND)
  window.location.hash = '#/selbsttest'
})

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Die Live-Region der Seite — die Toast-Anzeige ist ebenfalls eine, außerhalb von <main>. */
const kopf = () => within(screen.getByRole('main')).getByRole('status')

const zeichne = () =>
  render(
    <StoreProvider>
      <Griff />
      <ToastHost />
      <Selbsttest />
    </StoreProvider>,
  )

describe('Ablauf', () => {
  it('prüft beim Öffnen und meldet das Ergebnis in einer Live-Region', async () => {
    zeichne()
    expect(kopf()).toHaveTextContent('Prüfung läuft …')
    await waitFor(() => expect(kopf()).toHaveTextContent('Alles in Ordnung'))
    expect(screen.getByText('Schreiben und Lesen klappt (4 ms).')).toBeInTheDocument()
    expect(screen.getByText('Aktuell (Stand 89abcdef).')).toBeInTheDocument()
    expect(screen.getByText('Zuletzt geprüft: 04.11.2026 12:00')).toBeInTheDocument()
    // Der Lauf ist gemerkt — der Kurz-Check beim Start läuft heute nicht mehr
    expect(JSON.parse(localStorage.getItem('aaa-selbsttest-letzter')!)).toEqual({ zeit: new Date(2026, 10, 4, 12, 0).getTime(), stufe: 'ok' })
  })

  it('der Superadmin prüft Datenbestand und DocCheck mit; ein Mitglied nur das Gerät', async () => {
    zeichne()
    await waitFor(() => expect(ausfuehren).toHaveBeenCalled())
    expect(ausfuehren.mock.calls[0][0]).toMatchObject({ daten: true, docCheck: true })
    act(() => laden!.switchUser('u-michael'))
    await waitFor(() => expect(ausfuehren.mock.calls.at(-1)![0]).toMatchObject({ daten: false, docCheck: false }))
  })

  it('„Erneut prüfen" startet einen neuen Lauf; währenddessen ist der Knopf gesperrt', async () => {
    zeichne()
    const knopf = await screen.findByRole('button', { name: /Erneut prüfen/ })
    await waitFor(() => expect(knopf).toBeEnabled())
    let fertig: (e: Ergebnis[]) => void = () => undefined
    ausfuehren.mockReturnValueOnce(new Promise((ok) => (fertig = ok)))
    fireEvent.click(knopf)
    expect(knopf).toBeDisabled()
    await act(async () => fertig([{ id: 'speicher', gruppe: 'geraet', stufe: 'fehler' }]))
    expect(kopf()).toHaveTextContent('1 Fehler')
    expect(ausfuehren).toHaveBeenCalledTimes(2)
  })
})

describe('Zeilen und was sie anbieten', () => {
  it('Gruppen mit Überschrift, Stufe je Zeile; Kopf zählt Fehler, Hinweise und nicht prüfbare', async () => {
    ausfuehren.mockResolvedValue([
      { id: 'speicher', gruppe: 'geraet', stufe: 'ok', werte: { ms: 3 } },
      { id: 'dauerhaft', gruppe: 'geraet', stufe: 'hinweis' },
      { id: 'uhr', gruppe: 'geraet', stufe: 'fehler', variante: 'vorMinuten', zahl: 20 },
      { id: 'netz', gruppe: 'geraet', stufe: 'offen' },
      { id: 'fingerabdruck', gruppe: 'daten', stufe: 'fehler', zahl: 1, betroffen: ['gr7'] },
      { id: 'doccheckPruefen', gruppe: 'doccheck', stufe: 'ok' },
    ])
    zeichne()
    await waitFor(() => expect(kopf()).toHaveTextContent('2 Fehler · 1 Hinweis · 1 Punkt nicht prüfbar'))
    for (const g of ['Dieses Gerät', 'Datenbestand', 'DocCheck']) expect(screen.getByRole('region', { name: g })).toBeInTheDocument()
    const uhr = screen.getByText('Uhrzeit').closest('li')!
    expect(within(uhr).getByText('Fehler')).toBeInTheDocument()
    expect(within(uhr).getByText(/geht 20 Minuten vor/)).toBeInTheDocument()
    expect(screen.getByText('1 Formular wurde nach der Unterschrift verändert.')).toBeInTheDocument()
  })

  it('verändertes Formular: Knopf zum Formular; Konten: Knopf zur Benutzerverwaltung; sonst die Kennungen', async () => {
    ausfuehren.mockResolvedValue([
      { id: 'fingerabdruck', gruppe: 'daten', stufe: 'fehler', zahl: 1, betroffen: ['gr7'] },
      { id: 'muster', gruppe: 'daten', stufe: 'hinweis', zahl: 1, betroffen: ['u-michael'] },
      { id: 'gruppenVerweise', gruppe: 'daten', stufe: 'hinweis', zahl: 1, betroffen: ['g-ground'] },
    ])
    zeichne()
    fireEvent.click(await screen.findByRole('button', { name: 'Formular gr7 öffnen' }))
    expect(window.location.hash).toBe('#/grading/gr7')
    fireEvent.click(screen.getByRole('button', { name: 'Zur Benutzerverwaltung' }))
    expect(window.location.hash).toBe('#/admin/users')
    expect(screen.getByText('Betroffen: g-ground')).toBeInTheDocument()
  })

  it('Ablage nicht dauerhaft: Knopf fordert sie an und prüft danach neu', async () => {
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { ...navigator, storage: { persist } })
    ausfuehren.mockResolvedValue([{ id: 'dauerhaft', gruppe: 'geraet', stufe: 'hinweis' }])
    zeichne()
    const knopf = await screen.findByRole('button', { name: 'Dauerhafte Ablage anfordern' })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    fireEvent.click(knopf)
    expect(persist).toHaveBeenCalledOnce()
    await act(async () => vi.advanceTimersByTimeAsync(600))
    expect(ausfuehren).toHaveBeenCalledTimes(2)
  })

  it('neue Version oder Lücke im Offline-Speicher: „Neu laden"', async () => {
    const neuLaden = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: neuLaden })
    ausfuehren.mockResolvedValue([{ id: 'offline', gruppe: 'geraet', stufe: 'fehler', variante: 'fehlend', zahl: 2 }])
    zeichne()
    fireEvent.click(await screen.findByRole('button', { name: 'Neu laden' }))
    expect(neuLaden).toHaveBeenCalledOnce()
    expect(screen.getByText(/2 Dateien fehlen im Offline-Speicher/)).toBeInTheDocument()
  })
})

describe('Bericht', () => {
  it('kopieren: in die Zwischenablage, ohne Inhalte; ohne Zwischenablage ein Hinweis', async () => {
    const schreiben = vi.fn(async (_text: string) => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: schreiben } })
    zeichne()
    fireEvent.click(await screen.findByRole('button', { name: /Bericht kopieren/ }))
    await waitFor(() => expect(schreiben).toHaveBeenCalledOnce())
    const text = schreiben.mock.calls[0][0]
    expect(text).toContain('Selbsttest Instructor Connect')
    expect(text).toContain('Programmstand: 89abcdef')
    expect(text).toContain('[in Ordnung] Ablage — Schreiben und Lesen klappt (4 ms).')
    expect(text).not.toContain('Alex')
    await screen.findByText('Bericht in die Zwischenablage kopiert.')

    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    fireEvent.click(screen.getByRole('button', { name: /Bericht kopieren/ }))
    expect(await screen.findByText('Kopieren nicht möglich. Bericht stattdessen herunterladen.')).toBeInTheDocument()
  })

  it('herunterladen: Textdatei mit Datum im Namen', async () => {
    const erzeugt = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const klick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('selbsttest-2026-11-04.txt')
    })
    zeichne()
    fireEvent.click(await screen.findByRole('button', { name: /Bericht herunterladen/ }))
    expect(klick).toHaveBeenCalledOnce()
    expect((erzeugt.mock.calls[0][0] as Blob).type).toBe('text/plain;charset=utf-8')
  })
})
