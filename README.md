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
  Wird die Kategorie „Safety" gewählt, erscheint sofort der rote Hinweis, dass
  ein Safety Report zu schreiben ist — das Feedback-Modul ist kein Meldeweg.
- **Notes** — persönliche Merkliste. Jede Notiz gehört ausschließlich ihrem
  Verfasser; kein Admin und kein Superadmin sieht sie, und sie geht in keinen
  Export. Der Training Admin hat das Modul nicht. Bewusst ohne Musterbezug: Man
  tippt drei Wörter und legt sie ab, statt sie einzuordnen.
- **Admin Panel** — Benutzer, Rechte-Matrix, Grading-Konfiguration, Gruppen,
  Feedback, Einstellungen, Impressum und Changelog. Der Superadmin sieht alles,
  ein Gruppenadmin nur seine eigenen Gruppen und deren Rückmeldungen.

Der Monatsbericht ist ein Reiter im Grading Tool, keine eigene Kachel — zwei
Wege zur selben Auswertung hießen, sie an zwei Stellen zu pflegen. Alte
Lesezeichen auf `#/report` landen dort.

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
einzige Anmeldekennung und muss eindeutig sein. Der Weg im Betrieb ist der
sechsstellige Code: Er gilt bis Mitternacht und ist nach fünf Fehlversuchen
verbraucht. Erlaubte Domains sind in den Einstellungen hinterlegt.

Die Anmeldung ohne Code — die Namensliste auf dem Anmeldebildschirm — gibt es
**nur in der Sandbox**. Sie hängt am Flag `VITE_SANDBOX`, ebenso wie die
Store-Aktion dahinter; in einem Produktivbuild führt beides ins Leere.

Sitzung und Aktiv-Status werden im laufenden Betrieb geprüft, nicht nur beim
Start: Eine offene App bleibt nicht über Mitternacht hinaus angemeldet, und
wer im Admin-Panel deaktiviert wird, ist beim nächsten Takt abgemeldet.

**Benutzer aus einer Tabelle:** Für den Erstaufbau lädt der Superadmin unter
Benutzer eine Vorlage herunter (`.xlsx` mit Auswahllisten oder CSV), füllt sie
aus und lädt sie wieder hoch. Vor dem Anlegen zeigt die App jede Zeile mit
Status; angelegt werden nur die fehlerfreien. Geprüft wird gegen Domainliste,
Bestand, Musterliste und Rollen-Schreibweisen — eine Zeile, die hier grün ist,
kann sich anschließend auch wirklich anmelden.

## Druck und PDF

Formulare drucken auf A4 mit 6 mm Rand; der Maßstab ist so gewählt, dass auch
ein Blatt mit neun kommentierten Kompetenzen auf eine Seite passt. Breite
Auswertungen drucken im Querformat, Tabellenköpfe wiederholen sich auf
Folgeseiten.

**Der Dokumentkopf wiederholt sich auf jedem Blatt.** Er trägt ATO-Name,
Zulassungsnummer, Formularnummer samt Titel, den Namen der geschulten Person
und den Formularstand. Vorher standen Kopf und Fuß je einmal — der Kopf auf
Blatt 1, der Fuß auf dem letzten; ein 307A mit zwanzig Teilnehmern ergab
Folgeblätter ohne jede Zuordnung. Umgesetzt über die Tabellenrollen des
Druckstandards (`display: table-header-group`), weil das als einziger Weg in
Chrome **und** Safari/iPad zuverlässig wiederholt.

Der Fuß mit Datensatz-ID, Stand und Status schließt das Dokument auf dem
letzten Blatt ab — Fußgruppen wiederholt Chrome nicht verlässlich, deshalb
trägt der Kopf die blattweise Zuordnung.

Seitenzahlen liefert der Druckdialog des Browsers, wenn dort „Kopf- und
Fußzeilen" eingeschaltet sind; die App steuert das nicht und kann es ohne
zusätzliche PDF-Bibliothek auch nicht.

Was auf dem Dokument steht, ist beim Unterschreiben **eingefroren**:
ATO-Name, Zulassungsnummer, Formularstand und Formulartitel wandern in den
Datensatz und sind ab Abdruck-Fassung 3 Teil des Fingerabdrucks. Vorher las
der Ausdruck sie zur Druckzeit aus den Einstellungen — ein altes Formular
druckte nach einer Änderung im Panel eine andere Zulassungsnummer, und der
Fingerabdruck meldete trotzdem „unverändert".

Der Dateiname des PDF folgt dem Schema
`Form_Titel_Person_Instruktor_Datum_Event`. Unter dem Notenraster steht der
Notenmaßstab: Gedruckt sind es nackte Ziffern plus Farbe, und die fällt in
Schwarzweiß weg.

