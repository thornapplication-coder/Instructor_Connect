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
  aufgeklappten Zeile, und
  wer das vergaß, sah keinen einzigen Lesson Plan. Die Regel steht auch im
  Store, nicht nur im Dialog.
- **Bestehende Konten ohne Zuordnung bekommen alle Muster.** Der Umstieg
  nimmt niemandem etwas weg; einschränken ist danach eine bewusste
  Entscheidung.
- Der Musterbereich gilt auch beim direkten Aufruf einer Chat-Adresse — sonst
  wäre die Filterung Kosmetik.

Nicht betroffen: Formularablage, Statistik und Behördenexport bleiben
rollenbasiert (ORA.GEN.220).
