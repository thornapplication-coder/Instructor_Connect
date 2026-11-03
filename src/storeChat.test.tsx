import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { istStumm } from './chatMute'
import { StoreProvider, useStore } from './store'

/**
 * Ebene 2: Chat und Instructor Info im Store (Audit 11/2026, P11).
 *
 * Die Regeln selbst pruefen die Logik-Tests (chatRules, chatMute, gruppen,
 * infoAcks). Hier geht es um die Verdrahtung: Der Store fragt sie — und
 * sagt der Ansicht, ob eine Aktion gewirkt hat. Ohne diese Antwort leerte
 * der Chat die Eingabe auch bei Ablehnung, und der Text war weg (KERN-08).
 *
 * Angemeldet ist Alex (Superadmin). Seed: „SIM Defects" (C560 XLS+,
 * Aufbewahrung 7 Tage) mit Alex und Mika; „Autothrottle" (CL30) mit Alex
 * und Chris; Mikas einzige erreichbare Gruppe ist „SIM Defects".
 */

let laden: ReturnType<typeof useStore> | null = null
function Griff() {
  laden = useStore()
  return null
}
const store = () => laden!
const MITTAG = new Date(2026, 10, 3, 12, 0, 0)
const d = 24 * 3600_000

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(MITTAG)
  const ende = new Date(MITTAG)
  ende.setHours(23, 59, 59, 999)
  localStorage.setItem('aaa-user', 'u-patrick')
  localStorage.setItem('aaa-session-exp', String(ende.getTime()))
  laden = null
  render(
    <StoreProvider>
      <Griff />
    </StoreProvider>,
  )
})

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('Abgewiesene Aktionen sagen es (KERN-08)', () => {
  it('Nachricht: true bei Erfolg, false beim zu grossen Anhang — und dann entsteht nichts', () => {
    const anzahl = () => store().state.messages.length
    const vorher = anzahl()
    let ok = false
    act(() => {
      ok = store().sendMessage('g-defects', 'Hallo')
    })
    expect(ok).toBe(true)
    expect(anzahl()).toBe(vorher + 1)
    act(() => store().updateSettings({ maxUploadMB: 2 }))
    act(() => {
      ok = store().sendMessage('g-defects', 'Mit Bild', { name: 'x.jpg', kind: 'image', sizeMB: 3.2 })
    })
    expect(ok).toBe(false)
    expect(anzahl()).toBe(vorher + 1)
  })

  it('Nachricht ohne Inhalt: abgewiesen', () => {
    let ok = true
    act(() => {
      ok = store().sendMessage('g-defects', '   ')
    })
    expect(ok).toBe(false)
  })

  it('Umfrage: vergangener Ablauf und fehlender Ablauf abgewiesen, gueltiger angelegt', () => {
    const umfragen = () => store().state.polls.length
    const vorher = umfragen()
    let ok = true
    act(() => {
      ok = store().createPoll('g-defects', 'Gestern?', 'yesno', [], Date.now() - d)
    })
    expect(ok).toBe(false)
    act(() => {
      ok = store().createPoll('g-defects', 'Ohne Ende?', 'yesno', [], undefined)
    })
    expect(ok).toBe(false)
    act(() => {
      ok = store().createPoll('g-defects', 'Morgen?', 'yesno', [], Date.now() + d)
    })
    expect(ok).toBe(true)
    expect(umfragen()).toBe(vorher + 1)
  })

  it('Gruppe anlegen: vergebener Name (ohne Gross-/Kleinschreibung) false, neuer Name true', () => {
    const anzahl = () => store().state.groups.length
    const vorher = anzahl()
    let ok = true
    act(() => {
      ok = store().addGroup('autothrottle', '', 'CL30')
    })
    expect(ok).toBe(false)
    expect(anzahl()).toBe(vorher)
    act(() => {
      ok = store().addGroup('Neue Gruppe', '', 'CL30')
    })
    expect(ok).toBe(true)
    expect(anzahl()).toBe(vorher + 1)
  })

  it('Mitglied entfernen: Mikas letzte erreichbare Gruppe — false und unveraendert', () => {
    const mitglieder = () => store().state.groups.find((g) => g.id === 'g-defects')!.memberIds
    let ok = true
    act(() => {
      ok = store().setGroupMembers('g-defects', ['u-patrick'])
    })
    expect(ok).toBe(false)
    expect(mitglieder()).toEqual(['u-patrick', 'u-michael'])
    // Alex hat weitere Gruppen — ihn herauszunehmen geht (als Superadmin).
    act(() => {
      ok = store().setGroupMembers('g-defects', ['u-michael'])
    })
    expect(ok).toBe(true)
    expect(mitglieder()).toEqual(['u-michael'])
  })
})

describe('Umfrage-Ablauf in der Aufbewahrung der Gruppe (KERN-09)', () => {
  it('„SIM Defects" bewahrt 7 Tage auf: Ablauf in 6 Tagen ja, in 8 Tagen nein', () => {
    let ok = true
    act(() => {
      ok = store().createPoll('g-defects', 'Zu lang?', 'yesno', [], Date.now() + 8 * d)
    })
    expect(ok).toBe(false)
    act(() => {
      ok = store().createPoll('g-defects', 'Passt?', 'yesno', [], Date.now() + 6 * d)
    })
    expect(ok).toBe(true)
  })

  it('die Gruppeneinstellung zaehlt, nicht die globale Vorgabe (30 Tage)', () => {
    act(() => store().setGroupRetention('g-defects', '24h'))
    let ok = true
    act(() => {
      ok = store().createPoll('g-defects', 'Zwei Tage?', 'yesno', [], Date.now() + 2 * d)
    })
    expect(ok).toBe(false)
    act(() => store().setGroupRetention('g-defects', null))
    act(() => {
      ok = store().createPoll('g-defects', 'Zwei Tage?', 'yesno', [], Date.now() + 2 * d)
    })
    expect(ok).toBe(true)
  })
})