## Verwaltung

Das Admin Panel liegt unter `#/admin`; jeder Bereich hat eine eigene Adresse
(`#/admin/users`, `#/admin/grading/stats`). Ein Bereich lässt sich damit
verlinken, die Zurück-Taste geht eine Ebene hoch statt aus dem Panel heraus.
Eine Adresse, die der Rolle nicht offensteht, führt in die Übersicht zurück
und wird auch in der Adresszeile zurückgesetzt.

Wer welche Bereiche sieht: Superadmin alle acht (Benutzer, Rechte, Grading,
Gruppen, Feedback, Einstellungen, Impressum, Changelog); Admin die Bereiche
Gruppen und Feedback; der Training Admin arbeitet nicht im Panel, sondern in
der Formularablage des Grading Tools. Ab 1024 px Breite ist das Panel
bedienbar, darunter erscheint ein Hinweis — dieselbe Grenze gilt für den
Einstieg auf der Startseite.

Die **Ablage des Training Admins** hat vier Reiter (abgeschlossen, zu
bearbeiten, Verlauf je Pilot, Monatsbericht) und vier Filter (Zeitraum,
Pilot, Muster, Instruktor). Was die Filter übrig lassen, steht nach
Schulungstag gebündelt — jüngster Tag zuerst, das Datum einmal über der
Gruppe statt in jeder Zeile. Gelöscht wird dort nichts: Ausbuchen bleibt dem
Superadmin vorbehalten (ORA.GEN.220).

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
sonst kein `online`-Ereignis zu sehen. Maßgeblich ist eine echte
Erreichbarkeitsprobe gegen den eigenen Origin, nicht `navigator.onLine` — das
meldet auch im WLAN ohne Internet „online".

Zwei Vorkehrungen halten den Start im Funkloch kurz und den Cache sauber: Ein
Seitenaufruf wartet höchstens 2,5 Sekunden auf das Netz und nimmt dann den
Cache; und eine Anmeldeseite eines Gäste-WLANs (200 mit HTML statt der
angeforderten Datei) landet nicht im Cache — sonst bliebe sie dort bis zum
nächsten Deployment stehen.

Nachgemessen wird das nicht nur im Code: Kaltstart ohne Netz, Notiz schreiben,
neu laden, Formular offline unterschreiben (`queued`), Netz zurück (`sent`).

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

## Kennzahlen: eine Grundlage

Kalibrierungs-Kachel und Standardisierungsbericht rechnen über dasselbe
Modul (`src/gradingStats.ts`) und teilen sich Flotte und Zeitraum. Vorher
rechneten sie getrennt und mit verschiedenen Regeln: Für denselben
Instruktor und denselben Bestand standen +0,19 und +0,59 in zwei
Dokumenten, ohne dass der Unterschied irgendwo genannt war.

Die vier Regeln der gemeinsamen Datenbasis, jede mit Grund:

- **Nur unterschriebene Formulare.** Ein Blatt, das noch auf eine
  Unterschrift wartet, ist kein Nachweis und darf keine Kennzahl bewegen.
- **Keine Folgeformulare.** 306 und 310 tragen keine Noten; sie zählen beim
  Ausgangsformular mit, nicht ein zweites Mal für sich.
- **Nur Blätter mit Piloten.** Anwesenheitslisten haben keine Bewertung.
- **Zeitraum über den Schulungstag**, nicht über die Erfassungszeit. Ein
  zwei Wochen später nachgetragenes Formular gehört in die Periode, in der
  geschult wurde.

Beide Ansichten nennen diesen Ausschnitt sichtbar über der Tabelle.

## Daten und Datenschutz

Der gesamte Anwendungszustand liegt im Browser des Geräts (IndexedDB,
Datenbank `instructor-connect`) — es gibt in dieser Fassung keinen Server, der
Inhalte speichert, und keine Analyse-, Tracking- oder Werbedienste. Ausgehende
Verbindungen gehen ausschließlich an den eigenen Origin.

Was gespeichert wird: Benutzerstammdaten (Name, dienstliche E-Mail, Telefon,
Rolle, zugewiesene Muster), Grading-Formulare samt Noten, Kommentaren und
Unterschriftsbildern, Chat-Nachrichten, Instructor-Info-Einträge samt
Lese-Bestätigungen, Rückmeldungen, Kontakte und persönliche Notizen.

Drei Festlegungen sind für den Datenschutz wesentlich:

- **Notizen sind privat.** Sie gehören ausschließlich ihrem Verfasser; die
  Store-Ansicht reicht fremde Notizen gar nicht erst heraus, und kein Export
  enthält sie.
