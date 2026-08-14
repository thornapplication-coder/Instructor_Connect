# Instructor Connect — Arbeitsregeln für dieses Repo

Mobile Begleit-App für Fluglehrer der Aviation Academy Austria (ATO AT.ATO.106 /
GBR.ATO.0541). React 18 + TypeScript + Vite + Tailwind, Zustand im Browser
(IndexedDB). Derzeit **Sandbox-Betrieb**: kein Backend, kein echter Mailversand,
keine serverseitige Anmeldung.

## Neue Logik kommt mit Tests — ausnahmslos

Das ist die wichtigste Regel hier. Wer eine Funktion in `src/*.ts` anlegt oder
eine bestehende Regel ändert, schreibt die Tests **im selben Zuge** dazu.

Abgesichert wird das nicht nur durch Absprache, sondern mechanisch — durch
**zwei** Wachen, die zusammengehören:

1. `src/testGuard.test.ts` verlangt zu jedem Logik-Modul in `src/*.ts` eine
   Testdatei (`X.test.ts` für reine Logik, `X.dom.test.ts` für alles, was eine
   Browser-Umgebung braucht). Ausnahmen stehen dort namentlich mit Grund.
2. Die Abdeckungsschwelle in `vitest.config.ts` prüft, dass diese Tests auch
   etwas abdecken (`perFile`, 90 % Zeilen / 85 % Zweige).

Der Unterschied ist wichtig, weil hier lange etwas Falsches stand: Die
Schwelle allein fängt eine ungetestete neue Datei **nicht** ab. Der
v8-Provider misst, was ausgeführt wurde — eine Datei, die kein Test
importiert, erscheint gar nicht erst in der Auswertung. Nachgemessen: neue
Datei mit ungetesteter Logik angelegt, `npm test` blieb grün. Erst die erste
Wache schließt die Lücke.

Beide dürfen nicht durch eine Erweiterung der Ausnahmelisten umgangen werden.
Wer dort etwas einträgt, schreibt den Grund daneben, und der Grund lautet
„braucht Browser-Umgebung (Ebene 2)", nicht „hat gerade keine Zeit".

`npm test` läuft in der CI bei jedem Pull Request **und** vor jeder
Veröffentlichung. Eine gebrochene Regel geht damit nicht live.

## Was die Tests bewachen

Die Testfälle sind an Befunde geknüpft, die in den Audits schon einmal falsch
waren; die Kommentare nennen die jeweilige Nummer. Wer eine Erwartung ändert,
sieht damit sofort, welche Zusage er gerade aufgibt — etwa: ein 306 je nicht
bestandenem Piloten, die parentId-Lücke, die Ampel prüft Unterschrift *und*
Beleg, der Fingerabdruck bricht bei nachträglicher Änderung.

Testet ein Lauf etwas anderes als erwartet, ist **zuerst die Erwartung zu
prüfen, nicht der Code anzupassen**, bis er zum Test passt.

## Ebenen

- **Ebene 1 (vorhanden):** reine Logik ohne React/DOM — Dateiendung
  `*.test.ts`, Umgebung `node`.
- **Ebene 2 (vorhanden):** was eine Browser-Umgebung braucht — Dateiendung
  `*.dom.test.ts` (Speicher, Hooks) bzw. `*.test.tsx` (Komponenten), Umgebung
  `jsdom` mit `fake-indexeddb` und React Testing Library. Abgedeckt sind
  `persist`, `editGuard`, `useIsDesktop`; `net` steht noch aus (braucht eine
  Service-Worker-Registrierung, nicht nur `fetch`).
- **Ebene 3 (offen):** wenige E2E-Wege mit Playwright (Anmelden → Formular →
  Unterschrift → Versand, Offline).

Die Trennung der Ebenen ist Absicht: Liefe Ebene 1 ebenfalls unter `jsdom`,
könnte ein Logik-Modul unbemerkt vom DOM abhängig werden und der Lauf bliebe
grün.

## Sonstiges

- **Sprache:** Oberfläche DE/EN über i18next. Grading-Formulare und der
  Behördenexport sind **immer englisch** — unabhängig von der Oberfläche.
  Das hängt nicht mehr an Disziplin: Diese Texte liegen im Namensraum
  `forms` (`src/i18n/forms.json`), den es **nur auf Englisch gibt**. Wer
  Formular- oder Berichtstext ergänzt, legt ihn dort ab und ruft ihn als
  `t('forms:…')` — eine deutsche Fassung kann gar nicht erst gezogen werden,
  egal welche Ansicht die Komponente einbindet. `src/i18n.test.ts` bewacht
  das: kein `grading`-Zweig in den Oberflächen-Bundles, jeder benutzte
  `forms:`-Schlüssel existiert, und de/en führen dieselben Schlüssel.
  Folge, bewusst in Kauf genommen: Auch die Bedienleisten des Grading-
  Bereichs im Admin-Panel (Filter, Reiter, Export-Knöpfe) sind englisch.
