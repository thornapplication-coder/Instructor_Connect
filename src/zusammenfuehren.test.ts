import { describe, expect, it } from 'vitest'
import { basisWaehlen, gleich, kopfAus, kopfLesen, standNachricht, standZusammenfuehren, type Stammstand } from './zusammenfuehren'

/**
 * Ebene 1: Zusammenführen der Stände zweier Tabs (Audit 11/2026, TEC-13).
 *
 * Vorher galt „der Jüngere gewinnt" für den ganzen Stand: Eine Änderung,
 * die binnen ~400 ms nach einer Änderung im anderen Tab gemacht wurde, war
 * weg — lautlos und auch nach dem Neuladen.
 */

interface Notiz {
  id: string
  text: string
  mailError?: string
}
interface Stand {
  notes: Notiz[]
  seen: Record<string, { chat: Record<string, number>; info: number }>
  contactsChangedAt: number
  currentUserId: string | null
  aircraftTypes: string[]
}

const basis: Stand = {
  notes: [
    { id: 'n1', text: 'eins' },
    { id: 'n2', text: 'zwei' },
  ],
  seen: { u1: { chat: { g1: 1 }, info: 1 } },
  contactsChangedAt: 100,
  currentUserId: 'u1',
  aircraftTypes: ['CL30'],
}

/** Wie der andere Tab ihn schickt: einmal durch JSON — keine gemeinsamen Referenzen. */
const ueberJson = <T,>(s: T): T => JSON.parse(JSON.stringify(s)) as T

const merge = (eigen: Stand, fremd: Stand) => standZusammenfuehren(basis, eigen, fremd, ['currentUserId'])