- **Unterschriften werden nie gespeichert oder wiederverwendet.** Sie werden
  jedes Mal live auf dem Gerät geleistet und gehören zu genau einem Dokument;
  ein Fingerabdruck bindet sie an dessen Inhalt.
- **Konten werden deaktiviert statt gelöscht**, damit unterschriebene
  Formulare zuordenbar bleiben. Ein Löschwunsch nach Art. 17 DSGVO betrifft
  deshalb Chat, Notizen und Stammdaten; die Ausbildungsnachweise selbst
  unterliegen der aufsichtsrechtlichen Aufbewahrung (ORA.GEN.220).

Auf dem Gerät zwischengespeicherte Inhalte sind unverschlüsselt — ein
verlorenes, ungesperrtes Gerät gibt sie preis. Gerätesperre und Abmelden auf
fremden Geräten sind Teil des Schutzkonzepts, nicht Kür. Der vollständige
Text steht im Impressum der App (Abschnitt „Datenschutz"), zweisprachig und
im Admin Panel pflegbar.

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
- Die Schnellanmeldung über die Namensliste gibt es ausschließlich hier

Der Versand gilt als gelungen, sobald der eigene Origin erreichbar ist — eine
echte Zustellbestätigung kann es ohne Backend nicht geben. Das ist die
bewusste Grenze der Sandbox und mit der Datenbank aufzulösen.

## Barrierefreiheit

Alle antippbaren Flächen messen mindestens 44 × 44 px, die Schrift am
Bildschirm mindestens 12 px (im Druck bleibt sie kleiner, dort ist der Satz
auf eine Seite kalibriert). Texte erreichen in beiden Themes mindestens
WCAG AA; der aktive Zustand eines Umschalters ist Text auf der Akzentfläche
statt Akzentschrift auf Akzentfläche — letzteres lag bei 3,86:1.

Zustände werden angesagt, nicht nur gefärbt: `aria-pressed` an jedem
Umschalter, benannte Gruppen um die Notenknöpfe (sonst las eine Sprachausgabe
je Kompetenz neunmal „1, 2, 3, 4, 5, NO" ohne Bezug), Namen an allen Filtern
und Icon-Knöpfen. Nach jedem Seiten- und Schrittwechsel wandert der Fokus auf
die Überschrift der neuen Ansicht, statt auf `<body>` zu fallen. Dialoge
schließen mit Escape, halten den Tastaturfokus und geben ihn beim Schließen
zurück.

## Veröffentlichung

Auf die Live-Seite gelangt ausschließlich `main`. Bis August 2026 stand
zusätzlich ein Arbeitszweig im Auslöser — der lag zeitweise 22 Commits vor
`main`, sodass „live" und „freigegeben" nichts miteinander zu tun hatten.
Eine Vorschau aus einem Zweig läuft über `workflow_dispatch` von Hand.

Ein zweiter Workflow prüft jeden Pull Request: `npm ci`, Typprüfung und
Build (`tsc -b` ist Teil von `npm run build`, ein Typfehler bricht den Lauf
also ab). Er hat bewusst **keine** Pages-Rechte — ein Pull Request aus einem
fremden Fork darf nie veröffentlichen.

Der Auslieferungsstand ist reproduzierbar: Zwei Builds derselben Quellen
ergeben byte-gleiche Dateien, geprüft über alle 66. Das ist keine Kosmetik —
weicht auch nur `sw.js` ab, hält der Browser den Service Worker für neu und
lädt den Instruktoren die Seite grundlos neu, ohne dass sich etwas geändert
hat. Der Prüf-Workflow baut deshalb zweimal und vergleicht.

## Entwicklung

```bash
npm install
npm run dev     # Entwicklungsserver
npm run build   # Produktions-Build (relativer Basispfad, AC_BASE optional)
npm run preview # Produktions-Build lokal ausliefern
```

```bash
npm test        # Vitest mit Abdeckungsschwelle je Datei
```

Neue Logik in `src/*.ts` kommt mit Tests — die Schwelle in `vitest.config.ts`
erfasst alle Logik-Module, eine ungetestete neue Datei lässt `npm test`
scheitern. Die CI führt Tests, Typprüfung und Build bei jedem Pull Request aus.

Sprache über den DE/EN-Schalter (react-i18next); das Grading-Modul bleibt
bewusst durchgehend englisch — seine Texte liegen im Namensraum `forms`, den es
nur auf Englisch gibt. Theme-Farben zentral in `src/index.css`,
Hell-/Dunkelmodus umschaltbar. Die fachlichen Regeln des Grading-Moduls
liegen in `src/gradingRules.ts`, damit Store und Ansichten dieselbe Logik
nutzen.
