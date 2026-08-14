# Changelog — Instructor Connect

Semantische Versionierung (MAJOR.MINOR.PATCH).

Diese Datei fuehrt die Entwicklungsgeschichte des Repos. Der Changelog IN der
App steht bewusst auf einem einzigen 1.0.0-Eintrag (Erststand) — er richtet
sich an Instruktoren, nicht an Entwickler.

## 1.0.0 — 2026-08-04

Erstversion (Sandbox-Modus, ohne Backend):

- Startseite mit vier Kacheln (Chat, Feedback, Instructor Info, Who to call)
- Gruppenchats mit Umfragen (Ja/Nein, Mehrfachauswahl), fetten Admin-Nachrichten
  und Chat-Info-Ansicht (Aufbewahrungsdauer, Anhang-Löschhinweis)
- Aufbewahrungs-Engine mit globaler Voreinstellung und Gruppen-Override
- Instructor-Info-Bibliothek (PDF + Text, Suche)
- Who-to-call-Verzeichnis (tel:/mailto:, Abteilungsfilter)
- Feedback-Formular (Mehrfach-Gruppenauswahl, Kategorien, nicht anonym)
- Admin Panel (Benutzer, Gruppen, Einstellungen, Changelog)
- Zweisprachig DE/EN, dunkelblaues Theme, Sandbox-Leiste mit Rollenwechsler,
  Zeitraffer und Daten-Reset

## 1.1.0 — 2026-08-09

- Grading Tool: Formulare 306, 307A/B, 308A–H und 310 nach OM Appendix 5,
  Kompetenzbewertung mit Unterschriften, Pflicht-Folgeformularen und Ampel
- Lesson Plans je Muster
- Instructor Info mit Gültigkeit, Zielgruppen und Lese-Bestätigung samt
  Kontrollliste
- Rolle Training Admin, Rechte-Matrix im Superadmin-Panel
- Anmeldung ausschließlich per E-Mail, wahlweise über einen Code
- Offline-Modus (PWA) mit Update-Banner, Druck-Layout

## 1.1.1 — 2026-08-09

- Gruppen lassen sich jetzt auch im Chat löschen (Gruppen-Info), nicht nur im
  Admin Panel. Ist ein Mitglied nur in dieser einen Gruppe, wird das Löschen
  mit Namensnennung gesperrt — vorher verpuffte der Klick wortlos, auch im
  Admin Panel.
- Die Bereiche der Verwaltung haben eigene Adressen (`#/admin/users`,
  `#/admin/grading/stats`): verlinkbar, Zurück-Taste geht eine Ebene hoch, ein
  erneuter Aufruf von `#/admin` führt in die Übersicht zurück.

- Offline-Betrieb: Die App startet ohne Netz aus dem Cache. Ohne Empfang
  unterschriebene Formulare gehen in den Ausgangskorb (Ampel gelb, nicht rot)
  und werden selbsttätig versendet, sobald wieder Empfang da ist. Ein Streifen
  zeigt Offline-Zustand und Zahl der wartenden Formulare.
- Standardisierungsbericht je Instruktor gegen das Flottenmittel
  (ORA.ATO.110), druckbar und als CSV, mit Mindestmenge vor jeder
  Kennzeichnung
- Jede Seite und jedes Formular beginnt oben — auch bei Navigation ohne
  Adresswechsel (Admin-Kacheln, Formularschritte)
- Dialoge: Der Fokus blieb nicht im Eingabefeld; beim Anlegen einer Gruppe kam
  nur der erste Buchstabe an. Betraf jeden Dialog der App.

## 1.2.0 — 2026-08-09

Vollaudit und Behebung. Zehn Blocker, 44 Major- und die überwiegende Zahl der
Minor-Befunde behoben.

Formulare und Aktenlage:

- Ein Formular 306 je nicht bestandenem Piloten statt eines je Durchgang
- Unterschriebene Formulare frieren den Kompetenz-Wortlaut ein
- 306 und 310 nennen den Piloten
- Ein Folgeformular erfüllt die Pflicht erst mit der Unterschrift
- 307A mit Unterschrift je Teilnehmer, 307B mit Erklärung des Instruktors
- 308G nach dem Wortlaut der Originaltabelle, ohne Verweis auf die
  Pilotenformulare
- Ein Blatt ohne eine einzige echte Note lässt sich nicht abschließen

Daten und Rechte:

- Statistik getrennt nach Piloten- und Instruktoren-Kompetenzen
- CSV nach RFC 4180 mit Formelschutz und Dezimalkomma, Folgeformulare inklusive
- Objektbezogene Berechtigung auf Formularen, Gruppenadmin nur eigene Gruppen
- Konten werden deaktiviert statt gelöscht; letzter Superadmin geschützt
- Der Anwendungszustand übersteht ein Neuladen

