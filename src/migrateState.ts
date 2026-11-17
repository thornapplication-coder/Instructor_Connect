import { createSeedState } from './sandbox/seed'
import { docCheckBereinigt } from './modules/doccheck/access'
import { FELD_NACHTRAEGE, type FeldNachtrag } from './sandbox/gradingDefaults'
import { imprintHash, IMPRINT_DE, IMPRINT_EN, IMPRINT_LEGACY_HASHES } from './sandbox/imprintDefaults'
import { LESSON_CATEGORIES, type AppState, type FormType, type Group } from './types'

/**
 * Pflichtfelder, die ein gespeicherter Stand haben MUSS, mit ihrer Vorgabe.
 *
 * Ein Stand ohne `lessonPlans` machte Startseite, Lesson Plans, Instructor
 * Info und Impressum weiß („t.lessonPlans is not iterable") — und weil der
 * Stand beim nächsten Start derselbe war, blieb die App auf dem Gerät
 * dauerhaft unbenutzbar, bis jemand die Websitedaten von Hand löschte
 * (Audit 11/2026, TEC-07). Geprüft wird die FORM, nicht nur das Vorhandensein:
 * `null` oder ein Objekt an Stelle einer Liste stürzt genauso ab.
 *
 * `users` und `gradingRecords` stehen bewusst nicht hier: Ohne Nutzer lädt
 * `ladeStand` den Stand gar nicht erst, und die Formularliste hat unten
 * einen eigenen Nachtrag mit Marke.
 */
const LISTEN = ['groups', 'messages', 'polls', 'infoEntries', 'contacts', 'lessonPlans', 'feedbackEntries'] as const
const OBJEKTE = ['seen', 'starredInfo', 'infoAcks', 'mutedGroups'] as const
const ZAHLEN = ['timeOffsetMs', 'contactsChangedAt'] as const

/** Was fehlt oder die falsche Form hat — mit Vorgabe. Leer, wenn alles passt. */
export function fehlendePflichtfelder(st: AppState): Partial<AppState> {
  const roh = st as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of LISTEN) if (!Array.isArray(roh[k])) out[k] = []
  for (const k of OBJEKTE) if (!roh[k] || typeof roh[k] !== 'object' || Array.isArray(roh[k])) out[k] = {}
  for (const k of ZAHLEN) if (typeof roh[k] !== 'number' || !Number.isFinite(roh[k])) out[k] = 0
  return out as Partial<AppState>
}

/**
 * Felder in den gespeicherten Formularkatalog nachtragen — an den Anfang
 * der Kopffelder (Nachfelder mit `ende` ans Ende), nur bei Typen, die das
 * Feld noch nicht führen. Gibt den Katalog unverändert (dieselbe Referenz)
 * zurück, wenn nichts fehlt.
 */
