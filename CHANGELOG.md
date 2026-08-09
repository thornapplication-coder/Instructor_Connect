# Changelog — Instructor Connect

Semantische Versionierung (MAJOR.MINOR.PATCH).

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