describe('Stummschalten je Nutzer (KERN-06)', () => {
  it('Mika schaltet stumm — Alex bleibt laut; zweimal ist wie nie', () => {
    act(() => store().switchUser('u-michael'))
    act(() => store().toggleMute('g-defects'))
    const stumm = (u: string) => istStumm(store().state.mutedGroups, u, 'g-defects')
    expect(stumm('u-michael')).toBe(true)
    expect(stumm('u-patrick')).toBe(false)
    act(() => store().switchUser('u-patrick'))
    act(() => store().toggleMute('g-defects'))
    expect(stumm('u-patrick')).toBe(true)
    act(() => store().toggleMute('g-defects'))
    expect(stumm('u-patrick')).toBe(false)
    // Mikas Einstellung hat Alex' Umschalten nicht beruehrt.
    expect(stumm('u-michael')).toBe(true)
  })
})

describe('Neu-Marke der Instructor Info fuer Verwalter (KERN-11)', () => {
  /** Ortskalendertag in n Tagen — `validFrom` ist ein Kalendertag. */
  const inTagen = (n: number) => {
    const t = new Date(MITTAG.getTime() + n * d)
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }
  const eintrag = (title: string, validFrom = '') => ({ type: 'text' as const, title, description: '', category: 'General', validFrom, aircraftType: 'CL30' })

  it('ein geplanter Eintrag schaltet die Marke nicht ab — ein danach sofort gueltiger bekommt sie', () => {
    // Alex hat alles gesehen.
    act(() => store().markInfoSeen())
    expect(store().hasNewInfo).toBe(false)
    // Chris plant einen Eintrag in zehn Tagen: fuer Alex noch nichts Neues.
    act(() => store().switchUser('u-christian'))
    act(() => store().addInfoEntry(eintrag('Geplant', inTagen(10))))
    act(() => store().switchUser('u-patrick'))
    expect(store().hasNewInfo).toBe(false)
    // Alex oeffnet Instructor Info — „gesehen" darf nicht in die Zukunft rutschen.
    act(() => store().markInfoSeen())
    expect(store().state.seen['u-patrick'].info).toBeLessThanOrEqual(Date.now())
    // Chris legt einen sofort gueltigen Eintrag an: Alex sieht ihn als neu.
    vi.setSystemTime(MITTAG.getTime() + 60_000)
    act(() => store().switchUser('u-christian'))
    act(() => store().addInfoEntry(eintrag('Sofort')))
    act(() => store().switchUser('u-patrick'))
    expect(store().hasNewInfo).toBe(true)
  })

  it('ein schon gespeicherter Gesehen-Zeitpunkt in der Zukunft wird beim Oeffnen ersetzt', () => {
    // So stand es auf Geraeten, die den Fehler schon hatten. Einen Weg, das
    // so zu setzen, hat die App (jetzt) nicht — deshalb direkt hineingelegt;
    // der naechste Schritt zeichnet neu und liest es.
    act(() => store().markInfoSeen())
    store().state.seen['u-patrick'] = { ...store().state.seen['u-patrick'], info: Date.now() + 10 * d }
    act(() => store().switchUser('u-christian'))
    act(() => store().addInfoEntry(eintrag('Sofort')))
    act(() => store().switchUser('u-patrick'))
    expect(store().hasNewInfo).toBe(true)
    act(() => store().markInfoSeen())
    expect(store().state.seen['u-patrick'].info).toBeLessThanOrEqual(Date.now())
    expect(store().hasNewInfo).toBe(false)
  })
})

describe('Instructor Info: „Gültig bis" vor „Gültig ab" (KERN-12)', () => {
  const eintrag = (title: string, validFrom: string, validUntil: string) =>
    ({ type: 'text' as const, title, description: '', body: 'x', category: 'General', aircraftType: '', validFrom, validUntil, requiresAck: false })

  it('weist der Store ab — dieselbe Regel wie der Dialog; gleicher Tag geht durch', () => {
    const titel = () => store().state.infoEntries.map((e) => e.title)
    act(() => store().addInfoEntry(eintrag('Verdreht', '2026-11-08', '2026-10-27')))
    expect(titel()).not.toContain('Verdreht')
    act(() => store().addInfoEntry(eintrag('Ein Tag', '2026-11-08', '2026-11-08')))
    expect(titel()).toContain('Ein Tag')
  })
})

describe('Who to call: getrimmt und grob geprueft (KERN-16)', () => {
  it('„Training " wird als „Training" gespeichert — keine zweite Abteilung', () => {
    act(() => store().saveContact({ department: 'Training ', position: ' Dispo ', name: ' Neu Beispiel ', phone: '+43 1  5550 999', email: ' neu@example.test ' }))
    const neu = store().state.contacts.find((c) => c.name === 'Neu Beispiel')
    expect(neu).toMatchObject({ department: 'Training', position: 'Dispo', phone: '+43 1 5550 999', email: 'neu@example.test' })
  })

  it('weist ab, was der Dialog sperrt: ohne Name, unlesbare Nummer', () => {
    const vorher = store().state.contacts.length
    act(() => store().saveContact({ department: 'Training', position: '', name: '   ', phone: '', email: '' }))
    act(() => store().saveContact({ department: 'Training', position: '', name: 'X', phone: 'bitte anrufen', email: '' }))
    expect(store().state.contacts.length).toBe(vorher)
  })
})
