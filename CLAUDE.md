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
   Das gilt auch für `src/sandbox/*.ts` (Seed, Grading-Katalog, Impressum
   ab Werk — jeder neue Stand entsteht daraus). Und es gilt für Logik, die
   in einer `.tsx` steht: Jede exportierte Funktion mit kleinem
   Anfangsbuchstaben außer Hooks (`use…`) wird gefunden und muss nach
   `src/*.ts` — oder steht in `FREIGEGEBEN` mit Grund. Vorher war dort eine
   Liste, deren Test nur prüfte, dass sie leer ist; `gradeColor` und
   `parseImprint` lagen derweil ungetestet in Seiten (Audit 11/2026,
   TEC-18).
2. Die Abdeckungsschwelle in `vitest.config.ts` prüft, dass diese Tests auch
   etwas abdecken (`perFile`, 90 % Zeilen / 85 % Zweige).

Der Unterschied ist wichtig, weil hier lange etwas Falsches stand: Die
Schwelle allein fängt eine ungetestete neue Datei **nicht** ab. Der
v8-Provider misst, was ausgeführt wurde — eine Datei, die kein Test
importiert, erscheint gar nicht erst in der Auswertung. Nachgemessen: neue
Datei mit ungetesteter Logik angelegt, `npm test` blieb grün. Erst die erste
Wache schließt die Lücke.

Beide sehen nur `src/`. Was der Build entscheidet — was vorab auf jedes
Gerät kommt, wie der Cache heißt, der Text des Service Workers, CSP und
Schlüsselprüfung —, steht deshalb ebenfalls in `src/*.ts` (`swQuelle`,
`csp`, `backend/konfig`); `vite.config.ts` liest nur Dateien ein und ruft
diese Funktionen. Typgeprüft werden Konfiguration und `e2e/` über
`tsconfig.node.json` im selben `npm run build` — `tsconfig.json` umfasst
nur `src/` (Gegenprüfung L-CI, Audit 11/2026).

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
  `persist`, `editGuard`, `useIsDesktop` und `net` — dessen Ausnahme in
  beiden Wachen trug den Grund „braucht eine Service-Worker-Registrierung",
  dabei liest die Probe nur `navigator.onLine` und ein `fetch`, beides
  ersetzbar (Audit 11/2026, TEC-18).
  Kein Schreibvorgang überlebt seine Testdatei: `src/test/setup.ts`
  wartet vor dem Abbau der Umgebung auf `schreibvorgaengeAbwarten`
  (`persist.ts`). Synchrone Tests lassen fake-indexeddb keinen Takt; ein
  Vorgang lief sonst nach dem Abbau zu Ende, fand kein `window`, und der
  Lauf war rot bei grünen Tests — nur auf dem langsameren Runner der
  Veröffentlichung (1.26.0).
- **Ebene 3 (vorhanden, `e2e/`, `npm run e2e`):** wenige Wege mit Playwright
  gegen den echten Build (`vite preview`, Port 4174), eigener CI-Job — und
  eigener Job vor jeder Veröffentlichung: `deploy` in `deploy.yml` wartet
  auf ihn, ein roter Browser-Test geht nicht live. Anmelden
  über den echten Sandbox-Weg (E-Mail → angezeigter Code), Testdateien aus
  `benchmark/sbx.ts` (`e2e/vorbereitung.ts`), keine Binärdateien im Repo.
  Abgedeckt: DocCheck einlesen → Befund per Tastatur → Viewer-Fokus; Export
  (CSV/Excel gleiche IDs, Prüfstand hin und zurück); Re-Check bis zur Datei
  mit „Neue Findings"; Wartung und Wiedereinschalten; Telefon-Ansicht;
  Offline-Start. Seit dem Audit 11/2026 außerdem: Grading-Formular
  (`formular.spec.ts`: Unterschrift im Vollbild, offene Punkte, Entwurf,
  Folgeformular nach Mitternacht, Fokus hinter Leisten, 308F/308G),
  Druck (`druck.spec.ts`: Kopf/Fuß je Blatt, PDF-Symbol der Ablage),
  Auswertungen (`auswertung.spec.ts`, auch der Monatsbericht eines
  anderen im Druck), Chat (`chat.spec.ts`, Löschen per
  Tastatur), Barrierefreiheit (`barrierefreiheit.spec.ts`: Fokusführung,
  Dialog-Portal, Sprachumschalter, Gliederung und Fenstertitel, axe-core
  über die Hauptbereiche, Bewegung reduzieren), Desktop-Raster
  (`desktop.spec.ts`) und am Telefon Chat, Feedback, Seitentitel,
  Sicherheitsbereiche und Ablehnungen im Bottom-Sheet (`mobil.spec.ts`,
  R3-DIALOGMELDUNG). Der Grading-Weg läuft als EIN Durchgang
  (`gradingweg.spec.ts`, R3-GRADINGWEG): 308A anlegen → Pflichtfelder →
  beide Unterschriften → Absenden → Quittung (danach steht das Blatt schon
  in IndexedDB) → grüne Ampel in der eigenen Liste (auch nach dem
  Neuladen) und in der Ablage → Eintrag mit Zeit im Logbuch des
  Instruktors → genau eine Zeile in der Forms-CSV des Behördenexports, mit
  Unterschriftszeit in Wiener Ortszeit und dem Fingerabdruck des
  gespeicherten Blatts.
  Die Content-Security-Policy steht nur im Build (`src/csp.ts`, Meta-Tag;
  `vite dev` braucht ein Inline-Skript) — deshalb prüft JEDER Weg hier, dass
  sie nichts abweist: `test` aus `e2e/hilfen.ts` scheitert an jedem
  `securitypolicyviolation` und an Chromes CSP-Konsolenzeile, eigene
  Kontexte melden sich mit `cspAbweisungen` an (Audit 11/2026, SEC-07).
  Nicht nach „Refused to" suchen: Chrome hat den Wortlaut geändert, eine
  Wache auf dieses Wort sah nachgemessen nichts; `e2e/csp.spec.ts` macht
  die Gegenprobe.
  Der Offline-Test fand einen echten Fehler: Mit „Vary: Origin" (vite
  preview, manches Hosting) startete die App ohne Netz weiß, weil Module
  MIT Origin-Kopf angefragt, aber OHNE vorgeladen wurden — der Service
  Worker schlägt deshalb mit `ignoreVary` nach (gefahrlos: Dateien sind
  inhaltsgehasht). Ein zweiter lag hinter `vite preview` verborgen, weil
  es „no-cache" sendet: Unter GitHub Pages („max-age=600") holte die
  Installation nach einem Update die ALTE index.html aus dem HTTP-Cache in
  den neuen Vorab-Cache, und der nächste Offline-Start blieb weiß. Der
  Worker lädt deshalb mit `cache: 'reload'` vor; seine Quelle steht in
  `src/swQuelle.ts` (Ebene 1), der Offline-Test spielt ein Update gegen
  einen eigenen Server mit Cache-Lebensdauer durch (Audit 11/2026,
  TEC-01). Wer einen Test ergänzt: Was als Logik prüfbar ist,
  gehört in Ebene 1 — jeder Browser-Test kostet Sekunden und bricht bei
  Textänderungen.

Die Trennung der Ebenen ist Absicht: Liefe Ebene 1 ebenfalls unter `jsdom`,
könnte ein Logik-Modul unbemerkt vom DOM abhängig werden und der Lauf bliebe
grün.

