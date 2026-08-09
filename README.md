# Instructor Connect

Interne App für Instruktoren einer ATO (PWA), zweisprachig Deutsch/Englisch.
Aktueller Stand: **Sandbox-Version** — komplett durchklickbar ohne Supabase,
Twilio oder Kosten. Der Anwendungszustand wird im Browser gespeichert und
übersteht ein Neuladen; die gelbe Leiste unten setzt ihn zurück.

## Module

- **Grading Tool** — Ausbildungsformulare nach OM Appendix 5: 306, 307A/B,
  308A–H, 310 und 311. Kompetenzbewertung 1–5 plus NO, Unterschriften auf dem
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

## Sandbox-Modus

- Rollenwechsler (Superadmin / Group Admin / Training Admin / Member) in der
  gelben Leiste unten; ein Wechsel baut die Seite neu auf
- iPhone/iPad-Gerätevorschau
- Zeitraffer (+1/+8/+31 Tage), um Aufbewahrung und Gültigkeiten zu beobachten
- Daten-Reset stellt die Seed-Daten wieder her
- Der Mailversand ist simuliert und gelingt; ein Seed-Formular zeigt bewusst
  den Fehlerfall

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