export function feldNachtragen(katalog: FormType[], nachtraege: readonly FeldNachtrag[]): FormType[] {
  let geaendert = false
  const neu = katalog.map((ft) => {
    const fehlend = nachtraege.filter((n) => n.typen.includes(ft.id) && !ft.fields.some((f) => f.key === n.feld.key))
    if (fehlend.length === 0) return ft
    geaendert = true
    const kopie = (n: FeldNachtrag) => ({ ...n.feld })
    return { ...ft, fields: [...fehlend.filter((n) => !n.ende).map(kopie), ...ft.fields, ...fehlend.filter((n) => n.ende).map(kopie)] }
  })
  return geaendert ? neu : katalog
}

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
export function migrateState(eingang: AppState): AppState {
  // Ohne Einstellungen ist der Bestand nicht zu retten — dann bleibt er, wie
  // er ist.
  if (!eingang.settings) return eingang
  /*
   * Die Form ZUERST richten, dann nachtragen: Die Nachträge unten lesen die
   * Listen selbst (`contacts.map` …). Stand dort ein Objekt statt einer
   * Liste, stürzte schon diese Funktion ab, bevor die Prüfung am Ende sie
   * ersetzen konnte (Gegenprüfung P3 zu TEC-07). Nur bei einem
   * gespeicherten Bestand: `users === undefined` heißt hier „kein Bestand"
   * (siehe oben) — dem wird nichts untergeschoben.
   */
  const pflicht = eingang.users === undefined ? {} : fehlendePflichtfelder(eingang)
  const st: AppState = Object.keys(pflicht).length > 0 ? { ...eingang, ...pflicht } : eingang
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

  // Demo-Platzhalter „Max Mustermann" heißt jetzt „Sam Beispiel" — Nutzer
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
    // DocCheck nur fuer Admin-Rollen (Entscheidung vom 04.11.2026): Ein
    // gespeicherter Haken beim Mitglied wirkt schon nicht mehr
    // (`docCheckRolle`), steht aber noch im Datensatz — und kaeme mit der
    // naechsten Befoerderung still zurueck. Keine Marke noetig: Der Zustand
    // ist verboten, kein bewusst gesetzter; nach dem ersten Lauf liefert
    // `docCheckBereinigt` dasselbe Objekt, und der fruehe Ausstieg greift.
    // Keine Audit-Zeile: Die wirksame DocCheck-Rolle aendert sich nicht.
    const bereinigt = docCheckBereinigt(u)
    const umbenannt = bereinigt.id === 'u-max' && bereinigt.name === 'Max Mustermann' ? { ...bereinigt, name: 'Sam Beispiel' } : bereinigt
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
  const contacts = st.contacts?.map((c) => (c.id === 'c2' && c.name === 'Max Mustermann' ? { ...c, name: 'Sam Beispiel' } : c))

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
   * Formularkatalog nachtragen (FELD_NACHTRAEGE), GENAU EINMAL je Nachtrag.
   *
   * Audit 11/2026, GTY-02: 308C/308D bekamen das Pflichtfeld Aircraft Type.
   * Der Katalog liegt im gespeicherten Stand — ohne Nachtrag blieben die
   * beiden auf jedem laufenden Gerät musterlos. GTY-03: 308G bekam die
   * Sessiondauer (Session Time) — sonst zählte jedes 308G mit Session
   * 00:00 im Logbuch. Mit Marke, damit ein Admin, der das Feld bewusst
   * wieder entfernt, es beim nächsten Start nicht zurückbekommt; dieselbe
   * Falle wie bei `aircraftBackfilled`.
   */
  const nachtraegeErledigt = st.formularNachtraege ?? []
  const offeneNachtraege = st.users === undefined ? [] : FELD_NACHTRAEGE.filter((n) => !nachtraegeErledigt.includes(n.marke))
  const katalog = st.settings.grading?.formTypes
  const formTypes = katalog && offeneNachtraege.length > 0 ? feldNachtragen(katalog, offeneNachtraege) : katalog
  // Marke auch ohne Änderung — wie bei den übrigen Nachträgen.
  const markFormulare = offeneNachtraege.length > 0

  /*
   * Stummschalten je Nutzer (Audit 11/2026, KERN-06): Das alte `muted` an
   * der Gruppe galt fuer ALLE Mitglieder. Es wird verworfen, nicht auf
   * Nutzer verteilt — wer es gesetzt hat, steht nirgends, und es allen
   * Mitgliedern zuzuschreiben hiesse, die Fehlwirkung festzuschreiben. Die
   * neue Liste (`mutedGroups`) beginnt leer; die Form-Pruefung oben legt sie
   * an. Mit Marke wie jeder Nachtrag hier, damit der Lauf beim naechsten
   * Start nichts mehr anfasst.
   */
  const stummDone = st.stummJeNutzer === true || st.users === undefined
  const altesStumm = !stummDone && st.groups.some((g) => 'muted' in g)
  const groups: Group[] = altesStumm
    ? st.groups.map((g) => ('muted' in g ? (Object.fromEntries(Object.entries(g).filter(([k]) => k !== 'muted')) as unknown as Group) : g))
    : st.groups
  const markStumm = !stummDone

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
    !markFormulare &&
    !markStumm &&
    !notesFehlten &&
    !kopfFehlte &&
    !formulareFehlten &&
    !impAlt
  )
    // Gegebenenfalls mit gerichteter Form (oben) — dann ist `st` schon neu.
    return st
  return {
    ...st,
    gradingRecords,
    notes,
    seedHistoryMigrated: st.seedHistoryMigrated || markSeedHistory || undefined,
    aircraftBackfilled: st.aircraftBackfilled || markAircraft || undefined,
    stummJeNutzer: st.stummJeNutzer || markStumm || undefined,
    groups,
    formularNachtraege: markFormulare
      ? [...nachtraegeErledigt, ...offeneNachtraege.map((n) => n.marke)]
      : st.formularNachtraege,
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
      ...(formTypes !== katalog && st.settings.grading ? { grading: { ...st.settings.grading, formTypes: formTypes! } } : {}),
    },
  }
}