describe('standZusammenfuehren', () => {
  it('zwei unabhängige Notizen bleiben beide — der Fall aus dem Audit', () => {
    const eigen = { ...basis, notes: [...basis.notes, { id: 'nA', text: 'Tab A' }] }
    const fremd = ueberJson({ ...basis, notes: [...basis.notes, { id: 'nB', text: 'Tab B' }] })
    const { stand, mitEigenem } = merge(eigen, fremd)
    expect(stand.notes.map((n) => n.id)).toEqual(['n1', 'n2', 'nB', 'nA'])
    // Die eigene Notiz fehlt dem anderen Tab — dieser Tab muss schreiben.
    expect(mitEigenem).toBe(true)
  })

  it('… und kommt der zusammengeführte Stand zurück, ist Ruhe (kein Hin und Her)', () => {
    const a1 = { ...basis, notes: [...basis.notes, { id: 'nA', text: 'Tab A' }] }
    const b1 = { ...basis, notes: [...basis.notes, { id: 'nB', text: 'Tab B' }] }
    // Tab B führt A's Ruf mit seinem Stand zusammen und schreibt.
    const m = standZusammenfuehren(basis, b1, ueberJson(a1), ['currentUserId']).stand
    // Tab A bekommt den Stand von B: Er enthält A's Notiz schon.
    const zurueck = standZusammenfuehren(basis, a1, ueberJson(m), ['currentUserId'])
    expect(zurueck.stand.notes.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'nA', 'nB'])
    expect(zurueck.mitEigenem).toBe(false)
  })

  it('nur fremd geändert: der fremde Stand, und nichts zu schreiben', () => {
    const fremd = ueberJson({ ...basis, notes: [{ id: 'n1', text: 'eins (geändert)' }, basis.notes[1]], contactsChangedAt: 200 })
    const { stand, mitEigenem } = merge(basis, fremd)
    expect(stand.notes).toEqual(fremd.notes)
    expect(stand.contactsChangedAt).toBe(200)
    expect(mitEigenem).toBe(false)
  })

  it('gelöscht in einem Tab, unverändert im anderen → weg (in beide Richtungen)', () => {
    const fremdOhne = ueberJson({ ...basis, notes: [basis.notes[1]] })
    const a = merge(basis, fremdOhne)
    expect(a.stand.notes.map((n) => n.id)).toEqual(['n2'])
    expect(a.mitEigenem).toBe(false)

    const eigenOhne = { ...basis, notes: [basis.notes[1]] }
    const b = merge(eigenOhne, ueberJson(basis))
    expect(b.stand.notes.map((n) => n.id)).toEqual(['n2'])
    // Die eigene Löschung muss der andere Tab noch erfahren.
    expect(b.mitEigenem).toBe(true)
  })

  it('eine Löschung gewinnt nicht gegen eine Änderung desselben Datensatzes — von keiner Seite', () => {
    const geaendert = { id: 'n1', text: 'eins, nachgetragen' }
    // Dort gelöscht, hier geändert: die Änderung bleibt.
    const a = merge({ ...basis, notes: [geaendert, basis.notes[1]] }, ueberJson({ ...basis, notes: [basis.notes[1]] }))
    expect(a.stand.notes.find((n) => n.id === 'n1')).toEqual(geaendert)
    expect(a.mitEigenem).toBe(true)
    // Hier gelöscht, dort geändert: ebenso.
    const b = merge({ ...basis, notes: [basis.notes[1]] }, ueberJson({ ...basis, notes: [geaendert, basis.notes[1]] }))
    expect(b.stand.notes.find((n) => n.id === 'n1')).toEqual(geaendert)
    expect(b.mitEigenem).toBe(false)
  })

  it('beide ändern denselben Datensatz: die eigene Fassung — ganz, nie gemischt', () => {
    const eigen = { ...basis, notes: [{ id: 'n1', text: 'A', mailError: 'x' }, basis.notes[1]] }
    const fremd = ueberJson({ ...basis, notes: [{ id: 'n1', text: 'B' }, basis.notes[1]] })
    const { stand, mitEigenem } = merge(eigen, fremd)
    // Kein Datensatz aus Feldern zweier Fassungen (Unterschrift, Inhalt und
    // Fingerabdruck eines Formulars gehören zusammen).
    expect(stand.notes[0]).toEqual({ id: 'n1', text: 'A', mailError: 'x' })
    expect(mitEigenem).toBe(true)
  })

  it('beide gleich geändert: nichts Eigenes mehr zu schreiben', () => {
    const neu = { id: 'n1', text: 'gleich' }
    const { mitEigenem } = merge({ ...basis, notes: [neu, basis.notes[1]] }, ueberJson({ ...basis, notes: [neu, basis.notes[1]] }))
    expect(mitEigenem).toBe(false)
  })

  it('Objekte je Schlüssel: zwei gelesene Chats aus zwei Tabs bleiben beide', () => {
    const eigen = { ...basis, seen: { u1: { ...basis.seen.u1, chat: { ...basis.seen.u1.chat, g2: 5 } } } }
    const fremd = ueberJson({ ...basis, seen: { u1: { chat: { g1: 1, g3: 7 }, info: 9 } } })
    const { stand } = merge(eigen, fremd)
    expect(stand.seen.u1).toEqual({ chat: { g1: 1, g2: 5, g3: 7 }, info: 9 })
  })

  it('einfache Werte und Listen ohne id: als Ganzes — beide geändert, eigen gewinnt', () => {
    const { stand } = merge({ ...basis, contactsChangedAt: 300, aircraftTypes: ['CL30', 'C560 XLS+'] }, ueberJson({ ...basis, contactsChangedAt: 200, aircraftTypes: ['PC12'] }))
    expect(stand.contactsChangedAt).toBe(300)
    expect(stand.aircraftTypes).toEqual(['CL30', 'C560 XLS+'])
  })

  it('tab-eigene Schlüssel bleiben eigen und zählen nicht als Beitrag', () => {
    // Die Anmeldung steht je Tab für sich; sonst schriebe jeder Tab bei
    // jedem Ruf zurück, und zwei Tabs kämen nie zur Ruhe.
    const { stand, mitEigenem } = merge({ ...basis, currentUserId: 'u1' }, ueberJson({ ...basis, currentUserId: 'u9' }))
    expect(stand.currentUserId).toBe('u1')
    expect(mitEigenem).toBe(false)
  })

  it('unberührte Teile behalten die Referenz des fremden Stands (kein Kopieren)', () => {
    const fremd = ueberJson(basis)
    const { stand } = merge(basis, fremd)
    expect(stand.notes).toBe(fremd.notes)
    expect(stand.seen).toBe(fremd.seen)
  })

  it('ein Feld „undefined" ist dasselbe wie ein fehlendes (der fremde Stand kommt durch JSON)', () => {
    const eigen = { ...basis, notes: [{ id: 'n1', text: 'eins', mailError: undefined }, basis.notes[1]] }
    const fremd = ueberJson({ ...basis, notes: [{ id: 'n1', text: 'eins (dort)' }, basis.notes[1]] })
    // Hier nur neu gebaut, nicht geändert — die Änderung von dort gilt.
    const { stand, mitEigenem } = merge(eigen, fremd)
    expect(stand.notes[0].text).toBe('eins (dort)')
    expect(mitEigenem).toBe(false)
  })

  it('doppelte ids: keine Zusammenführung je Datensatz, sondern als Ganzes', () => {
    const doppelt = [
      { id: 'n1', text: 'a' },
      { id: 'n1', text: 'b' },
    ]
    const { stand } = merge({ ...basis, notes: doppelt }, ueberJson(basis))
    expect(stand.notes).toEqual(doppelt)
  })

  it('eine Liste, die auf beiden Seiten fehlt, bleibt weg (wird nicht zur leeren Liste)', () => {
    const ohne = { ...basis } as Partial<Stand>
    delete ohne.notes
    const { stand } = standZusammenfuehren(basis as Partial<Stand>, { ...ohne }, ueberJson(ohne))
    expect('notes' in stand).toBe(false)
  })

  it('ein Schlüssel nur auf einer Seite', () => {
    const eigen = { ...basis, nurHier: 1 } as Stand
    const fremd = ueberJson({ ...basis, nurDort: 2 }) as Stand
    const { stand, mitEigenem } = merge(eigen, fremd)
    expect(stand).toMatchObject({ nurHier: 1, nurDort: 2 })
    expect(mitEigenem).toBe(true)
  })
})

