import { describe, expect, it } from 'vitest'
import { NACHFRIST_MS, sitzungsSchritt, type SitzungsLage } from './sitzungsablauf'

/**
 * Audit 11/2026, TEC-04: Um Mitternacht kam im laufenden Formular binnen
 * fünf Sekunden die Anmeldung — die vor Mitternacht geleisteten
 * Unterschriften waren weg. Geprüft wird jede Kombination der vier Angaben.
 */

const MITTERNACHT = Date.UTC(2026, 10, 2, 23, 0, 0)
const lage = (p: Partial<SitzungsLage>): SitzungsLage => ({ ablauf: MITTERNACHT, jetzt: MITTERNACHT - 60_000, gesperrt: false, offeneArbeit: false, ...p })

describe('sitzungsSchritt', () => {
  it('vor dem Ablauf: bleiben — mit und ohne offene Arbeit', () => {
    expect(sitzungsSchritt(lage({}))).toBe('bleiben')
    expect(sitzungsSchritt(lage({ offeneArbeit: true }))).toBe('bleiben')
  })

  it('abgelaufen ohne offene Arbeit: abmelden', () => {
    expect(sitzungsSchritt(lage({ jetzt: MITTERNACHT }))).toBe('abmelden')
    expect(sitzungsSchritt(lage({ jetzt: MITTERNACHT + 22_000 }))).toBe('abmelden')
  })

  it('abgelaufen MIT offener Arbeit: warnen statt abmelden (der Fall aus dem Audit)', () => {
    expect(sitzungsSchritt(lage({ jetzt: MITTERNACHT, offeneArbeit: true }))).toBe('warnen')
    expect(sitzungsSchritt(lage({ jetzt: MITTERNACHT + 22_000, offeneArbeit: true }))).toBe('warnen')
    expect(sitzungsSchritt(lage({ jetzt: MITTERNACHT + NACHFRIST_MS - 1, offeneArbeit: true }))).toBe('warnen')
  })

  it('die Nachfrist hat eine Obergrenze — ein vergessenes Formular hält die Anmeldung nicht ewig', () => {
    expect(NACHFRIST_MS).toBe(2 * 60 * 60 * 1000)
    expect(sitzungsSchritt(lage({ jetzt: MITTERNACHT + NACHFRIST_MS, offeneArbeit: true }))).toBe('abmelden')
  })

  it('gesperrt: immer sofort abmelden, auch mit offener Arbeit und vor dem Ablauf', () => {
    for (const jetzt of [MITTERNACHT - 60_000, MITTERNACHT + 60_000])
      for (const offeneArbeit of [false, true]) expect(sitzungsSchritt(lage({ jetzt, offeneArbeit, gesperrt: true }))).toBe('abmelden')
  })

  it('in einem anderen Tab ausdrücklich abgemeldet: abmelden, auch mit offener Arbeit', () => {
    expect(sitzungsSchritt(lage({ ablauf: 0, offeneArbeit: true }))).toBe('abmelden')
    expect(sitzungsSchritt(lage({ ablauf: 0 }))).toBe('abmelden')
  })
})
