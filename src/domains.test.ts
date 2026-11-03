import { describe, expect, it } from 'vitest'
import { ausgesperrt, domainErlaubt, domainListe, domainSperre, neuAusgesperrt, normalisiereDomain, superadminAusgesperrt } from './domains'
import type { Role } from './types'

/**
 * Erlaubte Login-Domains (Audit 11/2026, VERW-05 und VERW-12).
 *
 * Nachgestellt: „@Example.Test" eingetragen, gespeichert wie getippt — die
 * Anmeldung verglich mit „@@example.test" und liess niemanden mehr hinein.
 * Und der Dialog „Benutzer anlegen" kannte die Liste gar nicht: Er legte
 * fremd.domain@gmail.com an, ein Konto, das sich nie anmelden kann.
 */

const konto = (email: string, role: Role = 'member', active = true) => ({ email, role, active })

describe('normalisiereDomain', () => {
  it("macht aus '@Example.Test ' die gespeicherte Schreibweise", () => {
    expect(normalisiereDomain('@Example.Test ')).toBe('example.test')
    expect(normalisiereDomain('  aviationacademy.at')).toBe('aviationacademy.at')
  })

  it('weist Ungueltiges ab, statt es zu speichern', () => {
    expect(normalisiereDomain('')).toBeNull()
    expect(normalisiereDomain('example')).toBeNull()
    expect(normalisiereDomain('exa mple.test')).toBeNull()
    expect(normalisiereDomain('max@example.test')).toBeNull()
    expect(normalisiereDomain('.example.test')).toBeNull()
  })
})

describe('domainErlaubt', () => {
  it('leere Liste = alles erlaubt', () => {
    expect(domainErlaubt('jemand@gmail.com', [])).toBe(true)
  })

  it('gmail.com ist bei [aviationacademy.at] nicht erlaubt — gilt fuer Dialog, Import und Anmeldung gleich', () => {
    expect(domainErlaubt('fremd.domain@gmail.com', ['aviationacademy.at'])).toBe(false)
    expect(domainErlaubt('Max.Muster@AviationAcademy.at ', ['aviationacademy.at'])).toBe(true)
  })

  it('vergleicht die ganze Domain, nicht ein Ende davon', () => {
    expect(domainErlaubt('x@sub.example.test', ['example.test'])).toBe(false)
    expect(domainErlaubt('x@badexample.test', ['example.test'])).toBe(false)
  })

  it('versteht einen Altbestand mit @ und Grossbuchstaben', () => {
    // Genau der Eintrag, der die ATO ausgesperrt hatte.
    expect(domainErlaubt('alex.beispiel@example.test', ['@Example.Test'])).toBe(true)
  })

  it('laesst eine Adresse ohne @ nie durch', () => {
    expect(domainErlaubt('keine-adresse', ['example.test'])).toBe(false)
  })
})

describe('ausgesperrt', () => {
  const users = [konto('alex@example.test', 'superadmin'), konto('mika@example.test'), konto('sam@aviationacademy.at'), konto('alt@example.test', 'member', false)]

  it('Entfernen der eigenen Domain meldet den Superadmin als ausgesperrt', () => {
    const weg = ausgesperrt(users, ['aviationacademy.at'])
    expect(weg.map((u) => u.email)).toEqual(['alex@example.test', 'mika@example.test'])
    expect(superadminAusgesperrt(users, ['aviationacademy.at'])).toBe(true)
  })

  it('zaehlt nur aktive Konten — ein deaktiviertes meldet sich ohnehin nicht an', () => {
    expect(ausgesperrt(users, ['aviationacademy.at']).some((u) => u.email === 'alt@example.test')).toBe(false)
  })

  it('leere Liste sperrt niemanden aus', () => {
    expect(ausgesperrt(users, [])).toEqual([])
    expect(superadminAusgesperrt(users, [])).toBe(false)
  })

  it('ein Superadmin, der noch passt, genuegt', () => {
    const zwei = [...users, konto('chef@aviationacademy.at', 'superadmin')]
    expect(superadminAusgesperrt(zwei, ['aviationacademy.at'])).toBe(false)
  })

  it('ohne aktiven Superadmin kann ihn auch keine Liste aussperren', () => {
    expect(superadminAusgesperrt([konto('a@x.test', 'superadmin', false)], ['y.test'])).toBe(false)
  })
})

describe('domainListe', () => {
  it('normalisiert, verwirft Ungueltiges und Doppeltes, behaelt die Reihenfolge', () => {
    expect(domainListe(['aviationacademy.at', '@Example.Test', 'EXAMPLE.test', 'kaputt'])).toEqual(['aviationacademy.at', 'example.test'])
  })
})

describe('Was eine Aenderung der Liste anrichtet', () => {
  const users = [
    { id: 'alex', email: 'alex@example.test', role: 'superadmin' as const, active: true },
    { id: 'chef', email: 'chef@aviationacademy.at', role: 'superadmin' as const, active: true },
    { id: 'mika', email: 'mika@example.test', role: 'member' as const, active: true },
    { id: 'gast', email: 'gast@gmail.com', role: 'member' as const, active: true },
  ]

  it('zaehlt nur, wer ZUSAETZLICH ausgesperrt wird', () => {
    const alt = ['example.test', 'aviationacademy.at']
    // gast passte schon vorher nicht — er zaehlt nicht mit.
    expect(neuAusgesperrt(users, alt, ['aviationacademy.at']).map((u) => u.id)).toEqual(['alex', 'mika'])
    // Die erste Domain in eine leere Liste: alle anderen fallen heraus.
    expect(neuAusgesperrt(users, [], ['example.test']).map((u) => u.id)).toEqual(['chef', 'gast'])
  })

  it('verweigert eine Liste, mit der der Handelnde selbst nicht mehr hineinkaeme', () => {
    expect(domainSperre(users, ['aviationacademy.at'], 'alex@example.test')).toBe('selbst')
    expect(domainSperre(users, ['aviationacademy.at'], 'chef@aviationacademy.at')).toBeNull()
  })

  it('verweigert eine Liste, mit der kein aktiver Superadmin mehr hineinkaeme', () => {
    expect(domainSperre(users, ['gmail.com'], null)).toBe('superadmin')
    expect(domainSperre(users, [], 'alex@example.test')).toBeNull()
  })
})
