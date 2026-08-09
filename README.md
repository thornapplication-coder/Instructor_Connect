# Instructor Connect

Interne App für Instruktoren einer ATO (PWA), zweisprachig Deutsch/Englisch.
Aktueller Stand: **Sandbox-Version** — komplett durchklickbar ohne Supabase,
Twilio oder Kosten. Der Anwendungszustand wird im Browser gespeichert und
übersteht ein Neuladen; die gelbe Leiste unten setzt ihn zurück.

## Module

- **Grading Tool** — Ausbildungsformulare nach OM Appendix 5: 306, 307A/B,
  308A–H und 310. Kompetenzbewertung 1–5 plus NO, Unterschriften auf dem
  Gerät, Pflicht-Folgeformulare, Ampelstatus und Druck-/PDF-Ausgabe.
  Auswertung mit Trendflags, Instruktoren-Kalibrierung, Flottenmatrix und
  CSV-Export.
- **Lesson Plan** — Unterlagen je Muster; sichtbar sind die Muster, die dem
  Nutzer zugewiesen sind.
- **Chat** — Gruppenchats mit Umfragen (Ja/Nein und Mehrfachauswahl), fetten
  Admin-Nachrichten, Anhängen (Sandbox-Attrappe) und Chat-Info-Ansicht inkl.
  Aufbewahrungsdauer.
- **Instructor Info** — Bibliothek aus PDF- und Texteinträgen mit Gültigkeit,
  Zielgruppen, Lese-Bestätigung samt Kontrollliste und Suche.
- **Who to call** — Kontaktverzeichnis mit Suche sowie `tel:`- und
  `mailto:`-Links, gruppiert nach Abteilung.
- **Feedback** — Formular mit Kategorien und wählbarem Empfänger; nicht anonym.
- **Admin Panel** — Benutzer, Rechte-Matrix, Grading-Konfiguration, Gruppen,
  Feedback, Einstellungen, Impressum und Changelog. Der Superadmin sieht alles,
  ein Gruppenadmin nur seine eigenen Gruppen und deren Rückmeldungen.

## Rollen

| Rolle | Umfang |
|---|---|
| **Superadmin** | alles, inklusive Rollenvergabe und endgültigem Löschen von Formularen |
| **Group Admin** | Gruppen, in denen er als Admin eingetragen ist, samt deren Rückmeldungen |
| **Training Admin** | nur-lesende Formularablage; weitere Module nur, wenn die Rechte-Matrix sie freischaltet |
| **Member** | Instruktor: eigene Formulare, Chat, Info, Lesson Plans, Feedback, Verzeichnis |

Konten werden **deaktiviert statt gelöscht**, damit unterschriebene Formulare,
Nachrichten und Unterschriften zuordenbar bleiben.

## Anmeldung

Ausschließlich per E-Mail-Adresse, die der Admin im Panel anlegt — sie ist die
einzige Anmeldekennung und muss eindeutig sein. Wahlweise direkt oder über
einen sechsstelligen Code, der bis Mitternacht gilt und nach fünf
Fehlversuchen verbraucht ist. Erlaubte Domains sind in den Einstellungen
hinterlegt.

## Druck und PDF

Formulare drucken auf A4 mit 6 mm Rand; der Maßstab ist so gewählt, dass auch
ein Blatt mit neun kommentierten Kompetenzen auf eine Seite passt. Kopf- und
Fußzeile tragen Organisation, Genehmigungsnummer, Formularstand und
Dokumentkennung — pflegbar im Admin Panel unter Einstellungen. Breite
Auswertungen drucken im Querformat, Tabellenköpfe wiederholen sich auf
Folgeseiten.

Die Seitenzahl setzt der Druckstandard über die Rand-Boxen. Firefox, Safari
und der PDF-Export von Chromium setzen sie; der interaktive Druckdialog von
Chrome und Edge ignoriert diese Boxen — dort liefert die Seitenzahl die
Kopf-/Fußzeile des Dialogs.

## Verwaltung

Das Admin Panel liegt unter `#/admin`; jeder Bereich hat eine eigene Adresse
(`#/admin/users`, `#/admin/grading/stats`). Ein Bereich lässt sich damit
verlinken, die Zurück-Taste geht eine Ebene hoch statt aus dem Panel heraus.
Eine Adresse, die der Rolle nicht offensteht, führt in die Übersicht zurück
und wird auch in der Adresszeile zurückgesetzt.

Wer welche Bereiche sieht: Superadmin alle acht; Admin die Bereiche Gruppen
und Feedback; der Training Admin arbeitet nicht im Panel, sondern in der
Formularablage des Grading Tools. Ab 1024 px Breite ist das Panel bedienbar,
darunter erscheint ein Hinweis — dieselbe Grenze gilt für den Einstieg auf der
Startseite.

