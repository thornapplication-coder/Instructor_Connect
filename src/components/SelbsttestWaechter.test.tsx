import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import type { Ergebnis } from '../selbsttest'
import { StoreProvider } from '../store'

/**
 * Ebene 2: der Kurz-Check beim Start. Einmal am Tag, verzögert, ohne
 * DocCheck — und gemeldet werden nur Fehler, den Datenbestand nur dem, der
 * ihn prüfen darf.
 */

const ausfuehren = vi.fn<(o: { daten: boolean; docCheck: boolean }) => Promise<Ergebnis[]>>()
vi.mock('../selbsttestGeraet', async (orig) => ({
  ...(await orig<typeof import('../selbsttestGeraet')>()),
  selbsttestAusfuehren: (o: { daten: boolean; docCheck: boolean }) => ausfuehren(o),
}))
const { SelbsttestWaechter } = await import('./SelbsttestWaechter')

const MITTAG = new Date(2026, 10, 4, 12, 0).getTime()

beforeEach(async () => {
  await i18n.changeLanguage('de')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(MITTAG)
  localStorage.setItem('aaa-user', 'u-patrick')
  localStorage.setItem('aaa-session-exp', String(new Date(2026, 10, 4, 23, 59).getTime()))
  ausfuehren.mockReset()
  ausfuehren.mockResolvedValue([{ id: 'uhr', gruppe: 'geraet', stufe: 'ok' }])
  window.location.hash = '#/'
})

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

const zeichne = (aktiv = true, nutzer = 'u-patrick') => {
  localStorage.setItem('aaa-user', nutzer)
  return render(
    <StoreProvider>
      <SelbsttestWaechter aktiv={aktiv} verzoegerungMs={8000} />
    </StoreProvider>,
  )
}
const warten = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms))

describe('wann der Kurz-Check läuft', () => {
  it('erst nach der Verzögerung, ohne DocCheck, und gemerkt für den Tag', async () => {
    zeichne()
    await warten(7000)
    expect(ausfuehren).not.toHaveBeenCalled()
    await warten(1500)
    expect(ausfuehren).toHaveBeenCalledOnce()
    expect(ausfuehren.mock.calls[0][0]).toMatchObject({ daten: true, docCheck: false })
    expect(JSON.parse(localStorage.getItem('aaa-selbsttest-letzter')!)).toMatchObject({ stufe: 'ok' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('heute schon gelaufen: nicht noch einmal; abgeschaltet: nie', async () => {
    localStorage.setItem('aaa-selbsttest-letzter', JSON.stringify({ zeit: MITTAG - 3600_000, stufe: 'ok' }))
    zeichne()
    await warten(20_000)
    expect(ausfuehren).not.toHaveBeenCalled()
    localStorage.removeItem('aaa-selbsttest-letzter')
    zeichne(false)
    await warten(20_000)
    expect(ausfuehren).not.toHaveBeenCalled()
  })
})

describe('was er meldet', () => {
  it('Fehler am Gerät: roter Streifen; „Ansehen" führt zur Seite und schließt ihn', async () => {
    ausfuehren.mockResolvedValue([
      { id: 'uhr', gruppe: 'geraet', stufe: 'fehler', variante: 'vor', zahl: 30 },
      { id: 'dauerhaft', gruppe: 'geraet', stufe: 'hinweis' },
    ])
    zeichne()
    await warten(8100)
    expect(screen.getByRole('alert')).toHaveTextContent('Selbsttest: Auf diesem Gerät stimmt etwas nicht.')
    fireEvent.click(screen.getByRole('button', { name: 'Ansehen' }))
    expect(window.location.hash).toBe('#/selbsttest')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('nur Hinweise: kein Streifen — sie gehören auf die Seite', async () => {
    ausfuehren.mockResolvedValue([{ id: 'dauerhaft', gruppe: 'geraet', stufe: 'hinweis' }])
    zeichne()
    await warten(8100)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Fehler im Datenbestand: dem Superadmin gemeldet und schließbar', async () => {
    ausfuehren.mockResolvedValue([{ id: 'fingerabdruck', gruppe: 'daten', stufe: 'fehler', zahl: 1, betroffen: ['gr7'] }])
    zeichne()
    await warten(8100)
    expect(screen.getByRole('alert')).toHaveTextContent('Selbsttest: Im Datenbestand ist ein Fehler.')
    fireEvent.click(screen.getByRole('button', { name: 'Hinweis des Selbsttests schließen' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ein Mitglied prüft den Datenbestand nicht mit', async () => {
    zeichne(true, 'u-michael')
    await warten(8100)
    expect(ausfuehren.mock.calls[0][0]).toMatchObject({ daten: false, docCheck: false })
  })

  it('wer vor dem Ende abmeldet oder die Seite verlässt, bekommt keinen Streifen mehr', async () => {
    let fertig: (e: Ergebnis[]) => void = () => undefined
    ausfuehren.mockReturnValue(new Promise((ok) => (fertig = ok)))
    const { unmount } = zeichne()
    await warten(8100)
    unmount()
    await act(async () => fertig([{ id: 'speicher', gruppe: 'geraet', stufe: 'fehler' }]))
    expect(localStorage.getItem('aaa-selbsttest-letzter')).toBeNull()
  })
})
