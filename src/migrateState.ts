import { createSeedState } from './sandbox/seed'
import { imprintHash, IMPRINT_DE, IMPRINT_EN, IMPRINT_LEGACY_HASHES } from './sandbox/imprintDefaults'
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
  // Ohne Einstellungen ist der Bestand nicht zu retten — dann bleibt er, wie
  // er ist.
  if (!st.settings) return st
  /*
   * Fehlende Kopfdaten sind KEIN Grund, alles Uebrige zu ueberspringen.
   * Hier stand `if (!dh) return st` — und darunter liegen saemtliche
   * Feld-Nachtraege: Notizen, Schulungsarten, Kategorien, die historischen
   * Sessions. Ein Geraet aus der Zeit vor `documentHeader` startete damit
   * ohne `notes`, und jede Stelle, die `state.notes.length` liest, lief auf
   * `undefined` — genau der Absturz, den der Nachtrag verhindern soll.
   */
  const dh = st.settings.documentHeader ?? { atoName: '', approvalNumber: '', approvalNumberUK: '', formRevision: '' }
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
  /*
   * Musterzuordnung nachtragen.
   *
   * Seit die Sichtbarkeit von Lesson Plans, Instructor Info und Chats am
   * Aircraft Type haengt, ist ein Konto ohne Zuordnung fuer nichts mehr
   * zustaendig — es saehe von allem Musterbezogenen nichts. Bestehende Konten
   * ohne Zuordnung bekommen deshalb ALLE Muster, nicht keines: Der Umstieg
   * darf niemandem etwas wegnehmen, was er gestern noch sah. Wer danach
   * einschraenken will, tut das bewusst im Admin-Panel.
   *
   * Beim Anlegen gilt die Pflicht (Dialog und Store) — nachtraeglich leeren
   * kann man die Liste weiterhin, das ist dann eine Entscheidung und kein
   * Altbestand.
   *
   * **Und deshalb laeuft der Nachtrag GENAU EINMAL** (`aircraftBackfilled`).
   * Ohne Marke lief er bei jedem Start, auch ueber den gerade gespeicherten
   * Stand: Wer einem Mitglied bewusst das letzte Muster entzog, fand es beim
   * naechsten Neuladen mit ALLEN Mustern wieder — die Korrektur lief also in
   * die weite Richtung und stellte genau den Zustand her, den die Regel
   * verhindern soll. Nachgemessen: ein Mitglied stand danach auf allen acht
   * Mustern. Dieselbe Falle war in dieser Datei schon einmal erkannt und mit
   * einer Marke geloest worden (`seedHistoryMigrated`) — ein Loeschen, das
   * sich von selbst rueckgaengig macht, ist das Gegenteil dessen, was der
   * Nutzer angewiesen hat.
   */
  const alleMuster = st.settings.aircraftTypes ?? []
  // Ein frisch aufgebauter Seed braucht keinen Nachtrag; ein gespeicherter
  // Stand ohne Marke schon. `users === undefined` heisst: kein Bestand.
  const musterDone = st.aircraftBackfilled === true || st.users === undefined
  const users = st.users?.map((u) => {
    const umbenannt = u.id === 'u-max' && u.name === 'Max Mustermann' ? { ...u, name: 'Steven Fermie' } : u
    // `aircraftTypes` darf auch dann nicht `undefined` bleiben, wenn es
    // nichts nachzutragen gibt: Ansichten und Sammelaktionen lesen das Feld
    // ungeprueft, und ein Stand aus der Zeit vor dem Feld haette es sonst gar
    // nicht. Der Nachtrag ist die Ausnahme, die Vereinheitlichung die Regel.
    //
    // Beides aber nur, wenn wirklich etwas fehlt: Ein unbedingt neu gebautes
    // Objekt liesse `usersChanged` bei JEDEM Lauf anschlagen, und die
    // Migration gaebe nie wieder denselben Stand zurueck — der fruehe
    // Ausstieg waere tot, jeder Start schriebe den Speicher neu.
    const vorhanden = umbenannt.aircraftTypes
    if (vorhanden !== undefined && vorhanden.length > 0) return umbenannt
    if (!musterDone && alleMuster.length > 0) return { ...umbenannt, aircraftTypes: [...alleMuster] }
    return vorhanden === undefined ? { ...umbenannt, aircraftTypes: [] } : umbenannt
  })
  // Marke auch dann setzen, wenn nichts nachzutragen war — der Umstieg ist
  // damit endgueltig erledigt, nicht nur fuer diesen Start.
  const markAircraft = !musterDone
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
    : // Auch die Formularliste selbst darf nicht `undefined` bleiben: Der
      // Offline-Streifen zaehlt darauf den Ausgangskorb, ungeprueft.
      (st.gradingRecords ?? [])
  // Marke auch dann setzen, wenn nichts zu ergänzen war — der Nachtrag ist
  // damit endgültig erledigt, nicht nur für diesen Start.
  const markSeedHistory = !histDone

  /*
   * Impressum: Der Text steht in den Einstellungen, eine geaenderte Vorgabe
   * erreicht Bestandsgeraete also nicht. Ersetzt wird er nur, solange er noch
   * unveraendert der vorigen Vorgabe entspricht (Pruefsumme) — eine im Admin
   * Panel selbst geschriebene Fassung bleibt unangetastet. Der Text nennt
   * inzwischen Module und einen Datenschutz-Abschnitt, die es beim alten
   * Stand noch nicht gab; ihn dort stehen zu lassen hiesse, den Nutzern eine
   * ueberholte Zusage zu zeigen.
   */
  const imp = st.settings.imprint
  const impAlt = !!imp && IMPRINT_LEGACY_HASHES.includes(imprintHash(imp.de)) && IMPRINT_LEGACY_HASHES.includes(imprintHash(imp.en))
  const imprint = impAlt ? { de: IMPRINT_DE, en: IMPRINT_EN } : imp

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
  const kopfFehlte = st.settings.documentHeader === undefined
  const formulareFehlten = st.gradingRecords === undefined
  if (
    !headerChanged &&
    !catsChanged &&
    !usersChanged &&
    !contactsChanged &&
    !clNeedsReset &&
    !histMissing &&
    !markSeedHistory &&
    // Auch die Muster-Marke muss den fruehen Ausstieg kennen: Ein Geraet, das
    // die Verlaufs-Migration schon hinter sich hat und dessen Nutzer alle
    // zugeordnet sind, verliesse die Funktion sonst hier — ohne die Marke zu
    // setzen. Der Nachtrag bliebe damit fuer immer scharf und schluege beim
    // ersten Entzug zu. Genau der Fehler, den die Marke verhindern soll,
    // haette sich hinten herum wieder eingeschlichen.
    !markAircraft &&
    !notesFehlten &&
    !kopfFehlte &&
    !formulareFehlten &&
    !impAlt
  )
    return st
  return {
    ...st,
    gradingRecords,
    notes,
    seedHistoryMigrated: st.seedHistoryMigrated || markSeedHistory || undefined,
    aircraftBackfilled: st.aircraftBackfilled || markAircraft || undefined,
    users: usersChanged ? users! : st.users,
    contacts: contactsChanged ? contacts! : st.contacts,
    changelog,
    settings: {
      ...st.settings,
      imprint,
      documentHeader: { ...dh, atoName, approvalNumber, approvalNumberUK },
      feedbackCategories: feedbackCategories ?? st.settings.feedbackCategories,
      infoCategories: infoCategories ?? st.settings.infoCategories,
      lessonCategories,
    },
  }
}