Gruppen löschen geht an zwei Stellen: im Panel unter Gruppen und direkt im
Chat unter Gruppen-Info. Beide fragen vorher nach und nennen, wie viele
Nachrichten mitgelöscht werden. Bliebe ein Mitglied dadurch ohne jede Gruppe
zurück — es verlöre den Chat-Zugang und die Sichtbarkeit der Instructor Info —,
wird das Löschen mit Namensnennung gesperrt, statt wirkungslos zu bleiben.

## Offline-Betrieb

Im Simulator und in Hangars gibt es regelmäßig kein Netz. Ein Service Worker
liefert die App aus dem Cache aus, die Daten liegen ohnehin lokal — Formulare
lassen sich vollständig ausfüllen und unterschreiben.

Was ohne Netz nicht geht, ist der Versand. Ein ohne Empfang unterschriebenes
Formular bekommt deshalb den Stand „Im Ausgangskorb“ statt „versendet“: die
Ampel bleibt gelb (offen), wird aber nicht rot — rot heißt „Handeln
erforderlich“, und hier ist nichts zu tun. Ein Streifen am unteren Rand zeigt
den Offline-Zustand und die Zahl der wartenden Formulare.

Sobald wieder Empfang da ist, geht der Ausgangskorb selbsttätig raus. Geprüft
wird dafür nicht nur das `online`-Ereignis, sondern auch das Sichtbarwerden
der App: wer das Gerät im Flugmodus einsteckt und später aufweckt, bekommt
sonst kein `online`-Ereignis zu sehen.

## Standardisierungsbericht

Grading Tool → Ablage → Standardisierung. Der Bericht stellt je Kompetenzsatz
das Bewertungsverhalten jedes Instruktors dem Flottenmittel gegenüber und ist
die Grundlage für Standardisierungsbesprechungen nach ORA.ATO.110.

Drei Festlegungen machen ihn belastbar: Piloten- und Instruktorenkompetenzen
werden nie gegeneinander gerechnet; gekennzeichnet wird erst ab zehn Noten aus
mindestens drei Durchgängen; die Schwellen sind feste, erklärbare Werte (0,40
besprechen, 0,80 prüfen) statt einer Standardabweichung, die bei drei bis fünf
Instruktoren selbst zu unsicher wäre. „NO“ senkt keinen Schnitt — nicht
beobachtet ist keine schlechte Note.

Wie die Formulare ist der Bericht durchgehend englisch, mit ATO-Kopf und
Export-Stempel; Zeitraum und Flotte sind wählbar, der CSV-Export trägt
dieselben Zahlen.

## Datensicherung

Noch nicht aktiv — die Sandbox hält ihren Zustand im Browser. Sobald die
Datenbank steht, gilt die Vorgabe aus [`docs/backup.md`](docs/backup.md):
täglich um 03:00 Wiener Zeit, 30 Tagessicherungen, dazu die Sicherung vom
1. jedes Monats dauerhaft. Die Vorlagen dafür liegen in `docs/backup/`.

## Sandbox-Modus

- Rollenwechsler (Superadmin / Group Admin / Training Admin / Member) in der
  gelben Leiste unten; ein Wechsel baut die Seite neu auf
- iPhone/iPad-Gerätevorschau
- Zeitraffer (+1/+8/+31 Tage), um Aufbewahrung und Gültigkeiten zu beobachten
- Daten-Reset stellt die Seed-Daten wieder her
- Der Mailversand ist simuliert und gelingt; ein Seed-Formular zeigt bewusst
  den Fehlerfall. Ohne Netz wandert er in den Ausgangskorb — das Verhalten
  lässt sich mit dem Offline-Schalter der Entwicklerwerkzeuge vorführen

## Barrierefreiheit

Alle antippbaren Flächen messen mindestens 44 × 44 px. Texte erreichen in
beiden Themes mindestens WCAG AA; Ampel- und Statusfarben kommen aus der
Theme-Datei und wechseln samt Schriftfarbe mit dem Modus. Dialoge schließen
mit Escape, halten den Tastaturfokus und geben ihn beim Schließen zurück.

## Entwicklung

```bash
npm install
npm run dev     # Entwicklungsserver
npm run build   # Produktions-Build (relativer Basispfad, AC_BASE optional)
npm run preview # Produktions-Build lokal ausliefern
```

Sprache über den DE/EN-Schalter (react-i18next); das Grading-Modul bleibt
bewusst durchgehend englisch. Theme-Farben zentral in `src/index.css`,
Hell-/Dunkelmodus umschaltbar. Die fachlichen Regeln des Grading-Moduls
liegen in `src/gradingRules.ts`, damit Store und Ansichten dieselbe Logik
nutzen.
