import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreProvider, useStore } from './store'

/**
 * Ebene 2: Die Verwaltungsregeln kommen im Store an (Audit 11/2026, P8).
 *
 * Die Regeln selbst pruefen die Logik-Tests (benutzerRegeln, gruppen,
 * domains, aircraftScope, userImport). Hier geht es um die Verdrahtung:
 * Ein Store, der die Regel nicht fragt, waere der Weg an ihr vorbei — und
 * genau so waren die Befunde entstanden (die Oberflaeche pruefte, der Store
 * nicht, oder umgekehrt).
 *
 * Angemeldet ist Alex (Superadmin, example.test). Der Seed: Chris (Admin,
 * CL30), Mika (Mitglied, C560 XLS+), Sam (Training Admin, kein Chat).
 */

let laden: ReturnType<typeof useStore> | null = null
function Griff() {
  laden = useStore()
  return null
}
const store = () => laden!
const nutzer = (id: string) => store().state.users.find((u) => u.id === id)!
const gruppe = (id: string) => store().state.groups.find((g) => g.id === id)!

beforeEach(() => {
  // Die Sicherung laeuft ueber einen Zeitgeber — eingefroren, damit kein
  // Test den Stand des naechsten in IndexedDB hinterlaesst.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  const mittag = new Date(2026, 10, 2, 12, 0, 0)
  vi.setSystemTime(mittag)
  const ende = new Date(mittag)
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

describe('Rollen und Konten (VERW-01, VERW-10)', () => {
  it('die eigene Rolle bleibt — auch mit einem zweiten aktiven Superadmin', () => {
    act(() => store().updateUser('u-christian', { role: 'superadmin' }))
    expect(nutzer('u-christian').role).toBe('superadmin')
    act(() => store().updateUser('u-patrick', { role: 'member' }))
    expect(nutzer('u-patrick').role).toBe('superadmin')
    act(() => store().updateUser('u-patrick', { active: false }))
    expect(nutzer('u-patrick').active).toBe(true)
    expect(store().currentUser?.id).toBe('u-patrick')
  })

  it('niemand verliert per Musterwechsel seine letzte erreichbare Gruppe', () => {
    // Mika ist nur in „SIM Defects" (C560 XLS+). Ohne C560 kaeme er in
    // keine Gruppe mehr hinein.
    act(() => store().updateUser('u-michael', { aircraftTypes: ['CL30'] }))
    expect(nutzer('u-michael').aircraftTypes).toEqual(['C560 XLS+'])
  })
})

describe('Gruppen (VERW-04, KERN-07/VERW-16)', () => {
  it('Umbenennen behaelt Mehrwortnamen und weist Leer und Doppelt ab', () => {
    act(() => store().renameGroup('g-ground', '  Ground Training Vienna Base '))
    expect(gruppe('g-ground').name).toBe('Ground Training Vienna Base')
    act(() => store().renameGroup('g-ground', '   '))
    act(() => store().renameGroup('g-ground', 'sim defects'))
    expect(gruppe('g-ground').name).toBe('Ground Training Vienna Base')
  })

  it('niemand faellt aus seiner letzten ERREICHBAREN Gruppe — fremde Mitgliedschaften zaehlen nicht', () => {
    act(() => store().setGroupMembers('g-defects', ['u-patrick']))
    expect(gruppe('g-defects').memberIds).toContain('u-michael')
    expect(store().groupDeleteBlockers('g-defects').map((u) => u.id)).toEqual(['u-michael'])
    act(() => store().deleteGroup('g-defects'))
    expect(gruppe('g-defects')).toBeDefined()
  })

  it('nimmt niemanden auf, der die Gruppe nicht betreten kann', () => {
    // Mika (C560) in die CL30-Gruppe, Sam (Training Admin, kein Chat) in die
    // allgemeine: beides waere eine Mitgliedschaft ohne Zugang.
    act(() => store().setGroupMembers('g-auto', [...gruppe('g-auto').memberIds, 'u-michael']))
    expect(gruppe('g-auto').memberIds).not.toContain('u-michael')
    act(() => store().setGroupMembers('g-ground', [...gruppe('g-ground').memberIds, 'u-max']))
    expect(gruppe('g-ground').memberIds).not.toContain('u-max')
    // Wer passt, kommt hinein.
    act(() => store().setGroupMembers('g-ground', [...gruppe('g-ground').memberIds, 'u-michael']))
    expect(gruppe('g-ground').memberIds).toContain('u-michael')
  })
})

describe('Benutzer anlegen und importieren (VERW-12, VERW-07)', () => {
  const neu = { name: 'Neu Beispiel', phone: '', role: 'member' as const, aircraftTypes: ['C560 XLS+'] }

  it('legt kein Konto mit nicht freigegebener Domain an', () => {
    let ok = true
    act(() => {
      ok = store().addUser({ ...neu, email: 'fremd.domain@gmail.com', groupIds: ['g-defects'] })
    })
    expect(ok).toBe(false)
    expect(store().state.users.some((u) => u.email === 'fremd.domain@gmail.com')).toBe(false)
  })

  it('nur mit einer Gruppe, die die Person betreten kann — der Training Admin braucht keine', () => {
    let ok = true
    act(() => {
      ok = store().addUser({ ...neu, email: 'neu@example.test', groupIds: ['g-auto'] })
    })
    expect(ok).toBe(false)
    act(() => {
      ok = store().addUser({ ...neu, email: 'neu@example.test', groupIds: ['g-defects'] })
    })
    expect(ok).toBe(true)
    act(() => {
      ok = store().addUser({ ...neu, role: 'training_admin', email: 'ta@example.test', groupIds: [] })
    })
    expect(ok).toBe(true)
  })

  it('der Import legt ohne Gruppe nichts an und haengt mit Gruppe die neuen Konten an', () => {
    const zeile = { ...neu, email: 'import@example.test', canGrade: true, isTrainee: false, canEditDirectory: false, active: true }
    let n = -1
    act(() => {
      n = store().importUsers([zeile], [])
    })
    expect(n).toBe(0)
    act(() => {
      n = store().importUsers([zeile], ['g-defects'])
    })
    expect(n).toBe(1)
    const angelegt = store().state.users.find((u) => u.email === 'import@example.test')!
    expect(gruppe('g-defects').memberIds).toContain(angelegt.id)
  })
})

describe('Login-Domains (VERW-05)', () => {
  it('speichert normalisiert', () => {
    act(() => store().updateSettings({ allowedDomains: ['@Aviationacademy.at ', 'example.test', 'EXAMPLE.TEST'] }))
    expect(store().state.settings.allowedDomains).toEqual(['aviationacademy.at', 'example.test'])
  })

  it('verweigert eine Liste, mit der der Handelnde selbst nicht mehr hineinkaeme', () => {
    act(() => store().updateSettings({ allowedDomains: ['aviationacademy.at'] }))
    expect(store().state.settings.allowedDomains).toEqual(['aviationacademy.at', 'example.test'])
  })
})

describe('Mitglieder und Admins einer Gruppe (VERW-09, VERW-11)', () => {
  it('ein Gruppenadmin nimmt sich weder als Mitglied noch als Admin heraus', () => {
    act(() => store().switchUser('u-christian'))
    act(() => store().setGroupMembers('g-ground', ['u-patrick']))
    expect(gruppe('g-ground').memberIds).toEqual(['u-patrick', 'u-christian'])
    act(() => store().setGroupAdmins('g-ground', []))
    expect(gruppe('g-ground').adminIds).toEqual(['u-christian'])
    // Andere ernennen geht — und danach sich selbst abgeben auch nicht.
    act(() => store().setGroupAdmins('g-ground', ['u-christian', 'u-patrick']))
    expect(gruppe('g-ground').adminIds).toEqual(['u-christian', 'u-patrick'])
    act(() => store().setGroupAdmins('g-ground', ['u-patrick']))
    expect(gruppe('g-ground').adminIds).toEqual(['u-christian', 'u-patrick'])
  })

  it('ernennt nur aktive Mitglieder', () => {
    // Sam ist kein Mitglied; Mika ist Mitglied von „SIM Defects", aber deaktiviert.
    act(() => store().setGroupAdmins('g-ground', ['u-christian', 'u-max']))
    expect(gruppe('g-ground').adminIds).toEqual(['u-christian'])
    act(() => store().updateUser('u-michael', { active: false }))
    expect(nutzer('u-michael').active).toBe(false)
    act(() => store().setGroupAdmins('g-defects', ['u-patrick', 'u-michael']))
    expect(gruppe('g-defects').adminIds).toEqual(['u-patrick'])
  })

  it('der Superadmin darf den letzten Admin entfernen — die Rueckfrage stellt die Oberflaeche', () => {
    act(() => store().setGroupAdmins('g-ground', []))
    expect(gruppe('g-ground').adminIds).toEqual([])
  })
})

describe('Rollenwechsel im DocCheck-Protokoll (VERW-15)', () => {
  const zeilen = () => (store().state.docCheck?.audit ?? []).filter((a) => a.aktion === 'rolle')

  it('Befoerdern, Herabstufen und Deaktivieren schreiben je eine Zeile mit dem Handelnden', () => {
    act(() => store().updateUser('u-christian', { role: 'superadmin' }))
    act(() => store().updateUser('u-christian', { role: 'group_admin' }))
    act(() => store().updateUser('u-michael', { active: false }))
    expect(zeilen().map((a) => [a.ziel, a.wert, a.von])).toEqual([
      ['u-michael', 'nutzer → keine', 'u-patrick'],
      ['u-christian', 'superadmin → admin', 'u-patrick'],
      ['u-christian', 'admin → superadmin', 'u-patrick'],
    ])
  })

  it('ohne DocCheck-Wirkung keine Zeile', () => {
    // Sam hat kein DocCheck; Training Admin → Mitglied aendert daran nichts.
    act(() => store().updateUser('u-max', { role: 'member' }))
    expect(nutzer('u-max').role).toBe('member')
    expect(zeilen()).toEqual([])
  })

  it('ein neuer Superadmin steht im Protokoll — angelegt wie importiert', () => {
    act(() => {
      store().addUser({ name: 'Neu Super', email: 'neu.super@example.test', phone: '', role: 'superadmin', aircraftTypes: [], groupIds: ['g-ground'] })
    })
    act(() => {
      store().importUsers([{ name: 'Import Super', email: 'import.super@example.test', phone: '', role: 'superadmin', aircraftTypes: [], canGrade: true, isTrainee: false, canEditDirectory: false, active: true }], ['g-ground'])
    })
    const neu = (mail: string) => store().state.users.find((u) => u.email === mail)!.id
    expect(zeilen().map((a) => [a.ziel, a.wert])).toEqual([
      [neu('import.super@example.test'), 'keine → superadmin'],
      [neu('neu.super@example.test'), 'keine → superadmin'],
    ])
  })
})

describe('Muster in den Einstellungen (VERW-18)', () => {
  it('ein noch verwendetes Muster bleibt an seiner Stelle, ein freies geht', () => {
    const vorher = store().state.settings.aircraftTypes
    expect(vorher).toContain('CL30')
    // Ein Muster, an dem nichts haengt, kommt dazu und geht wieder.
    act(() => store().updateSettings({ aircraftTypes: [...vorher, 'Testmuster'] }))
    expect(store().state.settings.aircraftTypes).toEqual([...vorher, 'Testmuster'])
    // CL30 haengt an Gruppen und Nutzern: Es bleibt — an seiner Stelle,
    // nicht angehaengt. Testmuster geht.
    act(() => store().updateSettings({ aircraftTypes: vorher.filter((a) => a !== 'CL30') }))
    expect(store().state.settings.aircraftTypes).toEqual(vorher)
  })

  it('ein noch verwendeter Formulartyp bleibt ebenfalls an seiner Stelle', () => {
    const vorher = store().state.settings.grading.formTypes.map((f) => f.id)
    const ohne306 = store().state.settings.grading.formTypes.filter((f) => f.id !== '306')
    act(() => store().updateGrading({ formTypes: ohne306 }))
    expect(store().state.settings.grading.formTypes.map((f) => f.id)).toEqual(vorher)
  })
})

describe('Rechte an der Aktion (KERN-19, VERW-23)', () => {
  // Die Regeln prueft storeRechte.test.ts als Matrix. Hier: Der Store fragt
  // sie — vorher verliess sich die Haelfte der Schreibwege auf die
  // Oberflaeche.
  const feedback = (id: string) => store().state.feedbackEntries.find((f) => f.id === id)
  const umfrage = (id: string) => store().state.polls.find((p) => p.id === id)!

  it('Verwaltung: ein Mitglied legt weder Konten an noch aendert es Nutzer oder Einstellungen', () => {
    act(() => store().switchUser('u-michael'))
    let ok = true
    act(() => {
      ok = store().addUser({ name: 'Heimlich', email: 'heimlich@example.test', phone: '', role: 'superadmin', aircraftTypes: [], groupIds: ['g-ground'] })
    })
    expect(ok).toBe(false)
    expect(store().state.users.some((u) => u.email === 'heimlich@example.test')).toBe(false)
    act(() => store().updateUser('u-michael', { canEditDirectory: true }))
    expect(nutzer('u-michael').canEditDirectory).toBe(false)
    act(() => store().updateSettings({ maxUploadMB: 99 }))
    expect(store().state.settings.maxUploadMB).toBe(25)
  })

  it('Gruppenadmin: kein Konto — auch nicht aus einer offen gebliebenen Ansicht', () => {
    act(() => store().switchUser('u-christian'))
    let ok = true
    act(() => {
      ok = store().addUser({ name: 'Neu', email: 'neu.ga@example.test', phone: '', role: 'member', aircraftTypes: ['CL30'], groupIds: ['g-auto'] })
    })
    expect(ok).toBe(false)
  })

  it('Feedback erledigt nur, wer es sieht: Chris (CL30) nicht Mikas C560-Meldung, der Superadmin schon', () => {
    act(() => store().switchUser('u-christian'))
    act(() => store().resolveFeedback('fb1', 'erledigt'))
    act(() => store().deleteFeedback('fb1'))
    expect(feedback('fb1')?.resolvedBy).toBeUndefined()
    act(() => store().switchUser('u-patrick'))
    act(() => store().resolveFeedback('fb1', 'erledigt'))
    expect(feedback('fb1')?.resolvedBy).toBe('u-patrick')
    act(() => store().reopenFeedback('fb1'))
    expect(feedback('fb1')?.resolvedBy).toBeUndefined()
    act(() => store().deleteFeedback('fb1'))
    expect(feedback('fb1')).toBeUndefined()
  })

  it('Inhalte: Info, Lesson Plans und Kontakte nur mit dem Recht dazu und im eigenen Muster', () => {
    const info = () => store().state.infoEntries.length
    const plaene = () => store().state.lessonPlans.length
    const kontakte = () => store().state.contacts.length
    const vorher = [info(), plaene(), kontakte()]
    act(() => store().switchUser('u-michael'))
    act(() => {
      store().addInfoEntry({ type: 'text', title: 'X', description: '', body: 'x', category: 'General', aircraftType: '', validFrom: '', validUntil: '', requiresAck: false })
      store().addLessonPlan({ title: 'X', description: '', aircraftType: 'C560 XLS+', category: '', fileName: '' })
      store().saveContact({ department: 'X', position: 'X', name: 'X', phone: '', email: '' })
    })
    expect([info(), plaene(), kontakte()]).toEqual(vorher)
    // Chris hat die Rechte aus der Matrix — aber nur fuer CL30.
    act(() => store().switchUser('u-christian'))
    act(() => store().addLessonPlan({ title: 'Fremd', description: '', aircraftType: 'C560 XLS+', category: '', fileName: '' }))
    expect(plaene()).toBe(vorher[1])
    act(() => store().addLessonPlan({ title: 'Eigen', description: '', aircraftType: 'CL30', category: '', fileName: '' }))
    expect(plaene()).toBe(vorher[1] + 1)
    act(() => store().deleteContact('c1'))
    expect(kontakte()).toBe(vorher[2] - 1)
  })

  it('Gruppe anlegen: nicht als Mitglied, als Gruppenadmin nur im eigenen Muster', () => {
    const anzahl = () => store().state.groups.length
    const vorher = anzahl()
    act(() => store().switchUser('u-michael'))
    act(() => store().addGroup('Mitgliedsgruppe', '', undefined))
    expect(anzahl()).toBe(vorher)
    act(() => store().switchUser('u-christian'))
    act(() => store().addGroup('Fremdes Muster', '', 'C560 XLS+'))
    expect(anzahl()).toBe(vorher)
    act(() => store().addGroup('Eigenes Muster', '', 'CL30'))
    expect(anzahl()).toBe(vorher + 1)
  })

  it('Umfragen: Ein Superadmin ohne Mitgliedschaft stimmt nicht ab, schliesst aber als Verwalter', () => {
    // Alex verlaesst „Autothrottle" — er bleibt Superadmin und verwaltet sie weiter.
    act(() => store().setGroupMembers('g-auto', ['u-christian']))
    expect(gruppe('g-auto').memberIds).toEqual(['u-christian'])
    act(() => store().vote('p1', 1))
    expect(umfrage('p1').votes['u-patrick']).toBe(0)
    act(() => store().createPoll('g-auto', 'Von aussen?', 'yesno', [], undefined))
    expect(store().state.polls.some((p) => p.question === 'Von aussen?')).toBe(false)
    act(() => store().closePoll('p1'))
    expect(umfrage('p1').closed).toBe(true)
  })

  it('Umfragen: ein fremdes Mitglied schliesst nicht, Mitglieder stimmen ab', () => {
    act(() => store().switchUser('u-michael'))
    // p1 liegt in „Autothrottle" (CL30) — Mika ist dort nicht Mitglied.
    act(() => store().closePoll('p1'))
    act(() => store().vote('p1', 1))
    act(() => store().toggleMute('g-auto'))
    expect(umfrage('p1').closed).toBe(false)
    expect(umfrage('p1').votes['u-michael']).toBeUndefined()
    // Stummschalten je Nutzer (KERN-06) — ohne Zugang auch fuer sich selbst nicht.
    expect(store().state.mutedGroups).toEqual({})
    // p2 in „SIM Defects": Mitglied — abstimmen ja, eine fremde Umfrage schliessen nein.
    act(() => store().vote('p2', 2))
    expect(umfrage('p2').votes['u-michael']).toBe(2)
    act(() => store().closePoll('p2'))
    expect(umfrage('p2').closed).toBe(false)
  })
})