Alle drei Ebenen laufen in der Zeitzone **Europe/Vienna** — Ebene 1 und 2
über `vitest.config.ts`, Ebene 3 über `timezoneId` in `playwright.config.ts`
(für alle Projekte; die Geräteprofile setzen keine Zone) —, nicht in der der
Maschine: In der CI (UTC) ist der UTC-Tag der Ortstag, und ein Datum aus
`toISOString()` statt `lokalerTag` fiel keinem Test auf (EXM-01).
`src/test/zeitzone*.test.ts` prüft, dass die Zone in Ebene 1 und 2 ankommt,
`e2e/zeitzone.spec.ts` und `mobil.spec.ts` dasselbe im Browser; wer eine
andere braucht (westlich von Greenwich), setzt sie im Test selbst und stellt
sie danach zurück (Audit 11/2026, Nachtrag L-AUSGABE#2, R3-E2E-ZEITZONE).

## Selbsttests (1.28.0)

Zwei Seiten derselben Frage „funktioniert es?" — für den Code bei jedem
Push, für das Gerät im Betrieb.

**In der Pipeline** (zusätzlich zu Ebene 1–3):
- **Nachkontrolle nach jeder Veröffentlichung** (`deploy.yml`, Job
  `nachkontrolle`, `e2e/live.spec.ts`, `playwright.live.config.ts`,
  `npm run live` mit `LIVE_URL`): wartet, bis GitHub Pages genau DIESEN
  Build ausliefert (Cache-Name aus `dist/sw.js` eines Builds desselben
  Commits, `swAngaben` in `swQuelle.ts` — der Build ist reproduzierbar),
  meldet sich an, lässt den Selbsttest der App laufen und startet ohne Netz.
  Was vor dem Hochladen geprüft wird, sah den Pfad und die Cache-Lebensdauer
  des Hostings nie (TEC-01 entstand genau dort). `e2e/hilfen.ts` öffnet
  deshalb relativ (`./`), nicht `/`.
- **Nachtlauf** (`nachtlauf.yml`, täglich 02:23 UTC): `npm test`, volle
  Schwachstellenprüfung (Entwicklungswerkzeuge nur als Hinweis), Ebene 3,
  die veröffentlichte Seite — und der **Zeitsprung-Lauf**: die ganze Suite
  zu Silvester, an beiden Zeitumstellungen, am Monatsende und am Schalttag
  (`TEST_UHR`, `src/test/uhr.ts`, in beiden Vitest-Projekten als
  `setupFiles`). Er fand beim Einbau zwei Tests, die den Seed gegen ein
  festes Datum prüften und nur in ihrer Woche grün gewesen wären: **Wer
  `createSeedState()` prüft, rechnet mit `Date.now()`, nicht mit einem
  Datum** — der Seed entsteht relativ zur Uhr.
- **Größenbudget** (`src/groessenBudget.ts`, gemessen in
  `e2e/budget.spec.ts` am Build): Startdateien ≤ 280 kB gzip, Vorab-Cache
  ≤ 1,5 MB. Die Warnschwelle von Vite (800 kB je Chunk) meldet nur. Beim
  Einbau stand das Startbundle mit dem Selbsttest bei 807 kB — Seite und
  Prüflogik laden deshalb nach (`lazy` in `App.tsx`, `import()` im Wächter;
  außerhalb von `src/modules/`, also im Vorab-Cache).
- `npm run pruefen` = Tests, Build, Ebene 3 in einem Befehl — vor dem Push.

**In der App** (`#/selbsttest`, Link in der Fußzeile der Startseite):
- Regeln in `src/selbsttest.ts` (Ebene 1), Messungen in
  `src/selbsttestGeraet.ts` (Ebene 2), DocCheck-Probe in
  `modules/doccheck/selbsttest.ts`. Stufen: `ok`, `hinweis`, `fehler`,
  `offen` — **nicht Prüfbares ist `offen`, nie grün** (ohne Netz, API fehlt,
  Altbestand ohne Fingerabdruck), und es wird gezählt, nicht verschwiegen.
- **Gerät:** Ablage schreiben/lesen (`speicherProbe`, eigener Schlüssel,
  Zeitgrenze), dauerhafte Ablage, Füllstand (Schwellen wie der
  Speicherstreifen), Netz, **Uhr gegen den `Date`-Kopf des Servers**
  (`serverProbe` per HEAD, am Service Worker vorbei; die Unterschriftszeit
  kommt vom Gerät), **Offline-Start** (der Service Worker beantwortet
  `SELBSTTEST` mit Stand und Zahl fehlender Vorab-Dateien — von außen ließe
  sich das nur raten), Version (`reg.update()`), Browser-Funktionen.
- **Datenbestand** (nur Superadmin): dieselben Zusagen, die die Schreibwege
  einzeln durchsetzen (letzter Superadmin, eindeutige Adresse, Muster,
  Gruppen, DocCheck nur für Admin-Rollen, Pflichtlisten), Zeiten in der
  Zukunft (gegen die Zeit der APP — der Sandbox-Zeitraffer erzeugt keine
  „Zukunft") und **alle Fingerabdrücke**: `fingerabdruckPruefen` in
  `docHash.ts` ist dieselbe Regel wie in der Formularansicht.
- **DocCheck** (mit DocCheck-Rolle): ein künstliches PDF mit eingebautem
  „TBD" durch den echten Worker, mit eigener Verbindung (`eigeneVerbindung`,
  erscheint in keiner Sitzung). Kommt der Befund nicht, ist das ein Fehler —
  „keine Befunde" ist hier verdächtig.
- **Kurz-Check beim Start** (`SelbsttestWaechter`, im Stapel unten):
  einmal je Kalendertag und Gerät, 8 s nach dem Laden, ohne DocCheck;
  meldet nur Fehler, den Datenbestand nur dem Superadmin. In Ebene 1/2 aus
  (`aktiv`), in Ebene 3 trägt `anmelden` ihn als erledigt ein — ein Test mit
  festgehaltener Uhr sähe sonst zu Recht eine falsche Geräteuhr;
  `selbsttest.spec.ts` prüft ihn mit `startPruefung: true`.
- Der Bericht (kopieren/herunterladen) trägt Prüfpunkte, Stufen, Zahlen und
  Kennungen — keine Namen, keine Inhalte.
- Jeder Satz hat GENAU eine Zahl (`zahl` → `{{count}}`); Gründe derselben
  Stufe sind eigene Sätze (`variante`), auch die Einheit der Uhrabweichung
  (Minuten, ab 2 h Stunden, ab 2 Tagen Tage).

## DocCheck (`src/modules/doccheck/`)

Eigenes Modul nach der Spezifikation `DocCheck_Spezifikation_v1_1.md`,
ergänzt durch `docs/DocCheck_Spezifikation_v1_2_Nachtrag.md` (Re-Check
bestehender Findinglisten, Dokumentpakete, Word-Check). Der Nachtrag geht
für die dort geregelten Punkte vor; seine Phasenzuordnung steht in Kap. 19.
Stand: **Phase 2 + Word-Check (Sandbox)** — Dokumente einlesen und
durchsuchen, Word-Extrakt, Seitenangaben bei DOCX, Formalprüfung, Word-Check
(N4), Sprache/Platzhalter (N9), Referenzlisten als Soll, Re-Check fremder
Findinglisten (N3, regelbasiert), Dokumentpakete und Geschwister (N1, N2),
Rechen-/Plausibilitätsprüfung (N6), Verweise (N7), Regelwerksverweise (N8,
gegen geladene Regelwerke); kein Backend, KI simuliert. Festlegungen:

- **Die Testwachen gelten auch hier.** `testGuard` globt `src/modules/**`,
  die Abdeckungsschwelle ebenso. Ansichten (`*.tsx`) sind wie `src/pages`
  von der Schwelle ausgenommen; Logik gehört in `*.ts`.
- **Wer was darf, sagt `darf()` in `access.ts`** — Matrix Zeile für Zeile
  aus Spez. Kap. 5.1, im Test ausgeschrieben. Ohne Backend ist das
  Bedienkomfort; mit Phase 1b wird sie Vorlage für RLS und Rollentest.
- **Rechte nur über `setDocCheckRights`** (Superadmin, mit Audit-Zeile).
  `updateUser` lässt `docCheckAccess`/`docCheckAdmin` fallen.
- **DocCheck nur für Admin-Rollen** (Entscheidung vom 04.11.2026, weicht
  bewusst von Spez. 3.4 ab): Superadmin, Gruppenadmin und Training Admin
  können Zugang bekommen, ein Mitglied (Instruktor) nie. Die Regel steht
  in `docCheckMoeglich` (`access.ts`) und gilt an jeder Stelle:
  `docCheckRolle` (Mitglied = „keine“, auch mit gespeichertem Haken),
  `rechteErlaubt` in `setDocCheckRights` (Vergeben abgelehnt, Entfernen
  geht), `docCheckBereinigt` beim Herabstufen und in `migrateState` (die
  Schalter fallen mit, sonst gäbe die nächste Beförderung den Zugang still
  zurück). In der Datenbank dasselbe als Prüfregel
  `profiles_doccheck_nur_admins`, `set_rights` (`IC-DOCCHECK-ROLE`) und
  Trigger `profiles_guard_mitglied` — er heißt so, weil Postgres
  BEFORE-Trigger alphabetisch feuert und er NACH `profiles_guard` laufen
  muss. Die Berechtigungsseite zeigt beim Mitglied „nur für Admin-Rollen“
  statt Kästchen.
- **Statisch geladen wird nur der Einstieg `index.tsx`** und dazu wenige
  kleine Module ohne Bibliothek (`access`, `settings`, `library` für den
  Store, `ladefehler` für den Einstieg); alles andere per `lazy` hinter
  einer `ErrorBoundary`. Der Service Worker nimmt Dateien, die nur über das
  Modul erreichbar sind, aus dem Vorab-Cache (`nurNachgeladen` in
  `src/swQuelle.ts`). Wer DocCheck aus dem Startbundle importiert, holt
  Parser und Exportbibliotheken auf jedes Gerät — `src/startbundle.test.ts`
  bildet die statische Importhülle ab `main.tsx` und lässt nur diese Module
  zu, jedes mit Grund, und keine DocCheck-Bibliothek (jszip, pdf.js, docx,
  pptxgenjs, tesseract.js, minisearch).
- **Texte** im Namensraum `doccheck` (`i18n/de.json`, `i18n/en.json`),
  nachgereicht beim Laden des Moduls. Die Hülle (Wartung, Ladefehler) steht
  im App-Bundle unter `docCheck`, weil sie gerade dann gebraucht wird, wenn
  das Modul nicht geladen ist.
- **Ansichtsmodus** nach `pointer: coarse` (`viewMode.ts`), bewusst getrennt
  von `useIsDesktop` (Breite) — beide Regeln gelten je für ihren Bereich.
- **Prüf- und Sitzungsdokumente liegen NIE im Anwendungszustand.** Der wird
  in IndexedDB gespeichert; die Dokumente leben in `sitzung.ts` (Speicher
  des Tabs) und im Worker. JEDES Abmelden sendet `ic-abmelden` — Knopf,
  Sitzungsablauf, Deaktivierung, anderer Tab; der Store löst es am
  Übergang zu „abgemeldet" aus, nicht in `logout()`. Nutzerwechsel
  („Ansicht als") leert die Sitzung ebenfalls. Weil ein Neuladen alles
  verlöre, meldet `sitzung.ts` sich beim Laden des Moduls als offene
  Arbeit an (`registriereOffeneArbeit` in `editGuard.ts`): Das
  automatische Update wartet, solange Dokumente, Referenzlisten oder ein
  Re-Check im Speicher liegen (Audit 11/2026, TEC-02/TEC-14).
- **Lesen läuft im Worker** (`doccheck.worker.ts` übersetzt nur Nachrichten,
  die Arbeit macht `kern.ts`, in Node testbar). pdf.js wird in die Leser
  hineingereicht: im Browser die moderne Fassung, in Tests `legacy`.
- **Ein Weg für alle Formate:** PDF, DOCX und XLSX laufen durch
  `parse/aufbereiten.ts`. Bewusst ohne mammoth und ohne SheetJS (siehe
  Changelog 1.7.0) — Office-XML liest `parse/xml.ts`.
- **Laufzeitdateien** (OCR-Kern, Sprachdaten, pdf.js-Schriften,
  -Bilddecoder und -Farbprofil) liefert `docCheckDateien` in
  `vite.config.ts` unter festen Namen in `doccheck/` aus. Ohne ausdrückliche
  Pfade lädt tesseract.js alles von einem CDN — `ocr.test.ts` prüft das.
  Die pdf.js-Adressen kommen für Worker, Viewer und OCR aus `pdfAblage`
  (`pdfjsLaden.ts`). Im Worker gibt es kein `document`: pdf.js holt die
  Dateien dort selbst (`useWorkerFetch`, `parse/pdfAblage.ts`), und sein
  Worker-Teil hängt an einem eigenen MessageChannel (`kanalAnbinden`) statt
  am Fake-Worker — sonst blieb die Schriftablage ungenutzt und jedes PDF
  warnte (Audit 11/2026, DC-15/TEC-20).
- **Word-Eigenschaften werden WIRKSAM ermittelt, nicht direkt gelesen**
  (`parse/wordStile.ts`, `parse/wordTeil.ts`): Rangfolge wie Word —
  Dokumentvorgabe ← Tabellenvorlage (mit Bedingung) ← Absatzvorlage ←
  Zeichenvorlage ← direkt. Weißer Text auf einer per Vorlage dunkel
  schattierten Kopfzeile ist kein Befund; wer nur direkte Formatierung
  liest, meldet ihn trotzdem. Absätze und Läufe liegen auf einem Stapel,
  weil Textfelder IN Absätzen stecken.
- **Seitenangaben bei DOCX tragen ihre Herkunft** (`seitenQuelle`:
  `pdf_pair` · `toc_mapping` · `approx`) und die Bezeichnung zeigt sie
  („S. 12", „S. 12 (±1)", „ca. 12"). Eine Zahl ohne Herkunft würde für
  Words Seite gehalten. Im Export und im englischen Re-Check-Remark steht
  dieselbe Herkunft englisch („Page 12", „Page 12 (±1)", „approx. page 12",
  `seiteEnglisch`); was das Dokument selbst druckt, bleibt wörtlich — vorher
  stand „S. 2 (±1)" neben „Page 5" in derselben englischen Spalte (Audit
  11/2026, EXP-07/TXT-01). Fußnoten und Textfelder stehen als eigene Einheit
  direkt hinter ihrem Anker (in einer Tabelle: hinter der Tabelle) und sind
  `nachgereicht` markiert — die Word-PDF-Paarung sucht sie, schiebt aber
  den Lesezeiger nicht weiter: Im PDF steht die Fußnote am Seitenfuß, und
  die nächste Überschrift fand sich sonst nur noch im Inhaltsverzeichnis.
  Auf die Paarung wartet `pdfDazulegen` höchstens `paarZeitgrenze` (60 s
  plus 4 s je MB, höchstens 10 min) — vorher hing „Gleiche ab …" für immer,
  wenn der Worker nicht antwortete. Danach bleibt das DOCX mit geschätzten
  Seiten nutzbar, die Oberfläche sagt es, und eine späte Antwort übernimmt
  der dauerhafte `beiOcr`-Hörer wie jede andere (Audit 11/2026, Runde 3).
  Weil danach ein zweites PDF dazukommen kann, zählt im Kern nur die
  jüngste Paarung (`Kern.paaren`) — sonst gewann, wer zuletzt fertig
  wurde. Verlässt das Dokument die Sitzung, endet das Warten sofort ohne
  Meldung (`'entfernt'`).
- **Testdokumente sind synthetisch:** `benchmark/sbx.ts` erzeugt die
  Abnahmedateien des Nachtrags (`SBX-…`) aus Code; `parse/pdfBauen.ts` erzeugt PDFs aus
  Text, DOCX/XLSX entstehen in den Tests mit jszip.
- **Regelbasierte Prüfungen** stehen in `pruefung/` (`formal.ts`,
  `wordCheck.ts`, `sprachCheck.ts`, zusammengeführt in `pruefen.ts`) und
  laufen im Worker bei JEDER Zusammenfassung neu — nach OCR oder Word-PDF
  stimmen alte Fundstellen sonst nicht mehr. Befundtexte sind englisch
  (Export), Handlungsanweisungen in der Sprache der Oberfläche. Keine
  erfundenen Regelzitate. Ein Prüfpunkt, der für ein Format nicht passt
  oder für den das Dokument nichts Prüfbares enthält (kein Verzeichnis, keine
  Nummerierung, keine Summenzeile, keine Wettermeldung …), ist „nicht
  anwendbar", nicht grün.
- **Referenzlisten** (`referenz/`) werden an den Spaltenköpfen erkannt
  (`SPALTEN` in `referenz/liste.ts`); nicht erkannt heißt: der Nutzer
  wählt, es wird nicht geraten. Die Listen liegen wie Prüfdokumente nur im
  Speicher; jede Änderung prüft alle Prüfdokumente im Worker neu.
- **Re-Check fremder Findinglisten** (`recheck/`, N3): Die Liste behält
  ihr Layout; DocCheck schlägt die Spaltenzuordnung vor (Profil im Browser,
  nur Spaltennummern) und ordnet „Dokument/Bereich" nur ganzen Wörtern zu —
  „TM" steckt nicht in „ATM". Unbekannte Quelle heißt „Not verifiable",
  nicht raten. **Resolved nur, wenn der beanstandete Text im ganzen Paket
  fehlt** (N3.4); die Korrektur selbst ist kein Rest („ATO.106" in
  „AT.ATO.106"). Team-Kommentare sind Behauptungen, die geprüft werden.
  Keine Restfundstelle sind (N3.4): die Verbform eines Schreibweisen-Paars
  („to call out" bei „call out" → „callout"), ein erkennbares Zitat und ein
  Satz, der wörtlich in einem Master-Dokument steht. Sie werden gezeigt und
  im Remark gezählt, nicht verschwiegen. Die Zitat-Erkennung zählt
  Anführungszeichen nur innerhalb der Zeile bzw. des Absatzes — ein Fenster
  über Absatzgrenzen schnitte Paare an und erklärte echte Reste zu Zitaten;
  im Zweifel zählt der Treffer.
  Das Kapitel einer Fundstelle ist die letzte Überschrift VOR ihr, nicht
  das der Seite — ein DOCX ohne Umbrüche ist sonst eine Seite mit dem
  letzten Kapitel. Bestätigen schreibt eine Audit-Zeile ohne Befundtext.
  Status abweichend vom Vorschlag oder „Justify" nur mit Begründung
  (mind. 5 Zeichen); im Audit stehen nur Nummer und Status.
  **Neue Befunde** (N3.1 Schritt 6, `recheck/neueBefunde.ts`) kommen als
  eigenes Blatt „New findings"/„Neue Findings" dazu, nie als Zeilen der
  fremden Liste; Nummern im Anschluss an deren höchste („F-012" → „F-013").
  Eine Restfundstelle eines alten Befunds ist NIE zugleich neuer Befund
  (Dublettenregel N10.3) — verglichen wird je Dokument, der kürzere Auszug
  braucht mindestens 8 Zeichen, sonst verschluckte „PF" echte Befunde.
  Gezählt wird die Überlappung (20 Zeichen bzw. 80 % des kürzeren), nicht
  das Enthaltensein — Rest und Befund sind verschieden geschnitten; bei
  „Treffer — Kontext" muss der Treffer der beanstandete Text des alten
  Befunds sein und im Rest in derselben Umgebung stehen, sonst wäre jedes
  „TBD" eine Dublette und ein anderer Mangel im selben Satz ebenso (Audit
  11/2026, DC-04).
  Das Blatt kopiert Wurzel-Namensräume, Spaltenbreiten, Kopfzellen,
  Zellformate, bedingte Formatierungen und Dropdowns der Quelle (eigene
  Bezüge aufs Quellblatt festgelegt, `xr:uid` entfernt) und behält die
  Kopfzeile in DERSELBEN Zeile — relative Bezüge der Regeln hängen daran.
  Prioritätsfarben als angehängte `dxfs`; Prioritätswerte englisch
  (High/Medium/Low) wie der Export. Hat die Liste eine Prioritätsspalte
  (Rolle `prioritaet`), steht sie dort, sonst rechts als Zusatzspalte.
  Schalter `recheck` ab Werk **aus** (Nachtrag Kap. 17), bis die Abnahme
  inkl. Rückschreiben (N3.5) bestanden ist — offen ist allein die
  Öffnungsprobe in Microsoft Excel (hier nicht verfügbar).
- **Rückschreiben in Fremdlisten** (`recheck/rueckschreiben.ts`, N3.5)
  patcht Zeichenketten im XML, statt es neu zu serialisieren: Nur Blatt,
  `styles.xml` (neue `cellXfs` werden ANGEHÄNGT, alte Indizes bleiben),
  Arbeitsmappe, Beziehungen und Inhaltstypen ändern sich; `calcChain`
  fällt weg, `fullCalcOnLoad` wird gesetzt, gespeicherte COUNTIF-Ergebnisse
  werden nachgezogen. Der Round-Trip-Test vergleicht alle übrigen Teile
  byte-genau. Geschrieben werden nur **bestätigte** Vorschläge; der Status
  nur mit einem Wert aus der Werteliste der Liste (Dropdown). Der Leser
  liefert dafür Excel-Zeilennummern (`zeilenNr`), weil das Raster leere
  Zeilen überspringt. Das Original wird nie überschrieben.
- **Dokumentpakete** (`paket/`, N1/N2): Kürzel, Ebene, Gruppe und
  Variante werden aus Dateiname/Titel vorbelegt und als „erkannt" markiert;
  was der Nutzer setzt, überschreibt kein Vorschlag. Die Prüfung läuft im
  Worker und **automatisch** neu, sobald Struktur, Texte oder bestätigte
  Re-Check-Korrekturen sich ändern — kein Knopf, der ein veraltetes
  Ergebnis stehen lässt. Hierarchieregel: Befund beim TIEFEREN Dokument,
  das höhere unter „Other affected documents" (`Befund.weitere`).
  Dublettenregel: Eine Zeile ist nicht zugleich Hierarchie- und
  Geschwisterbefund. Propagation und Paketprüfung übernehmen nur
  **bestätigte** Re-Check-Korrekturen — ein bloßer Vorschlag ändert kein
  anderes Ergebnis. Hierarchiebefunde sind Medium (gleiche Bezeichnung heißt
  nicht sicher gleicher Umfang); Angaben je Einheit („per session") werden
  nicht mit Programmsummen verglichen. Feste Wendungen wie „cabin crew"
  stehen als `exceptPhrases` in `sibling-rules.json`. Erlaubte Geschwister-Unterschiede stehen in
  `config/sibling-rules.json` (Beispiel der Spezifikation, Erstbefüllung
  beim Superadmin); Variantenbezeichnungen und Kürzel sind immer erlaubt.
  Bei einem Tippfehler zwischen Geschwistern gilt das Wort als falsch, das
  sonst nirgends im Paket steht — lässt sich das nicht entscheiden, heißt
  der Befund „Inconsistency", nicht „Editorial".
- **Rechenprüfung** (`pruefung/rechnen.ts`, N6, Schalter `calcCheck`):
  Tabellen kommen aus dem Seitentext („Zelle | Zelle", DOCX und XLSX
  gleich); bei PDF sind die Tabellenpunkte „nicht anwendbar". Jeder Befund
  nennt die gerechneten Werte. Kumuliert-Spalten werden nicht summiert;
  eine Tabelle ohne Zahlen darf die Prüfung nicht abbrechen (war ein
  Absturz im Worker). DOCX-Seiten sind geschätzt oder gepaart: Eine
  Tabelle läuft über die Seitengrenze weiter, wenn die nächste Seite mit
  einer gleich breiten Zeile beginnt — je Seite gerechnet gab es falsche
  High-Summen (Audit 11/2026, FRD-02). Verbundene Word-Zellen füllen ihr
  Raster (`gridSpan`), der Kopf sind alle Zeilen vor dem ersten Wert.
- **Verweise** (N7) haben je Art GENAU eine Regel: interne Kapitelverweise
  prüft die Formalprüfung (`querverweise`, v1.1) — mit Schlüsselwort („see
  Section 9.4") UND in der Kurzform („see 9.4", `kurzverweise`; nicht bei
  Einheit, Datum oder Kapitel eines anderen Dokuments, Audit 11/2026,
  FRD-14); `pruefung/verweise.ts` prüft je Dokument nur Übungsnummern und
  Zirkel, die Paketprüfung alle Verweise auf ein anderes Dokument. Fehlt
  das Ziel, heißt der Befund „Not verifiable – source missing" und
  erscheint nie als verifiziert. Ein Ziel in einem fremden Regelwerk
  („Appendix 9 to Part-FCL", „Annex I (Part-FCL)") ist kein Verweis ins
  Dokument (`fremdesRegelwerk`). Kapitelnummern kommen aus der Gliederung
  UND aus nummerierten Absätzen — sonst wäre jeder Verweis auf „1.4.1.1
  The PIC …" kaputt; das gilt für beide Regeln.
- **Regelwerksverweise** (`pruefung/regelwerk.ts`, N8): Der Index enthält
  nur Regeln, die in einem Nicht-Prüfdokument als ÜBERSCHRIFT stehen —
  eine Erwähnung im Fließtext definiert nichts. Kein Schalter: läuft, sobald
  ein Regelwerk geladen ist; ohne Regelwerk „nicht anwendbar" statt
  hunderter „To verify". Eine Regel ohne erfasste Absätze lässt sich weder
  belegen noch widerlegen und heißt „nicht widerlegbar", nicht „verifiziert". Ändert sich das Regelwerk, prüft der
  Kern alle Prüfdokumente neu und schickt sie von sich aus — dafür hört
  `DocCheckApp` DAUERHAFT auf `beiOcr`; vorher gab es nur vorübergehende
  Hörer, und solche Aktualisierungen gingen verloren. CS-Kennungen erkennt
  die v1.1-Regex nur als ganzes Regelwerk („CS-FCD"), nicht je Artikel.
- **Bedienung (UX-/Barrierefreiheitsprüfung 01.11.2026):** Der
  Wartungshinweis bietet dem Superadmin „wieder einschalten" — der Schalter
  liegt IM Modul, ohne den Knopf sperrte er sich selbst aus. „Erneut
  prüfen" behält eine Bestätigung, solange der Vorschlag ihrer Zeile gleich
  bleibt (`nachLauf`, gemessen an `Bestaetigung.vorschlag`), und sagt, wie
  viele wegfielen. Ein weiteres Dokument, ein anderes Ziel oder eine andere
  Spalte verwirft sie ebenso wenig: Der Stand heißt „veraltet"
  (`istVeraltet`), zurückgeschrieben wird erst nach dem nächsten Lauf, und
  was ein Spalten-, Blatt- oder Listenwechsel kostet, wird vorher erfragt
  (Audit 11/2026, DC-02). Ab 1024 px zwei Spalten mit den Reitern oben,
  ab 1280 px drei. Das Gate zeigt je Dokument nur auffällige Prüfpunkte,
  der Rest auf Klick; Dokumentkarten klappen ihre Angaben ein, sobald
  nichts mehr offen ist; Revision notfalls aus dem Dateinamen
  (`revisionAusDateiname`).
  Befundzeilen klappen über einen echten Knopf auf (Tastatur), Reiter
  folgen dem ARIA-Muster (`reiter.ts`), Befundtext trägt `lang="en"`.
  „Nicht anwendbar" nie per Deckkraft dämpfen — das drückte den Kontrast
  unter 3:1.
- **Exporte** (`export/`, Spez. v1.1 Kap. 10, 12): EIN eingefrorener
  Datenstand (`datenstand.ts`), aus dem Excel, Word, CSV, PowerPoint und
  Prüfstand entstehen — wer einen Wert in einem Format selbst ausrechnet,
  baut die zweite Wahrheit. Befund-IDs sind über Dokumente eindeutig
  (`TM-001`, `TM2-001`, `PKG-001`), Sortierung Dokument → Seite → Priorität,
  und die Oberfläche zeigt dieselben IDs (Befundtabelle, Viewer):
  `befundIds`/`befundIdsAusSitzung` lesen dieselbe Rechnung wie
  `datenstand()`; die Tabelle ordnet wichtigste zuerst und sonst in
  Export-Reihenfolge wie „Top 5" (`befundTabelle`), damit „DOC4-002" nicht
  vor „DOC4-001" steht. Die Regel-ID der Prüfung („F-01" je Dokument) steht nicht
  mehr am Bildschirm — „TM-003" aus dem Bericht war dort nicht zu finden
  (Entscheidung vom 03.11.2026, Audit 11/2026, DC-10). Die „Neuen Findings"
  des Re-Checks behalten die Nummern der Fremdliste. Alles englisch aus
  `labels.en.json` bzw. dem englischen Sprachpaket, unabhängig von der
  Oberfläche. Excel von Hand wie das Rückschreiben
  (COUNTIFS mit mitgeliefertem Ergebnis, Dropdowns, Zeilenfarbe nach
  Priorität, Druck A4 quer mit Fußzeile); gleiche Eingabe → byte-gleiche
  Datei (JSZip `createFolders: false`, sonst Ordner mit Uhrzeit). Spez.
  10.4 (24 feste Spalten, „an Breite angepasst") ist so ausgelegt: Ohne
  KI-Prüfung (`modelle` leer) klappt „Findings" die KI-Spalten I–M und O
  zu, sofern sie in allen Zeilen leer sind — als Gliederung, die Datei
  behält alle 24, Excel druckt sie nicht (`ausgeblendeteSpalten`). Die
  sichtbaren Breiten sind für den Druck bemessen (höchstens 240 Zeichen,
  schmale Ränder); in LibreOffice nachgemessen druckt das Blatt mit 6,2 statt
  2,9 pt (Entscheidung vom 03.11.2026, EXP-12). Word mit
  `docx`, PowerPoint mit `pptxgenjs` — beide NUR per `import()` in
  `ausgabe.ts`, also nie im Startbundle. Word ohne Inhaltsverzeichnis-FELD
  (Aktualisierungsdialog); Links auf Textmarken. Gesamtbewertung ist ein
  VORSCHLAG aus den Regeln (High offen → nicht einreichungsfähig; Seiten
  ohne Textebene → nicht bewertbar, DC-03) und im Excel ein Dropdown.
  Die Compliance Matrix bleibt ehrlich leer, bis die
  KI-Prüfung sie füllt. Organisationsname aus `organisation` der
  Einstellungen, nie hart codiert. `pptxgenjs` zieht `image-size` mit einer
  bekannten Schwachstelle — `overrides` in package.json erzwingt die
  bereinigte Fassung. Prüfstand `.doccheck.json`: nur Metadaten, Hashes,
  Befunde, kurze Auszüge; beim Laden geprüft (Schema, Werte, Größe) und bei
  Abweichung abgewiesen; gleiche Befund-IDs nach dem Laden. Der mobile
  Bereich „Befunde" öffnet Prüfstände und exportiert daraus.
- **Qualitäts-Regressionstest** (`benchmark/qualitaet.ts`, `npm run
  benchmark`, läuft in `npm test` mit): alle Abnahmedateien durch den echten
  Kern, gemessen gegen ihre Lösungsschlüssel — Trefferquote, Fehlalarmquote,
  Re-Check-Statusvorschläge, Restfundstellen — und verglichen mit
  `benchmark/baseline.json`. Weil die Prüfung regelbasiert und
  deterministisch ist, zählt schon JEDE Verschlechterung (ab 10 Punkten
  heißt sie „gesunken", Kap. 19.1). Wird eine Kennzahl besser, die Baseline
  nachziehen — sonst schützt sie den neuen Stand nicht. Ein neuer
  eingebauter Fehler in `sbx.ts` braucht seinen Eintrag im Lösungsschlüssel,
  ein neuer Fehlalarmfall seinen Eintrag in der Fehlalarmliste seiner
  Abnahmedatei (`SBX_WORD_01_FEHLALARME`, `SBX_WORD_02_FEHLALARME`,
  `SBX_PDF_02_FEHLALARME`, `SBX_FORMAL_01_FEHLALARME`); eine neue
  Abnahmedatei ihren Satz in `baseline.json`.
  Die 100 % gelten für die synthetischen Fälle, an denen die Regeln gebaut
  wurden; über echte Dokumente sagen sie nichts — dafür ist der private
  Benchmark (Nachtrag Kap. 20) vorgesehen.
- **Submission gate** warnt ab Werk (`gateSperrt: false`, Entscheidung
  vom 01.11.2026); Sperre ist Einstellung des Superadmins. Ein Scan, der
  auf die Texterkennung wartet, ist „nicht bewertbar", nie
  „einreichungsfähig" — ohne Text sind die Textprüfpunkte „nicht
  anwendbar" (`textAuswertbar`, Audit 11/2026, DC-03).
- **Keine erfundenen Preise.** Modellpreise sind ab Werk leer; ohne Preise
  keine Kostenschätzung und kein Start.
- **Keine echten OEM-Dokumente im Repo** — der Sandbox-Bestand ist
  synthetisch (`SBX-…`). Zwei Tests prüfen das: `library.test.ts` den
  Bestand (Titel, Nummern), `src/repoDateien.test.ts` die DATEIEN im Repo —
  PDF und Office nur mit `SBX-`-Präfix oder namentlich mit Grund, nie mit
  Herstellernamen. Was in `public/` liegt, geht ungefiltert auf jedes Gerät
  und auf die öffentliche Seite.

## Backend (Phase 1b, `supabase/`, `src/backend/`)

Stand: **Etappe 1 lokal** — Anmeldung und Rechte als Migration, geprüft
gegen echtes Postgres; noch kein Projekt angelegt, die App läuft weiter als
Sandbox, solange `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` fehlen.

- **Rechte setzt die Datenbank durch** (Row Level Security), nicht die
  Oberfläche. Die DocCheck-Matrix steht als Tabelle `doccheck.permissions`;
  `src/backend/rls.test.ts` prüft jede Aktion mit jeder Rolle gegen `darf()`
  aus `access.ts` (über `AKTIONEN`). Wer eine Zeile der Matrix ändert, ändert
  beide — sonst wird der Test rot.
- **Supabase-Standardrechte zuerst entziehen.** Supabase gibt neuen
  Objekten in `public` ALLE Rechte für `anon`/`authenticated`; jede Migration
  beginnt je Tabelle/View/Funktion mit `revoke all … from anon,
  authenticated` und gibt dann gezielt. `auth_stub.sql` bildet diese
  Standardrechte nach — ohne das prüfte der Rollentest gegen eine strengere
  Datenbank als die echte (Sicherheitsprüfung 01.11.2026).
- **Schutzregeln als Trigger** (`profiles_guard`, bei UPDATE UND DELETE),
  damit sie für JEDEN Weg gelten: Rolle, Status und Rechte nur vom
  Superadmin; niemand ändert die eigene Rolle oder deaktiviert sich; der
  letzte aktive Superadmin bleibt — auch beim Löschen über `auth.users`,
  und mit Transaktionssperre gegen gleichzeitiges Herabstufen.
  DocCheck-Rechte und E-Mail nur über Funktionen: erkannt am ausführenden
  Datenbanknutzer (`authenticated` = App, Eigentümer = `set_rights` bzw.
  Anmeldung), NIE an einer Sitzungseinstellung — die kann jeder setzen.
- **Volle Profile sieht nur der Nutzer selbst und der Superadmin**; alle
  anderen lesen `public.directory` (Name, Kontakt, Rolle, Muster,
  bewerten/Trainee) — Datenminimierung.
- **Audit-Zeilen schreibt nur die Datenbank** (Funktionen mit dem Aufrufer
  als Akteur); niemand hat INSERT auf `doccheck.audit`. Einträge sind
  strukturiert (Re-Check: Nummer + Status aus fester Liste, max. 500 je
  Aufruf, 60 Aufrufe/Minute) — kein freier Text, also kein Befundinhalt.
  Einstellungen nur über `doccheck.update_settings`, nie per UPDATE.
  Wird ein Konto gelöscht (Löschrecht), bleibt die Audit-Zeile ohne
  Akteur stehen. Wahrheitswerte stehen als „true/false" darin.
- **Tests ohne Docker:** PGlite (Postgres als WebAssembly) lädt die
  Migrationen so, wie Supabase sie ausführt; `supabase/tests/auth_stub.sql`
  ersetzt nur, was Supabase mitbringt (`auth.users`, `auth.uid()`, Rollen).
  Gegenprobe mit lokalem Postgres 16 bestanden. RLS filtert still: Eine
  fremde Zeile ändern ergibt 0 Zeilen, keinen Fehler — Tests prüfen
  `affectedRows`, nicht nur Ausnahmen.
- **Anmeldung nur für Eingeladene** (`enable_signup = false`,
  `shouldCreateUser: false`). Eine unbekannte Adresse wird wie eine bekannte
  quittiert, ein falscher Code wie eine unbekannte Adresse — niemand soll
  durch Ausprobieren erfahren, wer ein Konto hat.
- **In die App gehört nur ein öffentlicher Schlüssel** (`sb_publishable_…`
  oder JWT `anon`); `backendKonfig` weist alles andere ab, auch unbekannte
  Formate. Weil Vite `VITE_*`-Werte fest ins Bundle schreibt, bricht
  zusätzlich der **Build** ab (`geheimeVariablen` in `vite.config.ts`) —
  ebenso bei einem Schlüssel, der fest im Quelltext steht
  (`geheimnisseImText`, gelesen wird das fertige Bundle). `deploy.yml`
  durchsucht `dist/` noch einmal mit eigenem Code und dekodiert dabei jedes
  JWT: Ein service_role-Schlüssel sieht aus wie der anon-Schlüssel, erst die
  Rolle unterscheidet sie. `.env*` steht in `.gitignore`.
- **KI-Proxy (Edge Function, folgt):** Der Anthropic-Schlüssel ist ein
  Secret der Function, nie im Browser. Die Function folgt dem Browser
  NICHT blind: JWT prüfen und `doccheck.can('pruefen')`, Systemprompt und
  erlaubte Modelle serverseitig je Zweck, Größen- und Ratenbegrenzung,
  Monatsbudget, keine Inhalte im Protokoll. Sonst ist sie ein offener
  Zugang zu Claude auf Kosten der ATO.

## Dateien von außen (DocCheck)

- **DOCX/XLSX öffnen nur über `parse/zip.ts`** (`zipOeffnen`, `teilLesen`):
  Grenzen für Einträge, angegebene UND tatsächlich entpackte Größe je Teil
  und je Datei. Die Angaben im ZIP-Verzeichnis lassen sich fälschen — erst
  das Mitzählen beim Entpacken stoppt eine Zip-Bombe. Wer `JSZip.loadAsync`
  direkt auf eine hochgeladene Datei ansetzt, öffnet die Lücke wieder.
- Ungültige Zeichenreferenzen werden zu U+FFFD, statt das ganze Dokument
  abzubrechen.

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
  Und sie **sagen es**: Jede Ansicht mit `forms:`-Texten trägt `lang="en"`
  (`Page`, `TopBar`, Formularleiste, Wurzel der Grading-Ablage) oder wird
  nur in einer solchen gezeigt; Dialoge geben es selbst an, weil sie per
  Portal am <body> hängen. Ein Knopf aus `common` darin trägt die Sprache
  der Oberfläche. Ohne das las die Sprachausgabe „Competent" deutsch
  (WCAG 3.1.2, Audit 11/2026, A11Y-12) — `src/i18n.test.ts` prüft es.
  Dort stehen auch die **Textwachen über alle Bundles** (App, forms,
  DocCheck, Impressum ab Werk): Eine Zahl vor einem Wort, das sich nach ihr
  richtet, kommt über `{{count}}` mit `_one`/`_other` — auch die zweite
  Zahl eines Satzes („{{shown}} von {{count}} Einträgen", sonst „1 von 1
  Seiten"); kein „(en)"/„(s)"; Anführungszeichen deutsch „…“, englisch
  “…”, geschlossen; keine Sie-Anrede; gleicher Wert in de und en nur aus
  einer benannten Gruppe (Produktnamen, Fachbegriffe …). Die Liste der
  Mehrzahlwörter ist eine Heuristik — ein neues Zählwort gehört hinein
  (Audit 11/2026, TXT-08/09/13, GRD-20).
- **Überschriften** kommen aus `SectionHeading` (gliedert die Seite,
  Akzentmarke + Linie) und `CardHeading` (beschriftet den Inhalt einer
  Karte). Beide in `text-ink`, nicht `text-dim`: Eine Überschrift ist die
  Struktur des Textes, nicht sein Kleingedrucktes. Wer eine neue
  Zwischenüberschrift braucht, nimmt eine der beiden — das Muster war
  vorher an vierzig Stellen von Hand geschrieben und wich überall leicht ab.
  Die Gliederung springt nie über eine Ebene: `CardHeading` ist h3 unter
  einer `SectionHeading`, direkt unter der Seitenüberschrift `level={2}`
  (Formular, Einstellungen, Statistik, Logbuch, DocCheck-Spalten). Jede
  Seite hat genau ein `<main>` und eine h1 — auch Anmeldung und
  Gerätevorschau (A11Y-14, geprüft in `e2e/barrierefreiheit.spec.ts`).
- **Fenstertitel** setzt die Kopfleiste: „Notes – Instructor Connect"
  (`useDokumentTitel`, `src/dokumentTitel.ts`); ohne Kopfleiste ruft die
  Seite den Hook selbst. Eine Druckansicht (`useDruckTitel`) geht vor, ihr
  Titel ist der Dateiname des PDF. Beide melden sich in EINEM Stapel an,
  statt „vorigen Titel zurückzuschreiben" — das ließ je nach Reihenfolge
  der Effekte den Titel einer geschlossenen Seite stehen (A11Y-13).
- **Die Aktion der Kopfleiste** („+ Neue Notiz") kommt aus `TopBarAktion`
  (`ui.tsx`): am Telefon nur das Plus, ihr Name bleibt die Beschriftung,
  ab `sm` steht sie daneben. Neben einer langen Beschriftung blieb vom
  Seitentitel „Le…" (MOB-02/KERN-17). Jede Kopfleiste nimmt sie, keine
  eigene Pille — sonst zeigt dasselbe Telefon denselben Knopf in zwei
  Gestalten.
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
  Entziehung wieder rückgängig, und zwar nach oben. **Feedback** folgt der
  Regel ebenfalls — zusätzlich zur Gruppe, beide Schranken müssen passen; die
  Sicht steht als `visibleFeedback` im Store, weil die Statuszeile dieselbe
  Zahl braucht. Bewusst NICHT geändert: Bei Info-Eintrag und Chat-Gruppe
  bleibt „Ohne Muster" der Vorgabewert eines optionalen Feldes — anders als
  beim Lesson Plan, wo es Pflicht ist. Das ist eine bewusste Entscheidung
  für den schnellen allgemeinen Aushang, keine Lücke. Die **Nachweise**
  (Ablage, Statistik, Behördenexport) bleiben bewusst rollenbasiert: Die
  Aufbewahrungspflicht gilt für den ganzen Bestand, nicht für den eigenen
  Teil davon. Wer eine neue Ansicht baut, entscheidet zuerst, in welche der
  beiden Gruppen sie gehört.
- **Rechte werden an EINER Stelle vergeben** — `#/admin/permissions`. Dort
  stehen die Rollen-Matrix und, darunter, dieselben vier personenbezogenen
  Rechte (bewerten, Trainee, Verzeichnis, Chat-Sperre) für alle Nutzer
  nebeneinander. Vorher waren es drei Stellen: die Matrix, vier Kästchen in
  der aufgeklappten Nutzerzeile und dieselben vier als Schalter der
  Sammelbearbeitung. Wer wissen wollte, was jemand darf, sah an drei Stellen
  nach. Die Liste steht in `src/adminAccess.ts` (`PERSON_PERMS`), damit
  Matrix und Sammelbearbeitung dieselben Rechte in derselben Reihenfolge
  zeigen. Bewusst NICHT dorthin geholt: Rolle und Muster (gehören zur
  Identität des Nutzers) und die Chat-Administration (gehört an den Chat) —
  ein Verweis nennt beides. Bewerten und Verzeichnis wirken nur beim
  Mitglied; bei den anderen Rollen entscheidet die Matrix, und die Zeile
  zeigt gesperrt den wirksamen Wert „über Rolle" (`personenRechtWirkt`) —
  ein Kästchen ohne Folgen ließ einen Admin weiter bewerten (VERW-02).
- **Wer welchen Verwaltungsbereich öffnet**, sagt `adminTabsFuer`
  (`src/adminAccess.ts`, liest die Matrix mit) — Kachel auf der Startseite,
  Reiterleiste, Zugangsriegel und die Schreibrechte des Stores
  (`storeRechte.ts`) fragen dieselbe Stelle. Sie stand zweimal in derselben
  Datei, verschieden formuliert, und die beiden waren sich nicht einig: Der
  Training Admin bekam eine Kachel, hinter der „kein Zugriff" stand. Auch
  die Statuszeile fragt sie — ein Punkt, der in einen gesperrten Bereich
  führt, ist schlimmer als kein Punkt. Den Grading-Bereich bekommt der
  Training Admin nur mit `grading_view_all`: Fest vergeben, zeigte er nach
  dem Entzug weiter alle Formulare samt Export (VERW-03). Dessen Konfiguration
  (Formulartypen, Kompetenzkataloge, Empfänger) bleibt dem Superadmin —
  `darfGradingKonfigurieren` (`storeRechte.ts`) fragen Ansicht UND Store;
  vorher sperrte nur die Ansicht, `updateGrading` fragte niemanden.
- **Statusmarken** kommen aus `Badge` (`src/components/ui.tsx`) — fünf Töne
  mit je *einer* Bedeutung: `ok` erledigt, `wait` wartet oder mahnt, `bad`
  durchgefallen oder kaputt, `accent` neutrale Einordnung, `dim` ruhiger
  Nebenzustand; `strong` schaltet auf die volle Fläche. In der weichen Form
  trägt die getönte Fläche (mit Rand) die Farbe, die Schrift bleibt `ink`:
  farbige Schrift auf eigener 15-%-Fläche lag nachgemessen bei 3,4–4,3:1. Keine handgebaute
  Pille mehr: „Not Competent" stand vorher in drei Farben nebeneinander.
  Wo `ok`/`wait`/`bad` doch als Schrift stehen („16 items open"), reichen
  sie 4,5:1 auf Hintergrund, Karte und erhabener Fläche — in beiden Themen
  und im Druck; `src/themeTokens.test.ts` rechnet nach (A11Y-05).
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
- **Am Desktop** begrenzt `Page` die Breite (1152 px, `wide` 1280 px), von
  1024 bis 1279 px auf 1024 px — vorher galt dort die Tablet-Schranke von
  768 px, und das Admin-Panel, das ab 1024 px aufgeht, sah aus wie eine
  Tablet-Spalte (UID-16). Kopfleiste, Seite und Sandbox-Leiste nehmen
  dieselbe Klasse (`seitenBreiteCls`). Wo die
  Breite etwas zu tragen hat, füllt sie `CardGrid` mit zwei Spalten; bei einer
  einzelnen Karte bleibt es einspaltig, sonst stünde daneben eine leere Hälfte.
  Kachelraster (Startseite, Admin-Panel) rechnen ihre Spalten aus der
  Kachelzahl (`src/kachelRaster.ts`): nie eine Kachel allein unter vollen
  Reihen — die Zahl hängt an Rolle und Rechten (zwei bis neun).
- **Ränder am Gerät:** Die App läuft mit `viewport-fit=cover` unter die
  Systemleisten. Seitlich nimmt jeder randnahe Container `safe-x` (eigener
  Rand über `--rand-x`, im Querformat der Sicherheitsbereich der
  Sensorkappe), Vollbildflächen `safe-rundum`, das Bottom-Sheet unten
  `pb-safe-5` und `max-h-dialog` (dvh) — alles in `src/index.css`. Neben
  `safe-x` steht kein `px-*` (MOB-07, `e2e/mobil.spec.ts` gibt die
  Bereiche per CDP vor).
- **Bewegung reduzieren** (Systemeinstellung) gilt app-weit: Übergänge und
  Animationen kürzt eine Medienabfrage in `src/index.css`, Kachelhub nur mit
  `motion-safe:`, und ein Sprung aus dem Code (`scrollIntoView`) fragt
  `scrollVerhalten()` (`src/bewegung.ts`) — eine ausdrückliche
  `behavior: 'smooth'` schlägt jede CSS-Regel (Audit 11/2026, A11Y-15).
- **Alles am unteren Bildschirmrand** (Bestätigung, Offline-Streifen,
  Speicherwarnung, Update-Hinweis) liegt in EINEM Stapel in `App.tsx`, nicht
  je einzeln auf `fixed above-sandbox`. Zweimal ist derselbe Fehler passiert:
  erst verdeckte der Offline-Streifen die Formularleiste, dann die
  Bestätigung den Offline-Streifen. Was gleichzeitig sichtbar sein kann,
  gehört untereinander. Im Druck fehlt der Stapel als Ganzes (`print:hidden`
  am Stapel, nicht je Streifen) — vorher stand „Form signed and sent." auf
  dem Nachweis-PDF.
- **Zwei Prüfungen für dieselbe Sache laufen auseinander.** Die
  Fortschrittsleiste des Formulars und die Absendeprüfung waren getrennt —
  die Leiste meldete „Alles erledigt", das Absenden verweigerte. Jetzt leitet
  sich `validate()` aus `openItems` ab. Wer eine neue Bedingung einbaut, baut
  sie in die Liste, nicht daneben.
- **Dialoge** führen den Fokus über `useDialogFokus` (`src/components/ui.tsx`):
  hinein beim Öffnen, Tab im Kreis, Escape, zurück zum Auslöser. `Modal`
  und der DocCheck-Viewer nutzen denselben Hook — der Viewer hatte die
  Regel nicht, und wer ihn per Tastatur öffnete, stand dahinter. Der
  Auslöser wird beim ersten Rendern gemerkt, nicht im Effekt: `autoFocus`
  greift vorher, und gemerkt war sonst das Dialogfeld selbst — der Fokus
  fiel auf <body> (A11Y-03). Ist der Auslöser weg oder war es <body>,
  landet der Fokus auf der Seitenüberschrift (`fokus.ts`, ebenso nach der
  Anmeldung, A11Y-17) — mit `preventScroll`, wie beim Seitenwechsel: Die
  Überschrift klebt oben und ist zu sehen, ein Rollen dorthin hieße
  Seitenanfang (KERN-01). `autoFocus` in Dialogen braucht es deshalb nicht.
  `Modal` rendert per Portal an den <body> — in einem `space-y-*`-Stapel
  bekam die Abdunklung sonst einen Rand, oben blieb ein Streifen frei, und
  ein Klick dorthin traf den Zurück-Knopf (UID-04).
- **Bestätigungen** kommen aus `toast(text, tone)` (`src/components/Toast.tsx`),
  nicht aus einem Dialog: Eine Rückmeldung darf den nächsten Handgriff nicht
  aufhalten. Der Streifen trägt `role="status"`, damit Sprachausgaben ihn
  vorlesen, ohne den Fokus zu nehmen. Wer eine Aktion baut, die etwas
  Endgültiges tut (speichern, löschen, absenden, herunterladen), quittiert
  sie — vorher sprang das Grading-Formular wortlos zurück, und drei
  verschiedene Ausgänge sahen gleich aus. Was in den Bestand schreibt,
  quittiert über `useQuittung` (`Toast.tsx`, Regel in `src/quittung.ts`):
  Die Quittung kommt erst, wenn der Store geschrieben hat (`gesichert`),
  scheitert das Schreiben oder antwortet die Ablage nicht, steht statt
  „gespeichert" „Nicht gespeichert" — vorher kam die grüne Quittung auch
  dann (R3-SPEICHERQUITTUNG). Herunterladen bleibt ein einfacher `toast`.
  **Ablehnungen bei offenem Dialog stehen IM Dialog, nie als Toast:** Der
  Toast-Stapel liegt unter dem Dialog und war am iPhone vom Bottom-Sheet
  verdeckt (R3-DIALOGMELDUNG, Entscheidung vom 03.11.2026). Am Feld, wenn
  ein Feld den Grund zeigt (dann bekommt es den Fokus), sonst in
  `DialogMeldung` (`ui.tsx`) direkt über den Dialogknöpfen — `role="alert"`,
  Live-Region immer im Baum, per `aria-describedby` am Dialog. Wohin eine
  Ablehnung gehört, sagt `ablehnungZeigen` (`src/dialogMeldung.ts`). Der
  Dialog bleibt offen, die Eingaben bleiben stehen; dafür sagen die
  Speicheraktionen des Stores, ob sie gewirkt haben (`boolean`, wie
  `addUser`). Toasts sind Quittungen NACH dem Schließen.
- **Sammelaktionen** planen in `src/bulkUsers.ts`, bevor sie schreiben. Zwei
  Zusagen hängen daran und sind dort getestet: Der gemeldete Zähler nennt,
  was sich *wirklich* ändert (nicht die Größe der Auswahl), und niemand kann
  sich selbst oder den letzten aktiven Superadmin aussperren. Die **Rolle**
  bleibt bewusst Einzelentscheidung.
- **Das Logbuch speichert keine abgeleiteten Einträge.** Was aus einem
  Grading-Formular folgt, rechnet `src/logbook.ts` bei jedem Öffnen neu aus
  `gradingRecords`; im Store liegen nur Overrides (Teilzeiten, Notiz,
  Löschmarke) und manuelle Einträge. Wer abgeleitete Einträge materialisiert,
  baut die zweite Wahrheit für dieselbe Stunde — Formular korrigiert,
  Logbuch veraltet. Gezählt wird der DURCHGANG (`batchId`), nicht das
  Blatt: Ein Durchgang mit zwei Piloten zählt einmal, nicht doppelt.
  Korrekturen gelten je Durchgang (`overrideSetzen`), die Löschmarke
  steht auf jedem Blatt (Audit 11/2026, LOG-01).
  Geschrieben wird **ausschließlich ins eigene** Logbuch
  (die Store-Aktionen kennen gar keinen Ziel-Nutzer): Ein
  Tätigkeitsnachweis, den ein anderer nachbessern kann, ist keiner. Die
  Sichtbarkeit fremder Logbücher folgt der Musterregel (`sichtbareEintraege`,
  `darfLogbuchOeffnen`), nicht einer eigenen Auslegung je Ansicht.
- **Das Datumsformat steht in `src/datum.ts`** — DD.MM.YYYY in beiden
  Sprachen, dazu `formatDateTime` und `monatsName`. Es lag einmal in
  `src/pages/Grading.tsx`: zwölf Module zogen die Regel aus einer
  Seitendatei, und die Testwache konnte keinen Test verlangen, weil sie nur
  `src/*.ts` prüft. Deshalb prüft `testGuard` jetzt auch die Kehrseite —
  **kein Modul in `src/*.ts` importiert aus `src/pages/`**. Die
  Datums-Eingabefelder folgen weiter dem Gerät; deren Schreibweise bestimmt
  der Browser.
- **Kommentare** erklären das *Warum* (gern mit dem Befund, der dahintersteht),
  nicht das *Was*. Deutsch, wie der Bestand.
- **Auslieferung:** Entwicklung im Feature-Branch, Merge per PR nach `main`;
  `deploy.yml` veröffentlicht ausschließlich aus `main`.
- Der Changelog steht bewusst auf einem einzigen `1.0.0`-Eintrag (Erststand);
  `migrateState` setzt ihn bei Bedarf darauf zurück.
