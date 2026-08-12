import { createSeedState } from './sandbox/seed'
import { LESSON_CATEGORIES, type AppState } from './types'

/**
 * Sanfte Datenmigrationen auf bereits gespeicherten Zustand — OHNE
 * STATE_VERSION-Bruch, der alle Daten verwerfen würde.
 *
 * Die ATO-Identität lag anfangs als Platzhalter im Zustand
 * („Austrian Aviation Academy", „AT.ATO.007"). Da sie beim Anlegen in die
 * gespeicherten Einstellungen wandert, überlebt der alte Wert eine reine
 * Seed-Änderung und stand weiter im Export-Kopf. Hier wird er auf die
 * echte Organisation umgestellt — aber nur, wenn er noch der Platzhalter
 * (oder leer) ist; eine bewusst gesetzte eigene Angabe bleibt unangetastet.
 */
export function migrateState(st: AppState): AppState {
  const dh = st.settings?.documentHeader
  if (!dh) return st
  const OLD_NAMES = ['', 'Austrian Aviation Academy']
  const OLD_NRS = ['', 'AT.ATO.007']
  const atoName = OLD_NAMES.includes(dh.atoName) ? 'Aviation Academy Austria' : dh.atoName
  const approvalNumber = OLD_NRS.includes(dh.approvalNumber) ? 'AT.ATO.106' : dh.approvalNumber
  // Die UK-Nummer gab es im alten Schema nicht — fehlt sie, ergänzen.
  const approvalNumberUK = dh.approvalNumberUK || 'GBR.ATO.0541'
  // „General" als Kategorie in Feedback und Instructor Info sicherstellen —
  // auch auf Bestandsgeräten, deren gespeicherte Listen sie noch nicht haben.
  const withGeneral = (list: string[] | undefined) =>
    list && !list.includes('General') ? ['General', ...list] : list
  const feedbackCategories = withGeneral(st.settings.feedbackCategories)
  const infoCategories = withGeneral(st.settings.infoCategories)
  // Schulungsarten der Lesson Plans: Es gab sie im alten Schema nicht. Ohne
  // Nachtrag stünde das Auswahlfeld auf Bestandsgeräten leer, und die
  // Gliederung nach Schulungsart hätte nichts zu gliedern.
  const lessonCategories = st.settings.lessonCategories?.length ? st.settings.lessonCategories : [...LESSON_CATEGORIES]

  // Demo-Platzhalter „Max Mustermann" heißt jetzt „Steven Fermie" — Nutzer
  // (u-max) und Verzeichniskontakt (c2), nur solange der alte Name steht.
  const users = st.users?.map((u) => (u.id === 'u-max' && u.name === 'Max Mustermann' ? { ...u, name: 'Steven Fermie' } : u))
  const contacts = st.contacts?.map((c) => (c.id === 'c2' && c.name === 'Max Mustermann' ? { ...c, name: 'Steven Fermie' } : c))

  // Changelog zurückgesetzt: nur noch der 1.0.0-Erststand (mit Datum+Uhrzeit).
  // Alte, angesammelte Einträge fallen damit weg.
  const clNeedsReset = !(st.changelog?.length === 1 && st.changelog[0].version === '1.0.0')
  const changelog = clNeedsReset ? [{ version: '1.0.0', at: Date.now(), changes: 'Erststand.' }] : st.changelog

  // Die drei historischen Sessions von Sophie Berger nachtragen: Ohne sie
  // zeigt der Verlauf je Pilot auf Bestandsgeräten nur eine Session und damit
  // überall „zu wenige Sessions" — die Funktion wäre da, aber unsichtbar.
  //
  // Der Nachtrag läuft GENAU EINMAL und merkt sich das (seedHistoryMigrated).
  // Vorher hing die Entscheidung allein daran, ob noch eines der drei Blätter
  // im Bestand lag: Wer sie als Superadmin vollständig löschte, bekam sie beim
  // nächsten Laden zurück — und weil createSeedState() alle Zeitstempel gegen
  // die aktuelle Uhr rechnet, jedes Mal mit anderem Datum. Ein Löschen, das
  // sich von selbst rückgängig macht, ist in einer Ausbildungsablage das
  // Gegenteil dessen, was der Nutzer angewiesen hat.
  const histIds = ['gr-hist1', 'gr-hist2', 'gr-hist3']
  const histDone = st.seedHistoryMigrated === true || st.gradingRecords === undefined
  const histMissing = !histDone && !st.gradingRecords.some((r) => histIds.includes(r.id))
  const gradingRecords = histMissing
    ? [...createSeedState().gradingRecords.filter((r) => histIds.includes(r.id)), ...st.gradingRecords]
    : st.gradingRecords
  // Marke auch dann setzen, wenn nichts zu ergänzen war — der Nachtrag ist
  // damit endgültig erledigt, nicht nur für diesen Start.
  const markSeedHistory = !histDone

  // Notizen gab es im alten Schema nicht. Ohne diese Zeile stuerzte jede
  // Stelle ab, die `state.notes.length` liest, statt eine leere Liste zu
  // sehen — und der ganze Bereich waere auf Bestandsgeraeten unbenutzbar.
  const notes = st.notes ?? []

  const headerChanged = atoName !== dh.atoName || approvalNumber !== dh.approvalNumber || approvalNumberUK !== dh.approvalNumberUK
  const catsChanged =
    feedbackCategories !== st.settings.feedbackCategories ||
    infoCategories !== st.settings.infoCategories ||
    lessonCategories !== st.settings.lessonCategories
  const usersChanged = users !== st.users && users?.some((u, i) => u !== st.users[i])
  const contactsChanged = contacts !== st.contacts && contacts?.some((c, i) => c !== st.contacts[i])
  const notesFehlten = st.notes === undefined
  if (!headerChanged && !catsChanged && !usersChanged && !contactsChanged && !clNeedsReset && !histMissing && !markSeedHistory && !notesFehlten)
    return st
  return {
    ...st,
    gradingRecords,
    notes,
    seedHistoryMigrated: st.seedHistoryMigrated || markSeedHistory || undefined,
    users: usersChanged ? users! : st.users,
    contacts: contactsChanged ? contacts! : st.contacts,
    changelog,
    settings: {
      ...st.settings,
      documentHeader: { ...dh, atoName, approvalNumber, approvalNumberUK },
      feedbackCategories: feedbackCategories ?? st.settings.feedbackCategories,
      infoCategories: infoCategories ?? st.settings.infoCategories,
      lessonCategories,
    },
  }
}
