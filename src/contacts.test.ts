import { describe, expect, it } from 'vitest'
import { abteilungVon, kontaktFehler, kontaktGruppen, kontaktNormalisieren, mailLink, telefonGueltig, telefonLink } from './contacts'
import type { Contact } from './types'

/**
 * Who to call (Audit 11/2026, KERN-16): „Training" und „Training " waren
 * zwei Abteilungen, und Kontakte ohne Nummer oder Adresse boten Knoepfe,
 * die ins Leere fuehrten.
 */

const leer = { department: '', position: '', name: '', phone: '', email: '' }
const k = (id: string, department: string, name: string, extra: Partial<Contact> = {}): Contact => ({
  id,
  department,
  position: '',
  name,
  phone: '',
  email: '',
  ...extra,
})

describe('kontaktNormalisieren', () => {
  it('„Training " → „Training" — Rand weg, in allen Feldern', () => {
    expect(
      kontaktNormalisieren({ department: 'Training ', position: ' Training Admin', name: '  Sam Beispiel ', phone: ' +43 1 5550 300 ', email: ' sam@example.test ' }),
    ).toEqual({ department: 'Training', position: 'Training Admin', name: 'Sam Beispiel', phone: '+43 1 5550 300', email: 'sam@example.test' })
  })

  it('Leerzeichen im Innern zusammengezogen — auch in der Nummer; in der Adresse ganz weg', () => {
    const n = kontaktNormalisieren({ ...leer, department: 'Sim  Technik', phone: '+43 1   5550\t200', email: 'a b@example.test' })
    expect(n.department).toBe('Sim Technik')
    expect(n.phone).toBe('+43 1 5550 200')
    expect(n.email).toBe('ab@example.test')
  })

  it('leere Werte bleiben leer; die ID bleibt unberuehrt', () => {
    expect(kontaktNormalisieren({ ...leer, id: 'c9' })).toEqual({ ...leer, id: 'c9' })
    expect(kontaktNormalisieren({ ...leer, phone: '   ', email: ' ' })).toEqual(leer)
  })
})

describe('kontaktFehler', () => {
  it('Pflicht sind Abteilung und Name — Leerraum zaehlt nicht als Wert', () => {
    expect(kontaktFehler(leer)).toEqual(['department', 'name'])
    expect(kontaktFehler({ ...leer, department: '  ', name: 'X' })).toEqual(['department'])
  })

  it('Telefon und E-Mail duerfen fehlen', () => {
    expect(kontaktFehler({ ...leer, department: 'Training', name: 'Sam' })).toEqual([])
  })

  it('was dasteht, muss wie eine Nummer bzw. Adresse aussehen', () => {
    const basis = { ...leer, department: 'Training', name: 'Sam' }
    expect(kontaktFehler({ ...basis, phone: 'bitte anrufen' })).toEqual(['phone'])
    expect(kontaktFehler({ ...basis, email: 'sam(at)example' })).toEqual(['email'])
    expect(kontaktFehler({ ...basis, phone: '+43 1 5550 300', email: 'sam@example.test' })).toEqual([])
  })
})

describe('telefonGueltig', () => {
  it('uebliche Schreibweisen', () => {
    for (const p of ['+43 1 5550 300', '01/5550-300', '(01) 5550 300', '200', '+43.1.5550.300']) expect(telefonGueltig(p)).toBe(true)
  })
  it('zu kurz, zu lang, Buchstaben, „+" mitten drin', () => {
    for (const p of ['12', '1'.repeat(21), '0800-FLUGHAFEN', '43+1 5550', '']) expect(telefonGueltig(p)).toBe(false)
  })
})

describe('Links nur mit Ziel', () => {
  it('tel: nur Ziffern und fuehrendes „+"; ohne Nummer kein Link', () => {
    expect(telefonLink('+43 1 5550-300')).toBe('tel:+4315550300')
    expect(telefonLink('(01) 5550 300')).toBe('tel:015550300')
    expect(telefonLink('')).toBeNull()
    expect(telefonLink('   ')).toBeNull()
    expect(telefonLink(undefined)).toBeNull()
  })

  it('mailto: nur mit Adresse', () => {
    expect(mailLink('sam@example.test')).toBe('mailto:sam@example.test')
    expect(mailLink(' ')).toBeNull()
    expect(mailLink(undefined)).toBeNull()
  })
})

describe('kontaktGruppen', () => {
  const bestand = [
    k('c1', 'Training', 'Sam'),
    // Altbestand mit Leerraum — derselbe Abschnitt, kein zweiter Chip.
    k('c2', 'Training ', 'Alex'),
    k('c3', 'Sim-Technik', 'Daniel', { email: 'daniel@example.test' }),
  ]

  it('„Training" und „Training " sind EINE Abteilung', () => {
    const { abteilungen, gruppen } = kontaktGruppen(bestand, '', '')
    expect(abteilungen).toEqual(['Sim-Technik', 'Training'])
    expect(gruppen.map((g) => [g.department, g.contacts.map((c) => c.name)])).toEqual([
      ['Sim-Technik', ['Daniel']],
      ['Training', ['Alex', 'Sam']],
    ])
    expect(abteilungVon(bestand[1])).toBe('Training')
  })

  it('Filter auf die bereinigte Abteilung trifft auch den Altbestand', () => {
    const { gruppen, treffer } = kontaktGruppen(bestand, 'Training', '')
    expect(gruppen).toHaveLength(1)
    expect(treffer).toBe(2)
  })

  it('Suche: Abteilungen ohne Treffer bekommen keine Ueberschrift', () => {
    const { gruppen, treffer } = kontaktGruppen(bestand, '', 'daniel@')
    expect(gruppen.map((g) => g.department)).toEqual(['Sim-Technik'])
    expect(treffer).toBe(1)
    expect(kontaktGruppen(bestand, '', 'niemand').gruppen).toEqual([])
  })
})
