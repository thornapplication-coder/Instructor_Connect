import { describe, expect, it } from 'vitest'
import { musterFehlt, ohneErreichbareGruppe, sichtbarFuer } from '../aircraftScope'
import { mayAccessGroup } from '../gruppen'
import { GRADING_DEFAULTS } from './gradingDefaults'
import { createSeedState, wortlautEinfrieren } from './seed'

/**
 * Der Sandbox-Bestand ist die Demo, die jedes neue Gerät sieht — und die
 * Grundlage von `migrateState` und „Sandbox zurücksetzen". Er stand außerhalb
 * beider Testwachen (Audit 11/2026, TEC-18), und genau dort lagen Fehler, die
 * der Rest der App verbietet: Mika als Mitglied einer CL30-Gruppe, die er nie
 * betreten kann, und eine Nachricht von ihm darin (KERN-07). Festgehalten
 * werden die Regeln, die jeder Schreibweg der App einhält — der Seed ist der
 * eine Weg, der an ihnen vorbeigeht.
 */
const st = createSeedState()
const nutzer = (id: string) => st.users.find((u) => u.id === id)

function eindeutig(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) !== i)
}

describe('Sandbox-Bestand (createSeedState)', () => {
  it('IDs sind je Liste eindeutig', () => {
    for (const [name, liste] of Object.entries({
      users: st.users,
      groups: st.groups,
      messages: st.messages,
      polls: st.polls,
      infoEntries: st.infoEntries,
      contacts: st.contacts,
      gradingRecords: st.gradingRecords,
      lessonPlans: st.lessonPlans,
      feedbackEntries: st.feedbackEntries,
      notes: st.notes ?? [],
    })) {
      expect(eindeutig((liste as { id: string }[]).map((x) => x.id)), name).toEqual([])
    }
  })

  it('jedes Gruppenmitglied und jeder Gruppen-Admin kann die Gruppe betreten (KERN-07)', () => {
    const ohneZugang: string[] = []
    for (const g of st.groups) {
      for (const id of new Set([...g.memberIds, ...g.adminIds])) {
        const u = nutzer(id)
        if (!u || !mayAccessGroup(u, g)) ohneZugang.push(`${g.name}: ${id}`)
      }
    }
    expect(ohneZugang).toEqual([])
  })

  it('keine Nachricht, Umfrage oder Stimme eines Nutzers in einer Gruppe, die er nicht sieht', () => {
    const verstoesse: string[] = []
    const pruefen = (wo: string, groupId: string, userId: string) => {
      const g = st.groups.find((x) => x.id === groupId)
      const u = nutzer(userId)
      if (!g || !u || !mayAccessGroup(u, g)) verstoesse.push(`${wo}: ${userId} in ${groupId}`)
    }
    for (const m of st.messages) pruefen(`Nachricht ${m.id}`, m.groupId, m.authorId)
    for (const p of st.polls) {
      pruefen(`Umfrage ${p.id}`, p.groupId, p.authorId)
      for (const waehler of Object.keys(p.votes)) pruefen(`Stimme in ${p.id}`, p.groupId, waehler)
    }
    expect(verstoesse).toEqual([])
  })

  it('jeder Nutzer erfüllt Muster- und Gruppenpflicht — wie nach jedem Schreibweg der App', () => {
    expect(st.users.filter((u) => musterFehlt(u)).map((u) => u.id)).toEqual([])
    expect(st.users.filter((u) => ohneErreichbareGruppe(st.settings, u, st.groups)).map((u) => u.id)).toEqual([])
  })

  it('zugewiesene Muster gibt es im Katalog der Einstellungen', () => {
    const katalog = new Set(st.settings.aircraftTypes)
    const fremd = st.users.flatMap((u) => (u.aircraftTypes ?? []).filter((m) => !katalog.has(m)).map((m) => `${u.id}: ${m}`))
    expect(fremd).toEqual([])
  })

  it('Verweise auf Nutzer zeigen auf vorhandene Nutzer', () => {
    const ids = [
      ...st.messages.map((m) => m.authorId),
      ...st.polls.map((p) => p.authorId),
      ...st.infoEntries.map((e) => e.authorId),
      ...st.gradingRecords.map((r) => r.instructorId),
      ...st.lessonPlans.map((l) => l.uploadedBy),
    ]
    expect(ids.filter((id) => !nutzer(id))).toEqual([])
  })

  it('Lesson Plans liegen im Musterbereich ihres Hochladenden', () => {
    // Wer einen Plan außerhalb seines Musters hochlädt, verliert ihn im
    // selben Moment (musterZurAuswahl) — der Seed darf das nicht vormachen.
    const fremd = st.lessonPlans.filter((l) => !sichtbarFuer(nutzer(l.uploadedBy)!, l.aircraftType)).map((l) => l.id)
    expect(fremd).toEqual([])
  })

  it('Formulare mit Piloten tragen ihren eingefrorenen Kompetenzsatz', () => {
    const ohne = st.gradingRecords.filter((r) => r.trainees.length > 0 && !r.competencies?.length).map((r) => r.id)
    expect(ohne).toEqual([])
  })

  it('niemand ist angemeldet, und es läuft kein Code', () => {
    expect(st.currentUserId).toBeNull()
    expect(st.pendingLogin).toBeNull()
  })
})

describe('wortlautEinfrieren', () => {
  const blatt = st.gradingRecords.find((r) => r.trainees.length > 0)!
  const ohne = { ...blatt, competencies: undefined }

  it('heftet den Wortlaut des Katalogs an ein Formular mit Piloten', () => {
    const satz = GRADING_DEFAULTS.competencySets.find((c) => c.key === GRADING_DEFAULTS.formTypes.find((f) => f.id === blatt.formTypeId)!.competencySet)!
    expect(wortlautEinfrieren(ohne, GRADING_DEFAULTS).competencies).toEqual(satz.competencies.map((c) => ({ code: c.code, title: c.title })))
  })

  it('ein schon eingefrorener Wortlaut und ein Formular ohne Piloten bleiben unberührt', () => {
    expect(wortlautEinfrieren(blatt, GRADING_DEFAULTS)).toBe(blatt)
    const leer = { ...ohne, trainees: [] }
    expect(wortlautEinfrieren(leer, GRADING_DEFAULTS)).toBe(leer)
  })

  it('unbekannter Typ oder unbekannter Satz: nichts erfinden', () => {
    expect(wortlautEinfrieren({ ...ohne, formTypeId: '999' }, GRADING_DEFAULTS).competencies).toBeUndefined()
    const ohneSatz = { formTypes: GRADING_DEFAULTS.formTypes, competencySets: [] }
    expect(wortlautEinfrieren(ohne, ohneSatz).competencies).toBeUndefined()
  })
})
