import { describe, expect, it } from 'vitest'
import { contentFingerprint, HASH_VERSION } from './docHash'
import { createSeedState } from './sandbox/seed'
import {
  automatischFaellig,
  berichtText,
  browserBewerten,
  datenPruefen,
  dauerhaftBewerten,
  fingerabdrueckePruefen,
  fuellstandBewerten,
  gesamtStufe,
  kurzStand,
  letzterLaufLesen,
  netzBewerten,
  offlineBewerten,
  speicherBewerten,
  streifenMeldungen,
  textSchluessel,
  textWerte,
  uhrAbweichung,
  uhrBewerten,
  versionBewerten,
  zaehlen,
  zusammenfassungText,
  ZUKUNFT_SPIELRAUM_MS,
  type Ergebnis,
} from './selbsttest'
import type { AppState, GradingRecord } from './types'

/**
 * Regeln des Selbsttests (Ebene 1). Zwei Zusagen tragen alles:
 *  1. Der Werkszustand ist grün — ein Selbsttest, der ab Werk Alarm
 *     schlägt, wird nach einer Woche ignoriert.
 *  2. Jede Regel schlägt an, wenn ihr Zustand eintritt — nachgestellt am
 *     Bestand, nicht nur an Hilfswerten.
 */

const JETZT = new Date(2026, 10, 4, 12, 0).getTime()
const seed = (): AppState => createSeedState()
const nach = (es: Ergebnis[], id: string) => es.find((e) => e.id === id)!

describe('Datenbestand', () => {
  it('der Werkszustand ist in allen Punkten in Ordnung', () => {
    const es = datenPruefen(seed(), JETZT)
    expect(es.filter((e) => e.stufe !== 'ok').map((e) => [e.id, e.stufe])).toEqual([])
    expect(es.map((e) => e.id)).toEqual(['superadmin', 'adressen', 'muster', 'gruppenVerweise', 'ohneGruppe', 'doccheckRegel', 'struktur', 'zeiten'])
    expect(es.every((e) => e.gruppe === 'daten')).toBe(true)
  })

  it('ohne aktiven Superadmin: Fehler', () => {
    const st = seed()
    st.users = st.users.map((u) => (u.role === 'superadmin' ? { ...u, active: false } : u))
    expect(nach(datenPruefen(st, JETZT), 'superadmin').stufe).toBe('fehler')
  })

  it('doppelte Adresse (Groß-/Kleinschreibung und Leerzeichen egal): Fehler mit beiden Konten', () => {
    const st = seed()
    const chris = st.users.find((u) => u.id === 'u-christian')!
    st.users = st.users.map((u) => (u.id === 'u-michael' ? { ...u, email: ` ${chris.email.toUpperCase()} ` } : u))
    const e = nach(datenPruefen(st, JETZT), 'adressen')
    expect(e).toMatchObject({ stufe: 'fehler', zahl: 2 })
    expect(e.betroffen?.sort()).toEqual(['u-christian', 'u-michael'])
  })

  it('Mitglied ohne Muster: Hinweis — der Superadmin ist von der Musterpflicht ausgenommen', () => {
    const st = seed()
    st.users = st.users.map((u) => (u.id === 'u-michael' || u.role === 'superadmin' ? { ...u, aircraftTypes: [] } : u))
    expect(nach(datenPruefen(st, JETZT), 'muster')).toMatchObject({ stufe: 'hinweis', zahl: 1, betroffen: ['u-michael'] })
  })

  it('Gruppe mit Verweis auf ein gelöschtes Konto: Hinweis', () => {
    const st = seed()
    st.groups = st.groups.map((g, i) => (i === 0 ? { ...g, memberIds: [...g.memberIds, 'u-weg'] } : g))
    expect(nach(datenPruefen(st, JETZT), 'gruppenVerweise')).toMatchObject({ stufe: 'hinweis', zahl: 1, betroffen: [st.groups[0].id] })
  })

  it('Person mit Chat, aber ohne Gruppe: Hinweis', () => {
    const st = seed()
    st.groups = st.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => id !== 'u-michael'), adminIds: (g.adminIds ?? []).filter((id) => id !== 'u-michael') }))
    expect(nach(datenPruefen(st, JETZT), 'ohneGruppe')).toMatchObject({ stufe: 'hinweis', betroffen: ['u-michael'] })
  })

  it('Mitglied mit DocCheck-Schalter (an der Regel vorbei): Fehler', () => {
    const st = seed()
    st.users = st.users.map((u) => (u.id === 'u-michael' ? { ...u, docCheckAccess: true } : u))
    expect(nach(datenPruefen(st, JETZT), 'doccheckRegel')).toMatchObject({ stufe: 'fehler', zahl: 1, betroffen: ['u-michael'] })
  })

  it('fehlende Pflichtliste: Fehler und benannt', () => {
    const st = seed() as unknown as Record<string, unknown>
    delete st.lessonPlans
    const e = nach(datenPruefen(st as unknown as AppState, JETZT), 'struktur')
    expect(e.stufe).toBe('fehler')
    expect(e.werte?.felder).toContain('lessonPlans')
  })

  it('Unterschriftszeit in der Zukunft (mehr als eine Stunde): Hinweis — eine Minute ist es nicht', () => {
    const st = seed()
    const r = st.gradingRecords[0]
    st.gradingRecords = [{ ...r, signedAt: JETZT + 60_000 }, ...st.gradingRecords.slice(1)]
    expect(nach(datenPruefen(st, JETZT), 'zeiten').stufe).toBe('ok')
    st.gradingRecords = [{ ...r, signedAt: JETZT + ZUKUNFT_SPIELRAUM_MS + 60_000 }, ...st.gradingRecords.slice(1)]
    expect(nach(datenPruefen(st, JETZT), 'zeiten')).toMatchObject({ stufe: 'hinweis', zahl: 1, betroffen: [r.id] })
  })

  it('übersteht einen Stand ohne Nutzer, Gruppen und Formulare', () => {
    const st = { ...seed(), users: undefined, groups: undefined, gradingRecords: undefined } as unknown as AppState
    const es = datenPruefen(st, JETZT)
    expect(nach(es, 'superadmin').stufe).toBe('fehler')
    expect(nach(es, 'struktur').stufe).toBe('fehler')
  })
})