describe('gleich', () => {
  it('vergleicht Inhalt, nicht Referenz; undefined-Felder zählen als fehlend', () => {
    expect(gleich({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(gleich({ a: 1, x: undefined }, { a: 1 })).toBe(true)
    expect(gleich({ a: 1 }, { a: 2 })).toBe(false)
    expect(gleich({ a: 1 }, { b: 1 })).toBe(false)
    expect(gleich([1, 2], [1, 2, 3])).toBe(false)
    expect(gleich([1], { 0: 1 })).toBe(false)
    expect(gleich({ a: 1 }, null)).toBe(false)
    expect(gleich(1, '1')).toBe(false)
  })
})

describe('basisWaehlen — der jüngste gemeinsame Stand', () => {
  /*
   * Zwei Fehlerbilder, je nach Basis:
   *  - zu alt: In Tab A bearbeitet, in Tab B weiterbearbeitet — B's neuere
   *    Fassung sähe wie ein Konflikt aus, und A's ältere gewänne;
   *  - zu jung (der eigene, eben geschriebene Stand): Schreiben beide Tabs
   *    fast gleichzeitig, sähe die eigene Änderung unverändert aus, und der
   *    fremde Stand ohne sie gewänne.
   */
  const s = (name: string) => ({ name })
  const start = s('start')
  const w1 = s('w1')
  const w2 = s('w2')
  const geschrieben = new Map<string, Stammstand<{ name: string }>>([
    ['w1', { stand: w1, basen: {} }],
    ['w2', { stand: w2, basen: { B: 'b1' } }],
  ])

  it('ohne Abstammung (gleichzeitig geschrieben, ältere Fassung): der Startstand', () => {
    expect(basisWaehlen('A', undefined, geschrieben, undefined, start)).toBe(start)
    expect(basisWaehlen('A', {}, geschrieben, undefined, start)).toBe(start)
    // Ein eigener Stand, den es hier nicht (mehr) gibt, hilft nicht weiter.
    expect(basisWaehlen('A', { A: 'weg' }, geschrieben, undefined, start)).toBe(start)
  })

  it('der Absender hat unseren Stand übernommen → dieser ist die Basis (in A bearbeitet, in B weiter)', () => {
    expect(basisWaehlen('A', { A: 'w1' }, geschrieben, undefined, start)).toBe(w1)
  })

  it('nur sein voriger Stand ist bekannt → der', () => {
    const vorher = { stand: s('b1'), basen: {} }
    expect(basisWaehlen('A', { C: 'c9' }, geschrieben, vorher, start)).toBe(vorher.stand)
  })

  it('beide bekannt: sein voriger, wenn er unseren Stand damals schon kannte', () => {
    // B schrieb b1 nach der Übernahme von w1 und schreibt jetzt b2, ohne
    // Neues von uns: b1 enthält w1 und ist der jüngere gemeinsame Stand.
    const vorher = { stand: s('b1'), basen: { A: 'w1' } }
    expect(basisWaehlen('A', { A: 'w1' }, geschrieben, vorher, start)).toBe(vorher.stand)
  })

  it('beide bekannt: unser Stand, wenn er erst danach übernommen wurde', () => {
    const vorher = { stand: s('b1'), basen: {} }
    expect(basisWaehlen('A', { A: 'w2' }, geschrieben, vorher, start)).toBe(w2)
  })
})

describe('Kopf des ausgerufenen Stands', () => {
  it('Kopf vorn, Zustand hinten — und der Kopf lässt sich ohne den Zustand lesen', () => {
    // Auch ein „"state":" IM Zustand stört nicht: Gesucht wird das erste, und
    // das steht hinter dem Kopf.
    const zustand = { users: [{ id: 'u1' }], x: '"state":' }
    const raw = standNachricht(2, 5, { von: 'tab-a', id: 'stand-1', basen: { 'tab-b': 'stand-9' } }, JSON.stringify(zustand))
    expect(JSON.parse(raw)).toEqual({ v: 2, at: 5, von: 'tab-a', id: 'stand-1', basen: { 'tab-b': 'stand-9' }, state: zustand })
    expect(kopfLesen(raw)).toEqual({ von: 'tab-a', id: 'stand-1', basen: { 'tab-b': 'stand-9' } })
  })

  it('ohne Absender bleibt der Kopf schmal', () => {
    expect(JSON.parse(standNachricht(2, 0, { basen: {} }, '{}'))).toEqual({ v: 2, at: 0, basen: {}, state: {} })
  })

  it('älterer Stand, Unlesbares, nichts: leerer Kopf', () => {
    expect(kopfLesen('{"v":2,"state":{"users":[]},"at":3}')).toEqual({ basen: {} })
    expect(kopfLesen('{"v":2,"basen":{"a":1},"state":{}}')).toEqual({ basen: {} })
    // Abgeschnitten hinter dem Kopf: Der Kopf selbst ist noch lesbar.
    expect(kopfLesen('{"v":2,"von":"x","state":')).toEqual({ von: 'x', basen: {} })
    expect(kopfLesen('{kaputt"state":{}}')).toEqual({ basen: {} })
    expect(kopfLesen('{"v":2}')).toEqual({ basen: {} })
    expect(kopfLesen(null)).toEqual({ basen: {} })
  })

  it('ein empfangener Kopf wird geprüft — er kommt von außen', () => {
    expect(kopfAus({ von: 'tab-b', id: 'b1', basen: { 'tab-a': 'a1' } })).toEqual({ von: 'tab-b', id: 'b1', basen: { 'tab-a': 'a1' } })
    expect(kopfAus({ von: 7, id: null, basen: { a: 1 } })).toEqual({ basen: {} })
    expect(kopfAus({ basen: 'x' })).toEqual({ basen: {} })
  })
})
