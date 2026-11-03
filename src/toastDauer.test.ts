import { describe, expect, it } from 'vitest'
import { TOAST_MAX_MS, TOAST_MIN_MS, toastDauer } from './toastDauer'

/**
 * Sichtdauer der Bestätigung: Lange Hinweise verschwanden nach festen
 * 3,5 s mitten im Lesen (Gegenprüfung Audit 11/2026, Runde 1).
 */
describe('toastDauer', () => {
  it('kurze Bestätigungen bleiben bei der bisherigen Dauer', () => {
    expect(toastDauer('Notiz gespeichert')).toBe(TOAST_MIN_MS)
    expect(toastDauer('')).toBe(TOAST_MIN_MS)
  })

  it('längere Hinweise stehen länger — je Zeichen', () => {
    const lang = 'Nicht gesendet: Der Anhang ist größer als erlaubt (max. 10 MB). Entferne ihn – dein Text bleibt stehen.'
    expect(toastDauer(lang)).toBeGreaterThan(TOAST_MIN_MS)
    expect(toastDauer(`${lang} Noch ein Satz.`)).toBeGreaterThan(toastDauer(lang))
  })

  it('nie länger als die Obergrenze — auch nicht bei sehr langem Text', () => {
    expect(toastDauer('x'.repeat(5000))).toBe(TOAST_MAX_MS)
  })

  it('Leerraum am Rand zählt nicht mit', () => {
    const text = 'Formular unterschrieben und versendet. Der Nachweis liegt in der Ablage.'
    expect(toastDauer(`   ${text}   `)).toBe(toastDauer(text))
  })
})
