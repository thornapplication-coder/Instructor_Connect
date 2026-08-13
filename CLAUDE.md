# Instructor Connect — Arbeitsregeln für dieses Repo

Mobile Begleit-App für Fluglehrer der Aviation Academy Austria (ATO AT.ATO.106 /
GBR.ATO.0541). React 18 + TypeScript + Vite + Tailwind, Zustand im Browser
(IndexedDB). Derzeit **Sandbox-Betrieb**: kein Backend, kein echter Mailversand,
keine serverseitige Anmeldung.

## Neue Logik kommt mit Tests — ausnahmslos

Das ist die wichtigste Regel hier. Wer eine Funktion in `src/*.ts` anlegt oder
eine bestehende Regel ändert, schreibt die Tests **im selben Zuge** dazu.

Abgesichert wird das nicht nur durch Absprache, sondern mechanisch: Die
Abdeckungsschwelle in `vitest.config.ts` erfasst über `include: ['src/*.ts']`
**alle** Logik-Module. Eine neue, ungetestete Datei fällt damit von selbst unter
die Schwelle und lässt `npm test` scheitern — sie kann nicht still an der
Prüfung vorbeiwachsen. Das ist beabsichtigt und darf nicht durch eine
Erweiterung der `exclude`-Liste umgangen werden. Wer dort etwas einträgt,
schreibt den Grund daneben, und der Grund lautet „braucht Browser-Umgebung
(Ebene 2)", nicht „hat gerade keine Zeit".

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

- **Ebene 1 (vorhanden):** reine Logik ohne React/DOM — `gradingRules`,
  `gradingStats`, `csv`, `docHash`.
- **Ebene 2 (offen):** Komponenten- und Speichertests (React Testing Library,
  `fake-indexeddb`) für `persist`, `net`, `editGuard`, `useIsDesktop`.
- **Ebene 3 (offen):** wenige E2E-Wege mit Playwright (Anmelden → Formular →
  Unterschrift → Versand, Offline).

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
- **Statusmarken** kommen aus `Badge` (`src/components/ui.tsx`) — fünf Töne
  mit je *einer* Bedeutung: `ok` erledigt, `wait` wartet oder mahnt, `bad`
  durchgefallen oder kaputt, `accent` neutrale Einordnung, `dim` ruhiger
  Nebenzustand; `strong` schaltet auf die volle Fläche. Keine handgebaute
  Pille mehr: „Not Competent" stand vorher in drei Farben nebeneinander.
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
- **Kommentare** erklären das *Warum* (gern mit dem Befund, der dahintersteht),
  nicht das *Was*. Deutsch, wie der Bestand.
- **Auslieferung:** Entwicklung im Feature-Branch, Merge per PR nach `main`;
  `deploy.yml` veröffentlicht ausschließlich aus `main`.
- Der Changelog steht bewusst auf einem einzigen `1.0.0`-Eintrag (Erststand);
  `migrateState` setzt ihn bei Bedarf darauf zurück.