describe('Fingerabdrücke aller Formulare', () => {
  const unterschrieben = async (r: GradingRecord): Promise<GradingRecord> => ({ ...r, contentHash: await contentFingerprint(r), hashVersion: HASH_VERSION })

  it('Werkszustand: kein Formular trägt einen Abdruck — nicht prüfbar, nicht grün, und gezählt', async () => {
    const st = seed()
    const es = await fingerabdrueckePruefen(st.gradingRecords)
    const signiert = st.gradingRecords.filter((r) => r.status === 'signed').length
    expect(es).toEqual([
      { id: 'fingerabdruck', gruppe: 'daten', stufe: 'offen', variante: 'keine' },
      { id: 'altbestand', gruppe: 'daten', stufe: 'offen', zahl: signiert },
    ])
  })

  it('unverändert: ok mit der Zahl der geprüften', async () => {
    const st = seed()
    const recs = await Promise.all(st.gradingRecords.filter((r) => r.status === 'signed').map(unterschrieben))
    expect(await fingerabdrueckePruefen(recs)).toEqual([{ id: 'fingerabdruck', gruppe: 'daten', stufe: 'ok', zahl: recs.length }])
  })

  it('nach der Unterschrift geändert: Fehler mit dem Formular', async () => {
    const st = seed()
    const recs = await Promise.all(st.gradingRecords.filter((r) => r.status === 'signed').map(unterschrieben))
    recs[1] = { ...recs[1], freeText: { ...recs[1].freeText, remarks: 'nachträglich' } }
    const [e] = await fingerabdrueckePruefen(recs)
    expect(e).toEqual({ id: 'fingerabdruck', gruppe: 'daten', stufe: 'fehler', zahl: 1, betroffen: [recs[1].id] })
  })

  it('Entwürfe zählen nicht', async () => {
    const st = seed()
    const entwurf = { ...st.gradingRecords[0], status: 'draft' as const, contentHash: 'falsch' }
    expect(await fingerabdrueckePruefen([entwurf])).toEqual([{ id: 'fingerabdruck', gruppe: 'daten', stufe: 'offen', variante: 'keine' }])
  })
})

