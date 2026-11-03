import { afterEach, describe, expect, it, vi } from 'vitest'
import { fokusZurueck, seitenUeberschriftFokussieren } from './fokus'

/**
 * Rückfall des Tastaturfokus (Audit 11/2026, A11Y-03/A11Y-17): Nach dem
 * Schließen eines Dialogs oder nach der Anmeldung stand der Fokus auf
 * <body>. Ebene 2, weil Fokus nur in einem Dokument existiert.
 */

function seite(): { h1: HTMLElement; knopf: HTMLButtonElement } {
  document.body.innerHTML = '<h1 data-page-heading tabindex="-1">Notes</h1><button>Neue Notiz</button>'
  return { h1: document.querySelector('h1')!, knopf: document.querySelector('button')! }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('seitenUeberschriftFokussieren', () => {
  it('setzt den Fokus auf die Überschrift mit data-page-heading', () => {
    const { h1 } = seite()
    expect(seitenUeberschriftFokussieren()).toBe(true)
    expect(document.activeElement).toBe(h1)
  })

  it('rollt dabei nicht — die Überschrift steht in der klebenden Kopfleiste (KERN-01)', () => {
    const { h1 } = seite()
    const fokus = vi.spyOn(h1, 'focus')
    seitenUeberschriftFokussieren()
    expect(fokus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('ohne Überschrift bleibt der Fokus, wo er ist, und meldet das', () => {
    document.body.innerHTML = '<button>x</button>'
    expect(seitenUeberschriftFokussieren()).toBe(false)
    expect(document.activeElement).toBe(document.body)
  })

  it('eine Überschrift ohne tabindex nimmt den Fokus nicht an — das wird gemeldet, nicht behauptet', () => {
    document.body.innerHTML = '<h1 data-page-heading>ohne tabindex</h1>'
    expect(seitenUeberschriftFokussieren()).toBe(false)
  })
})

describe('fokusZurueck', () => {
  it('zurück auf den Auslöser, solange er da ist', () => {
    const { knopf } = seite()
    fokusZurueck(knopf)
    expect(document.activeElement).toBe(knopf)
  })

  it('Auslöser <body> (Dialog beim Laden geöffnet): auf die Seitenüberschrift', () => {
    const { h1 } = seite()
    fokusZurueck(document.body)
    expect(document.activeElement).toBe(h1)
  })

  it('kein Auslöser bekannt: auf die Seitenüberschrift', () => {
    const { h1 } = seite()
    fokusZurueck(null)
    expect(document.activeElement).toBe(h1)
  })

  it('Auslöser nicht mehr im Dokument (seine Zeile wurde gelöscht): auf die Seitenüberschrift', () => {
    const { h1, knopf } = seite()
    knopf.remove()
    fokusZurueck(knopf)
    expect(document.activeElement).toBe(h1)
  })

  it('Auslöser lehnt den Fokus ab (deaktiviert): auf die Seitenüberschrift', () => {
    const { h1, knopf } = seite()
    knopf.disabled = true
    fokusZurueck(knopf)
    expect(document.activeElement).toBe(h1)
  })
})
