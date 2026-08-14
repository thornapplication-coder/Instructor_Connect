import { describe, expect, it } from 'vitest'
import { kurzeZeit, readDrafts } from './drafts'

/**
 * Beide Funktionen lagen als Hilfsfunktionen in Seitendateien und waren
 * damit von der Testpflicht befreit — beide Wachen des Projekts globen auf
 * `src/*.ts`. Aufgefallen ist das erst beim Gegenlesen.
 *
 * Bewacht wird hier vor allem der Fehler, der dabei mit ans Licht kam: Die
 * Entwurfsliste suchte nach `aaa-draft-<user>-new-` und fand damit
 * Folgeformulare nie — ausgerechnet die Blaetter, die eine Nachschulung
 * belegen und an die man erinnert werden will.
 */

/** Schmale localStorage-Nachbildung; die echte gibt es auf Ebene 1 nicht. */
function speicherMit(eintraege: Record<string, string>): Storage {
  const daten = { ...eintraege }
  return {
    getItem: (k: string) => daten[k] ?? null,
    setItem: (k: string, v: string) => void (daten[k] = v),
    removeItem: (k: string) => void delete daten[k],
    clear: () => Object.keys(daten).forEach((k) => delete daten[k]),
    key: (i: number) => Object.keys(daten)[i] ?? null,
    get length() {
      return Object.keys(daten).length
    },
    ...daten,
  } as unknown as Storage
}

const blatt = JSON.stringify({
  trainees: [{ traineeName: 'Sophie Berger', grades: [{ grade: 3 }, { grade: null }, { grade: 'NO' }] }],
})

describe('readDrafts', () => {
  it('findet ein neues Blatt und zaehlt die gesetzten Noten', () => {
    // „NO" ist gesetzt (not observed), null ist offen — 2 von 3.
    const d = readDrafts('u1', speicherMit({ 'aaa-draft-u1-new-308A': blatt }))
    expect(d).toEqual([{ key: 'aaa-draft-u1-new-308A', formTypeId: '308A', wer: 'Sophie Berger', noten: 2, gesamt: 3 }])
  })

  it('findet auch ein angefangenes Folgeformular', () => {
    // Der eigentliche Befund: Der Schluessel traegt hier die Kennung des
    // Ausgangsblatts statt „new". Mit der alten Suche fiel er heraus.
    const d = readDrafts('u1', speicherMit({ 'aaa-draft-u1-gr7-306': JSON.stringify({ header: { traineeName: 'Lukas Steiner' } }) }))
    expect(d).toEqual([{ key: 'aaa-draft-u1-gr7-306', formTypeId: '306', wer: 'Lukas Steiner', noten: 0, gesamt: 0 }])
  })

  it('geht keinen fremden Entwurf an', () => {
    // Geteiltes iPad: Der Schluessel traegt den Nutzer, und nur der eigene
    // Entwurf darf auftauchen.
    const s = speicherMit({ 'aaa-draft-u1-new-308A': blatt, 'aaa-draft-u2-new-308F': blatt })
    expect(readDrafts('u1', s).map((d) => d.formTypeId)).toEqual(['308A'])
  })

  it('laesst andere Eintraege des Speichers unangetastet', () => {
    const s = speicherMit({ 'aaa-theme': 'dark', 'aaa-state': '{}', 'aaa-draft-u1-new-310': '{}' })
    expect(readDrafts('u1', s).map((d) => d.formTypeId)).toEqual(['310'])
  })

  it('nennt den Piloten aus den Kopfdaten, wenn kein Trainee eingetragen ist', () => {
    const s = speicherMit({ 'aaa-draft-u1-new-306': JSON.stringify({ trainees: [], header: { traineeName: 'Max Muster' } }) })
    expect(readDrafts('u1', s)[0].wer).toBe('Max Muster')
  })

  it('bleibt ohne Namen leer statt „undefined" zu zeigen', () => {
    const s = speicherMit({ 'aaa-draft-u1-new-308A': JSON.stringify({ trainees: [{ grades: [] }] }) })
    expect(readDrafts('u1', s)[0].wer).toBe('')
  })

  it('verliert wegen eines beschaedigten Entwurfs nicht die uebrigen', () => {
    // Ein halb geschriebener Eintrag (Absturz beim Speichern) darf nicht die
    // ganze Liste kosten.
    const s = speicherMit({ 'aaa-draft-u1-new-308A': '{kaputt', 'aaa-draft-u1-new-306': blatt })
    const d = readDrafts('u1', s)
    expect(d).toHaveLength(2)
    expect(d.find((x) => x.formTypeId === '306')!.wer).toBe('Sophie Berger')
  })

  it('meldet nichts, wenn es gar keinen Speicher gibt', () => {
    // Privates Fenster mit gesperrtem Speicher: kein Fehler, nur nichts.
    const kaputt = new Proxy({} as Storage, {
      ownKeys() {
        throw new Error('kein localStorage')
      },
    })
    expect(readDrafts('u1', kaputt)).toEqual([])
  })
})