describe('Gerät', () => {
  it('Ablage: fehlgeschlagen ist Fehler, langsam ein Hinweis, ungemessen offen', () => {
    expect(speicherBewerten(null).stufe).toBe('offen')
    expect(speicherBewerten({ ok: false, ms: 3 }).stufe).toBe('fehler')
    expect(speicherBewerten({ ok: true, ms: 12.4 })).toEqual({ id: 'speicher', gruppe: 'geraet', stufe: 'ok', werte: { ms: 12 } })
    expect(speicherBewerten({ ok: true, ms: 2000 }).stufe).toBe('hinweis')
  })

  it('dauerhafte Ablage: nein ist ein Hinweis, unbekannt offen', () => {
    expect([true, false, null].map((x) => dauerhaftBewerten(x).stufe)).toEqual(['ok', 'hinweis', 'offen'])
  })

  it('Füllstand: ab 85 % Hinweis, ab 95 % Fehler — wie der Speicherstreifen', () => {
    expect(fuellstandBewerten({ usage: 50, quota: 100 })).toMatchObject({ stufe: 'ok', werte: { prozent: 50 } })
    expect(fuellstandBewerten({ usage: 86, quota: 100 }).stufe).toBe('hinweis')
    expect(fuellstandBewerten({ usage: 96, quota: 100 }).stufe).toBe('fehler')
    expect(fuellstandBewerten({ usage: 1, quota: 0 }).stufe).toBe('offen')
    expect(fuellstandBewerten(null).stufe).toBe('offen')
  })

  it('Uhr: bis 2 min ok, bis 10 min Hinweis, darüber Fehler — mit Richtung als eigener Satz', () => {
    expect(uhrBewerten(90_000)).toEqual({ id: 'uhr', gruppe: 'geraet', stufe: 'ok' })
    expect(uhrBewerten(5 * 60_000)).toMatchObject({ stufe: 'hinweis', variante: 'vor', zahl: 5 })
    expect(uhrBewerten(-30 * 60_000)).toMatchObject({ stufe: 'fehler', variante: 'nach', zahl: 30 })
    expect(uhrBewerten(null).stufe).toBe('offen')
    expect(uhrBewerten(Number.NaN).stufe).toBe('offen')
  })

  it('Uhrabweichung aus dem Date-Kopf, gemessen zur Mitte der Anfrage', () => {
    const server = 'Wed, 04 Nov 2026 11:00:00 GMT'
    const s = Date.parse(server)
    expect(uhrAbweichung(server, s + 5 * 60_000 - 200, s + 5 * 60_000 + 200)).toBe(5 * 60_000)
    expect(uhrAbweichung(null, 0, 0)).toBeNull()
    expect(uhrAbweichung('kein Datum', 0, 0)).toBeNull()
  })

  it('Offline-Start: ohne Service Worker Fehler, beim Einrichten Hinweis, fehlende Dateien Fehler', () => {
    const voll = { unterstuetzt: true, aktiv: true, steuert: true, gesamt: 40, fehlend: 0 }
    expect(offlineBewerten(voll)).toEqual({ id: 'offline', gruppe: 'geraet', stufe: 'ok', zahl: 40 })
    expect(offlineBewerten({ ...voll, fehlend: 3 })).toMatchObject({ stufe: 'fehler', variante: 'fehlend', zahl: 3 })
    expect(offlineBewerten({ ...voll, steuert: false })).toMatchObject({ stufe: 'hinweis', variante: 'einrichten' })
    expect(offlineBewerten({ ...voll, aktiv: false })).toMatchObject({ stufe: 'hinweis', variante: 'einrichten' })
    expect(offlineBewerten({ ...voll, unterstuetzt: false })).toMatchObject({ stufe: 'fehler', variante: 'nichtUnterstuetzt' })
    expect(offlineBewerten({ ...voll, gesamt: 0 }).stufe).toBe('offen')
    expect(offlineBewerten(null).stufe).toBe('offen')
  })

  it('Version: wartendes Update oder neuerer Stand am Server ist ein Hinweis; ohne Netz offen', () => {
    const a = 'ic-cache-0123456789abcdef'
    expect(versionBewerten({ aktiv: a, server: a, wartet: false })).toMatchObject({ stufe: 'ok', werte: { stand: '89abcdef' } })
    expect(versionBewerten({ aktiv: a, server: 'ic-cache-neu', wartet: false }).stufe).toBe('hinweis')
    expect(versionBewerten({ aktiv: a, server: a, wartet: true }).stufe).toBe('hinweis')
    expect(versionBewerten({ aktiv: a, server: null, wartet: false })).toMatchObject({ stufe: 'offen', variante: 'ohneNetz' })
    expect(versionBewerten({ aktiv: null, server: a, wartet: false })).toMatchObject({ stufe: 'offen', variante: 'unbekannt' })
    expect(versionBewerten(null).stufe).toBe('offen')
    expect(kurzStand('abc')).toBe('abc')
  })

  it('Browser: fehlende Pflicht-Funktion Fehler, fehlende Wunsch-Funktion Hinweis', () => {
    expect(browserBewerten([]).stufe).toBe('ok')
    expect(browserBewerten(['serviceWorker'])).toMatchObject({ stufe: 'hinweis', werte: { fehlend: 'serviceWorker' } })
    expect(browserBewerten(['caches', 'indexedDB']).stufe).toBe('fehler')
  })

  it('Netz: ohne Netz ein Hinweis, kein Fehler', () => {
    expect([true, false, null].map((x) => netzBewerten(x).stufe)).toEqual(['ok', 'hinweis', 'offen'])
  })
})

