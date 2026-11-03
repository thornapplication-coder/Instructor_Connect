import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { StoreProvider, useStore } from '../store'
import { ToastHost, useQuittung } from './Toast'

/**
 * Ebene 2: Die Quittung kommt erst nach dem Speichern (Audit 11/2026,
 * R3-SPEICHERQUITTUNG, TEC-12 Teil 2).
 *
 * Vorher stand „Notiz gespeichert" im selben Moment wie der Klick, und
 * gesichert wurde 400 ms später — auch dann noch grün, wenn das Schreiben
 * scheiterte. Hier mit echtem Store und fake-indexeddb: Im Erfolgsfall kommt
 * die Quittung nach dem Schreiben, bei einem erzwungenen Schreibfehler keine
 * Quittung, sondern „Nicht gespeichert".
 *
 * Gegenprobe: `useQuittung` zurück auf `toast(text)` ohne Warten →
 * „bei Schreibfehler" rot (die grüne Quittung erscheint).
 */

function Sonde() {
  const { saveNote, state } = useStore()
  const quittieren = useQuittung()
  return (
    <div>
      <p data-testid="notizen">{(state.notes ?? []).map((n) => n.title).join(',')}</p>
      <button
        onClick={() => {
          saveNote({ title: 'Briefing Notiz', body: 'Text' })
          void quittieren('Notiz gespeichert')
        }}
      >
        speichern
      </button>
    </div>
  )
}

/** Was in IndexedDB unter dem Stand liegt — roh, wie es ein Neuladen läse. */
function gespeicherterStand(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('instructor-connect', 1)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const lesen = req.result.transaction('kv').objectStore('kv').get('aaa-state')
      lesen.onsuccess = () => {
        req.result.close()
        resolve(String(lesen.result ?? ''))
      }
      lesen.onerror = () => reject(lesen.error)
    }
  })
}

const zeichne = () =>
  render(
    <StoreProvider>
      <ToastHost />
      <Sonde />
    </StoreProvider>,
  )

beforeEach(async () => {
  await i18n.changeLanguage('de')
  localStorage.setItem('aaa-user', 'u-patrick')
  const ende = new Date()
  ende.setHours(23, 59, 59, 999)
  localStorage.setItem('aaa-session-exp', String(ende.getTime()))
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('Quittung nach dem Speichern', () => {
  it('Erfolg: die Quittung kommt — aber erst nach dem Schreiben, nicht mit dem Klick', async () => {
    zeichne()
    fireEvent.click(screen.getByText('speichern'))
    // Im Speicher steht die Notiz sofort; gemeldet wird noch nichts.
    expect(screen.getByTestId('notizen')).toHaveTextContent('Briefing Notiz')
    expect(screen.queryByText('Notiz gespeichert')).toBeNull()
    expect(await screen.findByText('Notiz gespeichert')).toBeInTheDocument()
    expect(screen.queryByText(/Nicht gespeichert/)).toBeNull()
    // In dem Moment, in dem „gespeichert" steht, liegt die Notiz auch in der
    // Ablage — ein Neuladen fände sie.
    expect(await gespeicherterStand()).toContain('Briefing Notiz')
  })

  it('bei Schreibfehler: keine Erfolgsquittung, sondern „Nicht gespeichert"', async () => {
    zeichne()
    // Die Ablage voll: jede Schreib-Transaktion scheitert (wie in
    // persist.dom.test.ts an der Transaktion, nicht am Öffnen).
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new Error('voll')
    })
    fireEvent.click(screen.getByText('speichern'))
    expect(await screen.findByText(i18n.t('toast.saveFailed'))).toBeInTheDocument()
    expect(screen.queryByText('Notiz gespeichert')).toBeNull()
  })
})