- **Überschriften** kommen aus `SectionHeading` (gliedert die Seite,
  Akzentmarke + Linie) und `CardHeading` (beschriftet den Inhalt einer
  Karte). Beide in `text-ink`, nicht `text-dim`: Eine Überschrift ist die
  Struktur des Textes, nicht sein Kleingedrucktes. Wer eine neue
  Zwischenüberschrift braucht, nimmt eine der beiden — das Muster war
  vorher an vierzig Stellen von Hand geschrieben und wich überall leicht ab.
- **Musterbezogene Sichtbarkeit** läuft über `src/aircraftScope.ts` — eine
  Regel für Lesson Plans, Instructor Info und Chats. Zwei Festlegungen hängen
  daran: **ohne Muster heißt „für alle"** (ein allgemeiner Eintrag ist eine
  Aussage, kein fehlender Wert), und **die Rolle entscheidet, wer die
  Schranke trägt** — Mitglied und Admin sind ans Muster gebunden, Superadmin
  und Training Admin sehen alles. Wer die Ausnahme in einer Ansicht selbst
  auslegt statt `sichtbarFuer` zu rufen, baut die vierte Stelle, an der sie
  auseinanderlaufen kann. Genauso auf der **Schreibseite**: Jeder Weg, der
  einen Nutzer anlegt oder ändert, fragt `musterFehlt` — die Bedingung stand
  einmal in `addUser` von Hand ausgeschrieben, und Import,
  Sammelbearbeitung, Rollenwechsel und die Chip-Reihe in der Nutzerzeile
  kannten sie nicht. Vier Wege in einen Zustand, den der fünfte verbietet.
  Was jemand einem Inhalt an Muster **geben** darf, sagt `musterZurAuswahl`:
  nur, was er auch sieht — sonst legt ein Admin einen Lesson Plan an und
  verliert ihn im selben Moment. Und ein Nachtrag in `migrateState` braucht
  eine **Marke**: Ohne sie lief er bei jedem Start und machte jede bewusste
  Entziehung wieder rückgängig, und zwar nach oben. Die **Nachweise**
  (Ablage, Statistik, Behördenexport) bleiben bewusst rollenbasiert: Die
  Aufbewahrungspflicht gilt für den ganzen Bestand, nicht für den eigenen
  Teil davon. Wer eine neue Ansicht baut, entscheidet zuerst, in welche der
  beiden Gruppen sie gehört.
- **Rechte werden an EINER Stelle vergeben** — `#/admin/permissions`. Dort
  stehen die Rollen-Matrix und, darunter, dieselben vier personenbezogenen
  Rechte (bewerten, Pilot, Verzeichnis, Chat-Sperre) für alle Nutzer
  nebeneinander. Vorher waren es drei Stellen: die Matrix, vier Kästchen in
  der aufgeklappten Nutzerzeile und dieselben vier als Schalter der
  Sammelbearbeitung. Wer wissen wollte, was jemand darf, sah an drei Stellen
  nach. Die Liste steht in `src/adminAccess.ts` (`PERSON_PERMS`), damit
  Matrix und Sammelbearbeitung dieselben Rechte in derselben Reihenfolge
  zeigen. Bewusst NICHT dorthin geholt: Rolle und Muster (gehören zur
  Identität des Nutzers) und die Chat-Administration (gehört an den Chat) —
  ein Verweis nennt beides.
- **Wer welchen Verwaltungsbereich öffnet**, sagt `adminTabsFor`
  (`src/adminAccess.ts`) — Kachel auf der Startseite, Reiterleiste und
  Zugangsriegel fragen dieselbe Stelle. Sie stand zweimal in derselben
  Datei, verschieden formuliert, und die beiden waren sich nicht einig: Der
  Training Admin bekam eine Kachel, hinter der „kein Zugriff" stand. Auch
  die Statuszeile fragt sie — ein Punkt, der in einen gesperrten Bereich
  führt, ist schlimmer als kein Punkt.