describe('Zusammenfassung', () => {
  const e = (stufe: Ergebnis['stufe'], gruppe: Ergebnis['gruppe'] = 'geraet', id = 'x'): Ergebnis => ({ id, gruppe, stufe })

  it('Gesamtstufe ist die schlechteste; offen zählt nur allein', () => {
    expect(gesamtStufe([])).toBe('offen')
    expect(gesamtStufe([e('offen'), e('ok')])).toBe('ok')
    expect(gesamtStufe([e('ok'), e('hinweis'), e('offen')])).toBe('hinweis')
    expect(gesamtStufe([e('fehler'), e('hinweis')])).toBe('fehler')
    expect(zaehlen([e('ok'), e('ok'), e('fehler'), e('offen')])).toEqual({ ok: 2, hinweis: 0, fehler: 1, offen: 1 })
  })

  it('der Streifen meldet nur Fehler; den Datenbestand nur, wer ihn prüfen darf', () => {
    const es = [e('fehler', 'geraet', 'a'), e('hinweis', 'geraet', 'b'), e('fehler', 'daten', 'c'), e('fehler', 'doccheck', 'd')]
    expect(streifenMeldungen(es, false).map((x) => x.id)).toEqual(['a'])
    expect(streifenMeldungen(es, true).map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('Satz und Werte: Variante vor Stufe, die Zahl als count', () => {
    expect(textSchluessel({ id: 'uhr', gruppe: 'geraet', stufe: 'hinweis', variante: 'vor' })).toBe('selbsttest.punkt.uhr.vor')
    expect(textSchluessel({ id: 'speicher', gruppe: 'geraet', stufe: 'ok' })).toBe('selbsttest.punkt.speicher.ok')
    expect(textWerte({ id: 'x', gruppe: 'geraet', stufe: 'ok', zahl: 3, werte: { stand: 'a' } })).toEqual({ stand: 'a', count: 3 })
    expect(textWerte({ id: 'x', gruppe: 'geraet', stufe: 'ok' })).toEqual({})
  })
})

describe('Ablauf', () => {
  it('der Kurz-Check läuft einmal je Kalendertag — nicht erst nach 24 Stunden', () => {
    const abends = new Date(2026, 10, 3, 22, 0).getTime()
    const morgens = new Date(2026, 10, 4, 7, 0).getTime()
    expect(automatischFaellig(null, morgens)).toBe(true)
    expect(automatischFaellig(abends, morgens)).toBe(true)
    expect(automatischFaellig(morgens, morgens + 3 * 3600_000)).toBe(false)
    // Uhr zurückgestellt: lieber einmal zu oft prüfen
    expect(automatischFaellig(morgens + 1, morgens)).toBe(true)
    expect(automatischFaellig(Number.NaN, morgens)).toBe(true)
  })

  it('der gespeicherte letzte Lauf wird geprüft gelesen', () => {
    expect(letzterLaufLesen(JSON.stringify({ zeit: 5, stufe: 'ok' }))).toEqual({ zeit: 5, stufe: 'ok' })
    expect(letzterLaufLesen(null)).toBeNull()
    expect(letzterLaufLesen('{')).toBeNull()
    expect(letzterLaufLesen(JSON.stringify({ zeit: 'x', stufe: 'ok' }))).toBeNull()
    expect(letzterLaufLesen(JSON.stringify({ zeit: 5, stufe: 'grün' }))).toBeNull()
  })
})

describe('Bericht', () => {
  it('nennt Kopf, Gruppen, Stufen, Sätze und betroffene IDs — keine Inhalte', () => {
    const t = (k: string, w?: Record<string, unknown>) => (w && Object.keys(w).length ? `${k}${JSON.stringify(w)}` : k)
    const text = berichtText(
      [
        { id: 'speicher', gruppe: 'geraet', stufe: 'ok', werte: { ms: 4 } },
        { id: 'fingerabdruck', gruppe: 'daten', stufe: 'fehler', zahl: 1, betroffen: ['gr7'] },
      ],
      t,
      { zeit: '04.11.2026 12:00', geraet: 'Test', stand: 'abcd1234' },
    )
    expect(text.split('\n')).toEqual([
      'selbsttest.berichtTitel',
      'selbsttest.berichtZeit: 04.11.2026 12:00',
      'selbsttest.berichtGeraet: Test',
      'selbsttest.berichtStand: abcd1234',
      '',
      '## selbsttest.gruppe.geraet',
      '[selbsttest.stufe.ok] selbsttest.punkt.speicher.name — selbsttest.punkt.speicher.ok{"ms":4}',
      '',
      '## selbsttest.gruppe.daten',
      '[selbsttest.stufe.fehler] selbsttest.punkt.fingerabdruck.name — selbsttest.punkt.fingerabdruck.fehler{"count":1}',
      '    gr7',
      '',
    ])
  })
})

describe('Kopfzeile', () => {
  const t = (k: string, w?: Record<string, unknown>) => (w?.count !== undefined ? `${k}:${w.count}` : k)
  it('ohne Fehler und Hinweise „in Ordnung", nicht prüfbare dahinter gezählt', () => {
    expect(zusammenfassungText({ ok: 5, hinweis: 0, fehler: 0, offen: 0 }, t)).toBe('selbsttest.zusammenfassung.ok')
    expect(zusammenfassungText({ ok: 5, hinweis: 0, fehler: 0, offen: 2 }, t)).toBe('selbsttest.zusammenfassung.ok · selbsttest.zusammenfassung.offen:2')
  })
  it('sonst Fehler vor Hinweisen vor nicht prüfbaren, nur was vorkommt', () => {
    expect(zusammenfassungText({ ok: 1, hinweis: 2, fehler: 1, offen: 1 }, t)).toBe('selbsttest.zusammenfassung.fehler:1 · selbsttest.zusammenfassung.hinweis:2 · selbsttest.zusammenfassung.offen:1')
    expect(zusammenfassungText({ ok: 1, hinweis: 3, fehler: 0, offen: 0 }, t)).toBe('selbsttest.zusammenfassung.hinweis:3')
  })
})