describe('kurzeZeit', () => {
  const jetzt = new Date(2026, 7, 13, 14, 30).getTime()

  it('zeigt heute die Uhrzeit', () => {
    const heuteFrueh = new Date(2026, 7, 13, 8, 5).getTime()
    expect(kurzeZeit(heuteFrueh, 'de', jetzt)).toMatch(/08[:.]05/)
  })

  it('zeigt in der letzten Woche den Wochentag', () => {
    const vorgestern = new Date(2026, 7, 11, 9, 0).getTime()
    expect(kurzeZeit(vorgestern, 'de', jetzt)).toMatch(/^Di/)
    expect(kurzeZeit(vorgestern, 'en', jetzt)).toMatch(/^Tue/)
  })

  it('zeigt davor das Datum als DD.MM.YYYY — in beiden Sprachen', () => {
    // Die Grenze liegt bei sechs Tagen — danach sagt ein Wochentag nicht
    // mehr, welche Woche gemeint ist. Das Format ist die app-weite Festlegung
    // DD.MM.YYYY, nicht das Gebietsschema: Englisch zeigte vorher 20/07.
    const langeHer = new Date(2026, 6, 20, 9, 0).getTime()
    expect(kurzeZeit(langeHer, 'de', jetzt)).toBe('20.07.2026')
    expect(kurzeZeit(langeHer, 'en', jetzt)).toBe('20.07.2026')
  })

  it('behandelt Mitternacht als heute', () => {
    const mitternacht = new Date(2026, 7, 13, 0, 0).getTime()
    expect(kurzeZeit(mitternacht, 'de', jetzt)).toMatch(/00[:.]00/)
  })
})

describe('readDrafts — weitere Formen', () => {
  it('kommt mit einem Entwurf ohne Piloten-Feld zurecht', () => {
    // Kopfdaten vorhanden, aber ohne `traineeName` — Altbestand und der
    // Normalfall bei 307A/B, wo die Namen in der Anwesenheitsliste stehen.
    const s = speicherMit({ 'aaa-draft-u1-new-307A': JSON.stringify({ header: { aircraftType: 'CL30' } }) })
    expect(readDrafts('u1', s)[0]).toMatchObject({ wer: '', noten: 0, gesamt: 0 })
  })

  it('kommt mit einem Piloten ohne Notenfeld zurecht', () => {
    // Ein Entwurf, der beim Anlegen des Piloten unterbrochen wurde: Der
    // Eintrag steht, `grades` fehlt noch.
    const s = speicherMit({ 'aaa-draft-u1-new-308A': JSON.stringify({ trainees: [{ traineeName: 'A' }] }) })
    expect(readDrafts('u1', s)[0]).toMatchObject({ wer: 'A', noten: 0, gesamt: 0 })
  })

  it('uebersteht einen Schluessel ohne Inhalt', () => {
    // Der Schluessel steht in der Liste, der Wert ist weg — so sieht ein
    // Speicher aus, den der Browser bei Platzmangel teilweise geraeumt hat.
    const leer = {
      getItem: () => null,
      length: 1,
      key: () => 'aaa-draft-u1-new-306',
      'aaa-draft-u1-new-306': '',
    } as unknown as Storage
    expect(readDrafts('u1', leer)).toEqual([
      { key: 'aaa-draft-u1-new-306', formTypeId: '306', wer: '', noten: 0, gesamt: 0 },
    ])
  })

  it('zaehlt ueber mehrere Piloten eines Blattes hinweg', () => {
    const zwei = JSON.stringify({
      trainees: [
        { traineeName: 'A', grades: [{ grade: 3 }, { grade: null }] },
        { traineeName: 'B', grades: [{ grade: 4 }, { grade: 2 }] },
      ],
    })
    expect(readDrafts('u1', speicherMit({ 'aaa-draft-u1-new-308A': zwei }))[0]).toMatchObject({ wer: 'A, B', noten: 3, gesamt: 4 })
  })
})
