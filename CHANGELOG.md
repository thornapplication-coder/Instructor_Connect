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

## 1.3.0 — 2026-08-09

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