Druck und Bedienung:

- A4 mit schmalem Rand, ein Blatt je Formular, Querformat für breite Tabellen
- Alle Trefferflächen mindestens 44 × 44 px, Kontraste durchgehend WCAG AA
- Dialoge mit Escape, Schließen-Kreuz und Fokusfalle
- Das Grading-Formular fragt vor dem Verlassen und sichert einen Entwurf

## 1.3.0 — 2026-08-12

Neue Bausteine, Zwischenaudit und dessen Umsetzung.

Neu:

- **Notes**: persönliche Merkliste je Benutzer mit Suche und Anheften. Privat —
  kein Admin sieht sie, kein Export enthält sie; der Training Admin hat das
  Modul nicht
- **Benutzerimport**: Excel-/CSV-Vorlage im Admin-Panel, Vorschau je Zeile vor
  dem Anlegen, Prüfung gegen Domainliste, Bestand, Muster und Rollen
- **Feedback**: Kategorie „Safety" warnt sofort, dass ein Safety Report gehört
- **Lesson Plans**: zweite Gliederung nach Schulungsart, im Admin-Panel pflegbar
- Monatsbericht nur noch als Reiter im Grading Tool, nicht mehr als Kachel
- Ablage des Training Admins nach Schulungstag gebündelt, jüngster Tag zuerst

Dokument und Nachweis:

- Der Dokumentkopf steht auf **jedem** Blatt und nennt die geschulte Person;
  Kopf und Fuß standen vorher je einmal
- Name der geschulten Person in Kopfdaten, Druckfuß und PDF-Dateinamen — die
  Grading Sheets nannten ihn erst weit unten über dem Notenraster
- ATO-Name, Zulassungsnummer, Formularstand und Formulartitel werden beim
  Unterschreiben eingefroren und sind Teil des Fingerabdrucks (Fassung 3)
- Das Ankreuzfeld „Competent" folgt der Regel statt dem Rohwert: Eine 1 oder
  zwei Zweien machen einen Piloten rechnerisch nicht bestanden
- 306/310 verlangen ihre Freitexte; ein Folgeformular zählt nur für denselben
  Piloten, und es braucht eines je nicht bestandenem Piloten
- Notenmaßstab und Rückverweis aufs Ausgangsblatt auf dem Ausdruck
- Export mit Authority, SignedAt und Fingerprint

Daten und Anmeldung:

- Sicherung hängt an echten Änderungen statt am 5-Sekunden-Takt; Schreiben vor
  `pagehide`; Tab-Abgleich übernimmt nur jüngere Stände; erst schreiben, dann
  die anderen Tabs benachrichtigen
- Versions-Sicherungen mit Zeitstempel, beim Zurücksetzen mitgeräumt
- Service Worker: Zeitgrenze für Seitenaufrufe, Schutz gegen Anmeldeseiten im
  Cache, Neuladen aller Tabs nach einer Übernahme
- Schnellanmeldung nur noch in der Sandbox; Rechtematrix und Import prüfen den
  Handelnden; Sitzung und Aktiv-Status werden laufend geprüft
- Entwürfe tragen den Nutzer im Schlüssel (geteiltes iPad)

Bedienung:

- Überschriften app-weit aus zwei Komponenten, deutlicher gesetzt
- Umbruch: Beschriftung und Knöpfe quetschen sich nicht mehr gegenseitig
  („Clear", Reiter der Ablage, Ergebnis-Badge)
- Barrierefreiheit: Namen an Filtern und Icon-Knöpfen, Notenknöpfe als benannte
  Gruppe mit angesagtem Zustand, Kontrast des aktiven Zustands, Fokus nach
  Ansichtswechsel, Schrift am Bildschirm mindestens 12 px

## 1.4.0 — 2026-08-13

Drei Pakete aus der UX-Bewertung.

Startseite und Listen:

- Ungelesenes trägt eine blaue Zählmarke mit Zahl; der grüne Punkt bleibt
  allein der Ampel des Grading Tools vorbehalten. Vorher bedeutete dieselbe
  Farbe an derselben Stelle zwei entgegengesetzte Dinge.
- Leere Listen unterscheiden „hier ist nichts" von „der Filter zeigt nichts"
  und bieten im zweiten Fall an, alles zu zeigen
- Chatliste nennt den Zeitpunkt der letzten Nachricht statt der Aufbewahrungsfrist
- Offene Lese-Bestätigungen stehen in der Instructor Info oben

Formular:

- Kopfdaten kommen vorbelegt (Datum, einziges Muster, Gerät, Qualifikation,
  Sitz aus dem letzten eigenen Blatt)
- Angefangene Entwürfe stehen als Karte über der Liste
- Kompaktere Kompetenzblöcke, Kommentarfeld erst auf Klick
- Feste Leiste unten nennt Notenstand und offene Punkte und springt zur
  nächsten offenen Stelle
- Unterschriftsfeld höher, mit Rückgängig und Vollbild

Optik:

- Statusmarken app-weit aus einer Komponente mit fünf Tönen; „Not Competent"
  sah in Liste, Akte und Detailansicht dreimal verschieden aus
- Die Ampel steht nur noch einmal je Zeile
- Am Desktop begrenzte Seitenbreite (1152 px, breite Seiten 1280 px) statt
  Inhalt über die volle Fensterbreite; Karten füllen die Breite in zwei
  Spalten. Sieben Startseiten-Kacheln in vier Spalten statt sechs.
- Schrift- und Abstandsskala festgeschrieben: elf Schriftstufen und vier
  Abstandsstufen ersetzen 448 Einzelwerte im Markup; ein Test hält sie frei

Ablage (Training Admin):

- Suche über Pilot, Instruktor, Formular und Datum, dazu ein Filter nach
  Formulartyp — beides gab es bisher nur im Superadmin-Panel
- CSV-Auszug der gefilterten Auswahl (Formulare und Kompetenzen). Vorher
  musste jedes Blatt einzeln als PDF gezogen werden; eine Jahresauswertung
  war Handarbeit. Der Dateikopf nennt den Ausschnitt, den er zeigt.
- Der Behördenexport liegt jetzt als geprüfte Funktion in
  `src/gradingExport.ts` statt als Closure im Admin-Panel — eine Quelle für
  beide Ansichten

Verwaltung und Rückmeldung:

- Über den Kacheln des Admin-Panels steht, was gerade wartet: gescheiterte
  Versendungen, fehlende Pflichtformulare, offene Unterschriften und
  unbearbeitete Rückmeldungen. Jeder Punkt springt dorthin, wo er zu
  erledigen ist; wartet nichts, steht auch das da.
- Kurze Bestätigungen nach jeder endgültigen Aktion (Formular abgeschlossen,
  Notiz gelöscht, Auszug heruntergeladen …). Beim Grading-Formular
  unterscheiden sie die drei Ausgänge, die vorher gleich aussahen:
  unterschrieben und versendet, im Ausgangskorb, oder noch etwas offen.
- Sammelbearbeitung von Benutzern: aktiv/inaktiv, Bewertungsrecht,
  Trainee-Kennzeichen, Verzeichnisrecht, Chat-Sperre und Musterzuweisung für
  mehrere Konten auf einmal. Gemeldet wird, was sich wirklich ändert; das
  eigene Konto und der letzte aktive Superadmin werden ausgelassen und
  benannt. Die Rolle bleibt Einzelentscheidung.
- Die Ampel hat nur noch eine Gestalt: Haken, Fragezeichen, Kreuz — in der
  Legende, in jeder Listenzeile, auf der Kachel und in der Akte. Vorher zeigte
  die Legende Kreis/Dreieck/Quadrat, die Zeilen darunter aber Haken/
  Fragezeichen/Kreuz; die Legende ließ sich auf die Liste nicht anwenden. Die
  Farben kommen jetzt aus dem Theme und sind damit auch im Dunkelmodus klar.

## 1.4.1 — 2026-08-13

Gegengelesen und nachgebessert. Ein unabhängiger Durchgang durch die
Änderungen der Version 1.4.0 fand sechs Fehler, die beim Bauen nicht
aufgefallen waren:

- **Sammelbearbeitung:** Die Auswahl überlebte jeden Filterwechsel. Wer 100
  Instruktoren auswählte, dann den Filter umstellte und „Deaktivieren"
  drückte, sperrte 100 Konten aus, von denen keines sichtbar war. Aktionen
  wirken jetzt ausschließlich auf die angezeigte Liste; die Auswahl wird beim
  Wechsel bereinigt.
- **Fortschrittsleiste:** Sie meldete „Alles erledigt", während das Absenden
  blockierte — bei 306 und 310 mit leeren Freitexten, bei den
  Anwesenheitslisten 307A/B und bei einem Blatt aus lauter „NO". Beide
  Prüfungen sind jetzt eine einzige; offene Punkte führen zur Fundstelle,
  auch wenn sie auf Schritt 1 liegt.
- **Bestätigungen** verdeckten den Offline-Streifen. Alle Leisten am unteren
  Rand liegen jetzt untereinander statt übereinander.
- Die Bestätigung wurde von Sprachausgaben **nicht vorgelesen**, weil die
  Live-Region erst zusammen mit ihrem Text entstand.
- **Statusmarken im Ton `dim`** hatten keine Fläche: `bg-line/8` erzeugte gar
  kein CSS. Ein Test hält solche Stufen jetzt frei.
- Die **Vollbild-Unterschrift** war ein Dialog ohne Dialog-Eigenschaften —
  ohne Escape, ohne Fokusfang, und „Clear" lag hinter dem Overlay.

Kleiner: Entwürfe von Folgeformularen tauchen wieder in der Entwurfsliste auf
· fehlendes Pflichtformular ist in der Statuszeile gelb wie in der Liste ·
zwei weitere Klassen ohne CSS entfernt.

## 1.5.0 — 2026-08-13

Sichtbarkeit folgt dem Aircraft Type.

Bisher filterte genau ein Bereich nach Muster: die Lesson Plans. Instructor
Info lief über Gruppen, der Chat über Mitgliedschaft — dass beides
musterbezogen wirkte, lag nur daran, dass die Gruppen meist nach Mustern
geschnitten sind. Eine gemischte Gruppe zeigte CL30-Leuten C560-Inhalte.

- **Lesson Plans, Instructor Info und Chats** folgen jetzt derselben Regel
  (`src/aircraftScope.ts`) — für **Mitglied und Admin**. Wer als Admin ein
  Muster betreut, muss ihm zugeordnet sein.
- **Superadmin und Training Admin sehen alles**, unabhängig von ihrer
  Zuordnung. Beide haben Aufgaben, die den ganzen Betrieb betreffen; wer sie
  einschränkte, machte genau die Rollen blind, die den Überblick brauchen.
- **Ohne Musterangabe heißt „betrifft alle"** — allgemeine Info-Einträge und
  musterübergreifende Gruppen bleiben für jeden sichtbar.
- **Die Zuordnung ist beim Anlegen Pflicht**, als Mehrfachauswahl, für
  Mitglied und Admin — also dort, wo sie etwas bewirkt. Vorher legte der
  Dialog jeden Nutzer ohne Muster an; nachtragen ging nur in der
  aufgeklappten Zeile, und wer das vergaß, sah keinen einzigen Lesson Plan.
  Die Regel steht auch im Store, nicht nur im Dialog.
- **Bestehende Konten ohne Zuordnung bekommen alle Muster.** Der Umstieg
  nimmt niemandem etwas weg; einschränken ist danach eine bewusste
  Entscheidung.
- Der Musterbereich gilt auch beim direkten Aufruf einer Chat-Adresse — sonst
  wäre die Filterung Kosmetik.

Nicht betroffen: Formularablage, Statistik und Behördenexport bleiben
rollenbasiert (ORA.GEN.220).

## 1.5.1 — 2026-08-13

Dokumentation auf den Stand gebracht. Kein Verhalten geändert.

- **Die falsche Zusage zur Testpflicht ist auch aus README und CI-Workflow
  raus.** Beide behaupteten weiter, die Abdeckungsschwelle allein lasse eine
  ungetestete neue Datei durchfallen — der Irrtum, der `src/testGuard.test.ts`
  überhaupt nötig gemacht hat. Er stand an vier Stellen; korrigiert waren
  bisher zwei. Jetzt nennen alle vier beide Wachen und ihren Unterschied.
- **Die musterbezogene Sichtbarkeit steht in der README**, mit Rollentabelle
  und den drei Festlegungen. Vorher war sie dort nur als Nebensatz beim
  Lesson Plan zu finden, obwohl sie inzwischen für drei Module gilt.
- **Ebene 2 ist in der README beschrieben** — die beiden Testprojekte, ihre
  Umgebungen und warum sie getrennt laufen.
- Die Admin-Kachel heißt seit 1.4.0 **Chats**; die README sagte an drei
  Stellen noch „Gruppen".
- Die feste Dateizahl beim Reproduzierbarkeits-Nachweis („über alle 66") ist
  raus: Sie driftet mit jedem Build (inzwischen 67), und die CI vergleicht
  ohnehin Prüfsummen, keine Anzahlen. Eine Zahl, die niemand nachzieht, ist
  schlechter als keine.
- `package.json` stand auf 1.0.0, während dieser Changelog bei 1.5.0 war —
  gleichgezogen (samt `package-lock.json`). Der Changelog **in** der App
  bleibt bewusst auf dem einen 1.0.0-Eintrag; er richtet sich an
  Instruktoren.

## 1.5.2 — 2026-08-13

Gegenlesung der Musterregel durch drei Prüfer. Der Kern der Regel hielt —
alle Befunde lagen an den Aufrufstellen.

**Der schwerste zuerst:** `migrateState` trug die Musterzuordnung ohne Marke
nach und lief damit bei **jedem** Start, auch über den gerade gespeicherten
Stand. Wer einem Mitglied bewusst das letzte Muster entzog, fand es nach dem
nächsten Neuladen mit **allen** Mustern wieder — die Korrektur lief in die
weite Richtung und stellte genau den Zustand her, den die Regel verhindern
soll. Nachgemessen im Browser. Der Nachtrag läuft jetzt genau einmal
(`aircraftBackfilled`); dieselbe Falle war in derselben Datei schon einmal
gestellt und mit einer Marke gelöst worden.

**Die Pflicht galt nur beim Anlegen.** Vier weitere Schreibwege kannten sie
nicht, weil die Bedingung in `addUser` von Hand ausgeschrieben stand:

- **Der CSV-Import** legte Mitglieder ohne Muster an, und die Vorschau meldete
  sie grün — auf dem Weg, der nicht einen Nutzer anlegt, sondern
  hundertfünfzig. Jetzt blockiert `aircraftMissing` die Zeile, in der Vorschau
  **und** im Store. Wer als einziges Muster ein unbekanntes nennt, fällt
  ebenfalls auf: Verworfen wird es weiterhin, aber danach ist die Liste leer.
- **Die Sammelbearbeitung** leerte bei „Muster entfernen" die Liste derer, die
  nur dieses eine hatten — vierzig Klicks, dreißig blinde Konten, und der
  Zähler meldete Erfolg. Jetzt übersprungen und benannt, wie beim
  Aussperr-Schutz.
- **Ein Rollenwechsel** von Superadmin (darf ohne Muster sein) zu Mitglied
  erzeugte denselben Zustand, ohne dass jemand ein Muster angefasst hätte.
- **Das letzte Muster** ließ sich in der Nutzerzeile wortlos abwählen. Jetzt
  gesperrt und begründet — bei den Gruppen direkt darüber gibt es das seit
  jeher.

Alle fünf fragen jetzt `musterFehlt`.

**Zwei Wege, die Schranke zu umgehen:**

- Ein Gruppenadmin, der als Admin einer Gruppe fremden Musters eingetragen
  war, konnte sie zwar nicht betreten, im Panel aber ihr Muster auf „Ohne
  Muster" stellen — und stand danach mit der vollen Historie drin. Umbenennen,
  Mitglieder tauschen und Löschen hingen an derselben Prüfung. `maySeeGroup`
  prüft jetzt das Muster.
- Die **Kontrollliste der Lese-Bestätigungen** und ihr CSV-Auszug führten
  Personen als `PENDING`, denen die App den Eintrag vorenthält. Die Quote
  erreichte nie 100 %, und ein Nachweisdokument nannte jemanden säumig.

**Verwalter verloren, was sie anlegten.** Wer einen Lesson Plan, Info-Eintrag
oder Chat für ein fremdes Muster anlegte, bekam die Bestätigung — und der
Inhalt war weg, weil Bearbeiten und Löschen an derselben gefilterten Liste
hängen. Die Auswahlfelder bieten jetzt nur noch die eigenen Muster an
(`musterZurAuswahl`).

**Bedienung:**

- Die Feldbeschriftung lag in einem `<label>`. `<button>` ist ein labelable
  element — ein Tippen auf „Zugewiesene Muster" schaltete das alphabetisch
  erste Muster ein. Jetzt `role="group"`, wie an sieben anderen Stellen der
  Datei.
- Ausgewählt oder nicht war nur an der Farbe erkennbar; die Chips tragen jetzt
  `aria-pressed`.
- Die Beschriftung sagte „(Lesson Plans)", der Hinweis darunter „auch Info und
  Chats". Der Klammerzusatz ist raus.
- Das Anlegen quittiert; ein vom Store abgewiesener Vorgang sah vorher aus wie
  ein gelungener (`addUser` gibt jetzt zurück, ob es geklappt hat).
- Die Rückfrage vor dem Verwerfen kannte das neue Feld nicht.
- Die Musterauswahl in der Nutzerzeile war handgebaut und wich in Abstand,
  Rahmen und Schriftschnitt ab — jetzt dieselbe `ChipMultiSelect`.

Die Begründung im Seed für die Muster des Training Admins war falsch („sähe
sonst nichts") und ist ersetzt. `@types/node` ist dazugekommen, weil der Test
der Excel-Vorlage die Datei liest.

## 1.5.3 — 2026-08-13

Lese-Bestätigungen: die Regel steht jetzt dort, wo sie geprüft wird.

Auf Nachfrage kontrolliert, ob bei einem Instructor-Info-Eintrag mit Muster
wirklich nur die bestätigen müssen, die für dieses Muster freigeschaltet
sind. **Sie stimmt** — im Browser gemessen: Ein Eintrag mit „C560 XLS+"
führt 0/2 (Michael Holy, Patrick Thorn); der CL30-Admin steht weder in der
Quote noch in der Kontrollliste, noch sieht er den Bestätigen-Knopf. Ein
Eintrag ohne Muster führt 1/3, also alle.

Es gab dafür aber **keinen Test**: Die Funktion lag als Hilfsfunktion in
`InstructorInfo.tsx`, und beide Wachen des Projekts globen auf `src/*.ts`.
Genau das Loch, das der Testwächter unter `LOGIK_IN_TSX` beschreibt.

- `src/infoAcks.ts` (neu) trägt die Regel: aktives Konto, Modulzugang,
  Musterbereich, Zielgruppe — alle vier notwendig. Dazu `ackStand`, damit die
  Quote nur Bestätigungen von Zielpersonen zählt; eine Bestätigung von
  jemandem, der inzwischen kein Ziel mehr ist, ergäbe sonst „4 von 3".
- `infoEntryAppliesTo` ist mitgezogen; der Store reicht sie durch, damit es
  nicht zwei Fassungen gibt.
- 14 Testfälle, unter anderem: Muster UND Zielgruppe müssen passen, nicht
  eines von beiden; Superadmin und Training Admin fallen nie wegen des
  Musters heraus; ein stillgelegtes Konto steht nicht für immer als offen.

Warum das zählt: Diese Liste ist ein Nachweisdokument. Ein Fehler darin nennt
jemanden vor der Behörde als säumig, während die App ihm den Eintrag gar
nicht zeigt.

## 1.6.0 — 2026-08-14

Verwaltung: ein Bereich mehr für den Training Admin, alle Rechte an einer
Stelle.

**Der Training Admin bekommt den Grading-Bereich im Panel.** Den Verlauf je
Pilot hatte er bereits — im Grading Tool, und dort schon über alle Muster und
alle Personen. Gefehlt hat das Panel: Die Kachel erschien nicht,
`#/admin/grading` warf ihn zurück. Grund war eine doppelt geführte Freigabe —
einmal in der Reiterleiste, einmal, anders formuliert, im Zugangsriegel
derselben Datei; beide kannten ihn nicht und waren sich untereinander nicht
einig. `src/adminAccess.ts` trägt sie jetzt allein.

- Er sieht Übersicht, Formulare, Verlauf je Pilot, Monatsbericht, Auswertung
  und Standardisierung — **nicht** die Grading-Konfiguration: Dort werden
  Kompetenzkataloge geändert, und das wirkt auf jedes künftige Blatt der
  ganzen ATO.
- Die Statuszeile bot ihm „Rückmeldungen offen" an und warf ihn beim Antippen
  zurück. Ein Punkt führt namentlich irgendwohin; steht das der Rolle nicht
  offen, erscheint er nicht mehr.

**Rechte werden nur noch an einer Stelle vergeben.** Vorher waren es drei: die
Rollen-Matrix, vier Kästchen in der aufgeklappten Nutzerzeile und dieselben
vier als Schalter der Sammelbearbeitung.

- `#/admin/permissions` hat jetzt **Rollen** und **Personen** untereinander —
  dieselben vier Rechte für alle Nutzer nebeneinander, mit Suche. So lassen
  sie sich vergleichen, was in der aufgeklappten Zeile nie ging.
- Die Kästchen sind aus der Nutzerzeile verschwunden; dort steht der Weg
  dorthin. Was bleibt, gehört zur Identität: Rolle, Muster, Gruppen, aktiv.
- Ein eigener Abschnitt nennt, was bewusst **nicht** hierher geholt wurde:
  Rolle und Musterzuordnung (Identität des Nutzers) und die
  Chat-Administration (gehört an den Chat). Beides hierher zu holen hieße, es
  zweimal zu führen.
- Die Chat-Sperre trägt die Warnfarbe statt der Akzentfarbe — sie ist das
  einzige umgekehrt gemeinte Recht: Ein Haken nimmt etwas weg.

22 neue Testfälle in `src/adminAccess.test.ts` und `src/adminStatus.test.ts`.
Im Browser nachgemessen: Panel und sechs Kacheln für den Training Admin, ein
Haken auf der Rechte-Seite landet im Bestand, die Nutzerzeile führt nur noch
hin.

## 1.6.1 — 2026-08-14

Zwei offene Fachentscheidungen aus der Musterregel getroffen.

**Feedback folgt jetzt dem Muster.** Es trug seit jeher einen Aircraft Type,
stand aber ausserhalb der Regel: Ein CL30-Admin sah Rückmeldungen zu
C560-Themen, weil der Verfasser zufällig in seiner Gruppe war. Kein Leck —
die Autoren sind seine Leute —, aber inkonsequent.

- Jetzt gelten **zwei Schranken, beide notwendig**: die Gruppe und das Muster.
  „General" (kein Muster) bleibt für alle sichtbar, wie überall sonst.
- Die Kehrseite ist bewusst in Kauf genommen: Eine Meldung zu einem fremden
  Muster erreicht den Gruppenadmin nicht mehr — sie liegt dann beim
  Superadmin, der alle Muster sieht.
- Die Sicht steht als `visibleFeedback` im Store, nicht in der Ansicht: Die
  Statuszeile braucht dieselbe Zahl. Rechnete sie mit dem ganzen Bestand,
  versprach sie einem Gruppenadmin mehr, als hinter ihrem Sprung steht —
  derselbe Fehler, den sie beim Training Admin schon einmal hatte.
- Eine Seed-Rückmeldung bekommt das Muster, das ihr Text ohnehin nennt
  (Citation XLS+). Vorher trugen beide keines, und die Regel war in der
  Sandbox gar nicht zu sehen.

**Info-Eintrag und Chat-Gruppe behalten ihr optionales Musterfeld.** Die
Vorgabe bleibt „Ohne Muster = für alle" — anders als beim Lesson Plan, wo das
Muster Pflicht ist. Bewusst so entschieden: für den schnellen allgemeinen
Aushang. Die Asymmetrie steht jetzt in README und CLAUDE.md, damit sie nicht
beim nächsten Durchsehen als Lücke gilt.

Nachgemessen: Superadmin sieht beide Rückmeldungen und meldet „2 offen"; der
CL30-Admin sieht nur die allgemeine und meldet „1 offen".

## 1.7.0 — 2026-08-14

**my AAA Logbook** — neue Kachel für jeden Nutzer: der persönliche
Tätigkeitsnachweis als Instruktor, getrackt über die Grading-Formulare.

- Gezählt wird nur, was **fertig** ist (`status === 'signed'`, alle
  Unterschriften geleistet). 306 und 310 zählen nie.
- **308** → Kategorie „Simulator Training": Session = Flight Time PF +
  Flight Time PM aus dem Formularkopf, dazu als änderbare Standardwerte
  1:00 Briefing und 0:30 Debriefing — je Eintrag einzeln ausgewiesen.
- **307** → Kategorie „Ground Training": exakt der Wert des
  Duration-Feldes, nichts hinzugerechnet.
- **Manuelle Einträge** mit Datum, Muster, Kategorie (feste Liste:
  Ground/Simulator/Other Training, dazu Freitext), Dauer und Notiz.
- **Abgeleitete Einträge werden nicht gespeichert** — sie werden bei jedem
  Öffnen aus `gradingRecords` gerechnet. Korrekturen (Teilzeiten, Notiz)
  und Löschungen liegen als Overrides daneben, mit einem Weg zurück
  („Auf Formularwerte zurücksetzen"). Zwei Wahrheiten für dieselbe Stunde
  gibt es damit nicht, und das Formular selbst bleibt unberührt.
- **Filter**: Zeitraum, Muster, Kategorie, Formulartyp, Pilot — kombinierbar.
  Summenkarte mit Gesamtzeit, Aufschlüsselung je Kategorie und CSV-Export.
- **Sichtbarkeit** folgt der Musterregel: Superadmin und Training Admin
  sehen jedes Logbuch vollständig, ein Gruppenadmin fremde nur gefiltert
  auf seine zugewiesenen Muster, ein Member nur sein eigenes. **Schreiben**
  (Korrektur, manueller Eintrag, Löschung) kann jeder ausschließlich im
  eigenen — ein Tätigkeitsnachweis, den ein anderer nachbessern kann, ist
  keiner.

Dazu im **Superadmin-Panel ein neuer Bereich „Logbuch"**: alle Zeiten aller
Instruktoren in einer Tabelle, aufgeschlüsselt über fünf Zeitfilter — mit
Briefing, ohne Briefing (nur die Session), Ground Training only, Simulator
Training only, Other Training only. „Other" fängt dabei auch frei benannte
Kategorien, damit die drei Kategoriesummen zusammen die Gesamtsumme ergeben.
Gerechnet wird mit denselben Funktionen wie im einzelnen Logbuch —
Korrekturen, Löschungen und manuelle Einträge der Instruktoren eingerechnet.
Der Bereich bleibt dem Superadmin vorbehalten; der Training Admin öffnet
einzelne Logbücher über die Kachel.

Neu: `src/logbook.ts` (Regeln) mit 27 Testfällen in `src/logbook.test.ts`,
Seite `src/pages/Logbook.tsx`, Bereich `src/pages/admin/LogbookAdmin.tsx`,
Store-Aktionen für Overrides und manuelle Einträge, Kachel auf der
Startseite (als letzte, nach Notes).

Im Browser nachgemessen: Michael sieht im eigenen Logbuch 3 Einträge /
16:30 (je 308: 4:00 Session + 1:00 + 0:30); Christian im eigenen 3 / 14:30;
Christian (CL30-Admin) sieht in Michaels C560-Logbuch 0 Einträge; Steven
(Training Admin) sieht Michaels 3 Einträge, ohne Bearbeiten-Knöpfe.

## 1.7.1 — 2026-08-14

Logbuch-Seite an den Hausstil angepasst — gemeldet vom iPad:

- **Datumsfelder (From/To) haben jetzt eine feste Breite.** WebKit gibt
  einem leeren `<input type="date">` fast keine Eigenbreite — am iPad
  standen zwei winzige Pillen, die erst beim Antippen aufgingen.
- **Filterleiste wie in der Formularablage:** eine Zeile kompakter Felder,
  die sich am Handy umbricht — statt seitenbreiter Auswahlfelder
  untereinander. Der Pilot-Filter ist ein Suchfeld mit Platzhalter.
- **Summenkarte strukturiert:** links die Gesamtzeit groß mit
  Eintragszahl, rechts je Kategorie eine eigene Zeile (absteigend nach
  Zeit), oben Kartenüberschrift und CSV-Export. Vorher standen alle
  Zahlen gleichrangig nebeneinander — ab der zweiten Kategorie war nicht
  zu sehen, was wozu gehört.
- **Einträge am Desktop zweispaltig** (CardGrid, wie die anderen Listen);
  der Kopfzeilen-Knopf „Add entry" trägt dieselbe Pille wie „New contact"
  im Verzeichnis.

Auf fünf Formaten nachgemessen (iPhone hoch/quer, iPad hoch/quer,
Desktop): Datumsfelder 144 px, kein seitliches Scrollen, Einträge am
Desktop zweispaltig, sonst einspaltig.

## 1.8.0 — 2026-08-14

**Logbuch-Bereich im Superadmin-Panel ausgebaut** und **einheitliches
Datumsformat DD.MM.YYYY** in der ganzen App.

Logbuch-Auswertung:

- **Detail-Tabelle statt Einzelwert:** je Instruktor die Spalten Muster
  (als Marken), Einträge, Ground, Simulator, Other und Gesamt — die drei
  Kategoriespalten ergeben zusammen stets die Gesamtspalte, weil „Other"
  auch frei benannte Kategorien fängt. Summenzeile darunter.
- **Filter:** Zeitraum (From/To), Aircraft Type und die Zählweise
  Mit/Ohne Briefing als Pillen. Wer nur unter dem aktiven Filter leer
  ist, bleibt als Nullzeile stehen — das ist eine Aussage; wer gar kein
  Logbuch führt, erscheint nicht.
- **Export als CSV und Excel**, beide mit denselben Zeilen: aktive Filter
  im Dateikopf, dann exakt die Tabelle. Das Excel ist ein echtes .xlsx —
  von Hand geschrieben (`src/xlsxExport.ts`, ZIP + XML ohne
  Fremdbibliothek, mit eigenem Leser in den Tests und gegen openpyxl
  verifiziert), Zahlen kommen als Zahlen an.

Datumsformat:

- Überall DD.MM.YYYY (31.08.2026): Logbuch-Einträge und -Exporte, Chat-
  Nachrichten (vorher 14/08 ohne Jahr auf Englisch), Chatliste bei älteren
  Nachrichten, Notes, Lesson Plans. Grading und Instructor Info hatten das
  Format bereits (`formatDate`). Die Datums-EINGABEFELDER zeigen weiter
  die Schreibweise des Geräts — das bestimmt der Browser, nicht die App.

9 neue Testfälle (adminZeile, XLSX-Schreiber samt ZIP-Leser, kurzeZeit).
Im Browser nachgemessen: Muster-Filter C560 XLS+ → Christian 1 Eintrag /
05:30; ab 01.08. → 3 Einträge / 15:30; ohne Briefing → 22:00 statt 31:00;
beide Downloads geprüft (CSV-Kopf mit Filtern, .xlsx öffnet als echte
Arbeitsmappe).