- **Statusmarken** kommen aus `Badge` (`src/components/ui.tsx`) — fünf Töne
  mit je *einer* Bedeutung: `ok` erledigt, `wait` wartet oder mahnt, `bad`
  durchgefallen oder kaputt, `accent` neutrale Einordnung, `dim` ruhiger
  Nebenzustand; `strong` schaltet auf die volle Fläche. Keine handgebaute
  Pille mehr: „Not Competent" stand vorher in drei Farben nebeneinander.
- **Die Ampel** hat EINE Gestalt: `TrafficIcon` (`src/pages/Grading.tsx`) —
  Haken, Fragezeichen, Kreuz in `text-ok`/`text-wait`/`text-bad`. Vorher gab
  es zwei Formensysteme nebeneinander (Kreis/Dreieck/Quadrat als Marke,
  Haken/Fragezeichen/Kreuz im Icon-Feld), und die Legende über der Liste
  zeigte die eine, während die Zeilen darunter die andere trugen. Wer eine
  Ampel anzeigt, nimmt diese Komponente; `stumm` schaltet die Ansage ab, wo
  daneben schon Text steht.
- **Schrift- und Abstandsskala** stehen in `tailwind.config.js` und sind
  abgeschlossen: elf Schriftstufen (`text-micro` … `text-giant`, dazu
  `text-fine` für den Druck) und vier Abstandsstufen (`tight`, `stack`,
  `section`, `major`). Die Schriftskala **ersetzt** den Tailwind-Standard,
  steht also nicht unter `extend` — `text-sm` gibt es nicht mehr, damit eine
  vergessene Stelle auffällt. Einzelwerte wie `text-[13px]` sind verboten;
  `src/designScale.test.ts` prüft das mechanisch, ebenso die senkrechten
  Stapel. Wer eine Stufe braucht, die es nicht gibt, ändert die Skala und
  schreibt den Grund daneben — er lautet nicht „passt hier besser".
- **Am Desktop** begrenzt `Page` die Breite (1152 px, `wide` 1280 px). Wo die
  Breite etwas zu tragen hat, füllt sie `CardGrid` mit zwei Spalten; bei einer
  einzelnen Karte bleibt es einspaltig, sonst stünde daneben eine leere Hälfte.
- **Alles am unteren Bildschirmrand** (Bestätigung, Offline-Streifen,
  Speicherwarnung, Update-Hinweis) liegt in EINEM Stapel in `App.tsx`, nicht
  je einzeln auf `fixed above-sandbox`. Zweimal ist derselbe Fehler passiert:
  erst verdeckte der Offline-Streifen die Formularleiste, dann die
  Bestätigung den Offline-Streifen. Was gleichzeitig sichtbar sein kann,
  gehört untereinander.
- **Zwei Prüfungen für dieselbe Sache laufen auseinander.** Die
  Fortschrittsleiste des Formulars und die Absendeprüfung waren getrennt —
  die Leiste meldete „Alles erledigt", das Absenden verweigerte. Jetzt leitet
  sich `validate()` aus `openItems` ab. Wer eine neue Bedingung einbaut, baut
  sie in die Liste, nicht daneben.
- **Bestätigungen** kommen aus `toast(text, tone)` (`src/components/Toast.tsx`),
  nicht aus einem Dialog: Eine Rückmeldung darf den nächsten Handgriff nicht
  aufhalten. Der Streifen trägt `role="status"`, damit Sprachausgaben ihn
  vorlesen, ohne den Fokus zu nehmen. Wer eine Aktion baut, die etwas
  Endgültiges tut (speichern, löschen, absenden, herunterladen), quittiert
  sie — vorher sprang das Grading-Formular wortlos zurück, und drei
  verschiedene Ausgänge sahen gleich aus.
- **Sammelaktionen** planen in `src/bulkUsers.ts`, bevor sie schreiben. Zwei
  Zusagen hängen daran und sind dort getestet: Der gemeldete Zähler nennt,
  was sich *wirklich* ändert (nicht die Größe der Auswahl), und niemand kann
  sich selbst oder den letzten aktiven Superadmin aussperren. Die **Rolle**
  bleibt bewusst Einzelentscheidung.
- **Kommentare** erklären das *Warum* (gern mit dem Befund, der dahintersteht),
  nicht das *Was*. Deutsch, wie der Bestand.
- **Auslieferung:** Entwicklung im Feature-Branch, Merge per PR nach `main`;
  `deploy.yml` veröffentlicht ausschließlich aus `main`.
- Der Changelog steht bewusst auf einem einzigen `1.0.0`-Eintrag (Erststand);
  `migrateState` setzt ihn bei Bedarf darauf zurück.
