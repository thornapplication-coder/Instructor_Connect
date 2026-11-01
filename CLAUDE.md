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
- **Ebene 3 (vorhanden, `e2e/`, `npm run e2e`):** wenige Wege mit Playwright
  gegen den echten Build (`vite preview`, Port 4174), eigener CI-Job. Anmelden
  über den echten Sandbox-Weg (E-Mail → angezeigter Code), Testdateien aus
  `benchmark/sbx.ts` (`e2e/vorbereitung.ts`), keine Binärdateien im Repo.
  Abgedeckt: DocCheck einlesen → Befund per Tastatur → Viewer-Fokus; Export
  (CSV/Excel gleiche IDs, Prüfstand hin und zurück); Re-Check bis zur Datei
  mit „Neue Findings"; Wartung und Wiedereinschalten; Telefon-Ansicht;
  Offline-Start. Offen: Grading (Formular → Unterschrift → Versand).
  Der Offline-Test fand einen echten Fehler: Mit „Vary: Origin" (vite
  preview, manches Hosting) startete die App ohne Netz weiß, weil Module
  MIT Origin-Kopf angefragt, aber OHNE vorgeladen wurden — der Service
  Worker schlägt deshalb mit `ignoreVary` nach (gefahrlos: Dateien sind
  inhaltsgehasht). Wer einen Test ergänzt: Was als Logik prüfbar ist,
  gehört in Ebene 1 — jeder Browser-Test kostet Sekunden und bricht bei
  Textänderungen.

Die Trennung der Ebenen ist Absicht: Liefe Ebene 1 ebenfalls unter `jsdom`,
könnte ein Logik-Modul unbemerkt vom DOM abhängig werden und der Lauf bliebe
grün.

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
- **Statisch geladen wird nur `index.tsx`**; alles andere per `lazy`
  hinter einer `ErrorBoundary`. Der Service Worker nimmt Dateien, die nur
  über das Modul erreichbar sind, aus dem Vorab-Cache (`nurNachgeladen` in
  `vite.config.ts`). Wer DocCheck aus dem Startbundle importiert, holt
  Parser und Exportbibliotheken auf jedes Gerät.
- **Texte** im Namensraum `doccheck` (`i18n/de.json`, `i18n/en.json`),
  nachgereicht beim Laden des Moduls. Die Hülle (Wartung, Ladefehler) steht
  im App-Bundle unter `docCheck`, weil sie gerade dann gebraucht wird, wenn
  das Modul nicht geladen ist.
- **Ansichtsmodus** nach `pointer: coarse` (`viewMode.ts`), bewusst getrennt
  von `useIsDesktop` (Breite) — beide Regeln gelten je für ihren Bereich.
- **Prüf- und Sitzungsdokumente liegen NIE im Anwendungszustand.** Der wird
  in IndexedDB gespeichert; die Dokumente leben in `sitzung.ts` (Speicher
  des Tabs) und im Worker. Abmelden sendet `ic-abmelden`, Nutzerwechsel
  („Ansicht als") leert die Sitzung ebenfalls.
- **Lesen läuft im Worker** (`doccheck.worker.ts` übersetzt nur Nachrichten,
  die Arbeit macht `kern.ts`, in Node testbar). pdf.js wird in die Leser
  hineingereicht: im Browser die moderne Fassung, in Tests `legacy`.
- **Ein Weg für alle Formate:** PDF, DOCX und XLSX laufen durch
  `parse/aufbereiten.ts`. Bewusst ohne mammoth und ohne SheetJS (siehe
  Changelog 1.7.0) — Office-XML liest `parse/xml.ts`.
- **Laufzeitdateien** (OCR-Kern, Sprachdaten, pdf.js-Schriften) liefert
  `docCheckDateien` in `vite.config.ts` unter festen Namen in `doccheck/`
  aus. Ohne ausdrückliche Pfade lädt tesseract.js alles von einem CDN —
  `ocr.test.ts` prüft das.
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
  Words Seite gehalten.
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
  Absturz im Worker).
- **Verweise** (N7) haben je Art GENAU eine Regel: interne Kapitelverweise
  prüft die Formalprüfung (`querverweise`, v1.1); `pruefung/verweise.ts`
  prüft je Dokument nur Übungsnummern und Zirkel, die Paketprüfung alle
  Verweise auf ein anderes Dokument. Fehlt das Ziel, heißt der Befund
  „Not verifiable – source missing" und erscheint nie als verifiziert. Ein
  Ziel in einem fremden Regelwerk („Appendix 9 to Part-FCL", „Annex I
  (Part-FCL)") ist kein Verweis ins Dokument (`fremdesRegelwerk`).
  Kapitelnummern kommen aus der Gliederung UND aus nummerierten Absätzen —
  sonst wäre jeder Verweis auf „1.4.1.1 The PIC …" kaputt.
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
  viele wegfielen. Ab 1024 px zwei Spalten mit den Reitern oben, ab 1280 px
  drei. Das Gate zeigt je Dokument nur auffällige Prüfpunkte, der Rest auf
  Klick; Dokumentkarten klappen ihre Angaben ein, sobald nichts mehr offen
  ist; Revision notfalls aus dem Dateinamen (`revisionAusDateiname`).
  Befundzeilen klappen über einen echten Knopf auf (Tastatur), Reiter
  folgen dem ARIA-Muster (`reiter.ts`), Befundtext trägt `lang="en"`.
  „Nicht anwendbar" nie per Deckkraft dämpfen — das drückte den Kontrast
  unter 3:1.
- **Exporte** (`export/`, Spez. v1.1 Kap. 10, 12): EIN eingefrorener
  Datenstand (`datenstand.ts`), aus dem Excel, Word, CSV, PowerPoint und
  Prüfstand entstehen — wer einen Wert in einem Format selbst ausrechnet,
  baut die zweite Wahrheit. Befund-IDs sind über Dokumente eindeutig
  (`TM-001`, `TM2-001`, `PKG-001`), Sortierung Dokument → Seite → Priorität.
  Alles englisch aus `labels.en.json` bzw. dem englischen Sprachpaket,
  unabhängig von der Oberfläche. Excel von Hand wie das Rückschreiben
  (COUNTIFS mit mitgeliefertem Ergebnis, Dropdowns, Zeilenfarbe nach
  Priorität, Druck A4 quer mit Fußzeile); gleiche Eingabe → byte-gleiche
  Datei (JSZip `createFolders: false`, sonst Ordner mit Uhrzeit). Word mit
  `docx`, PowerPoint mit `pptxgenjs` — beide NUR per `import()` in
  `ausgabe.ts`, also nie im Startbundle. Word ohne Inhaltsverzeichnis-FELD
  (Aktualisierungsdialog); Links auf Textmarken. Gesamtbewertung ist ein
  VORSCHLAG aus den Regeln (High offen → nicht einreichungsfähig) und im
  Excel ein Dropdown. Die Compliance Matrix bleibt ehrlich leer, bis die
  KI-Prüfung sie füllt. Organisationsname aus `organisation` der
  Einstellungen, nie hart codiert. `pptxgenjs` zieht `image-size` mit einer
  bekannten Schwachstelle — `overrides` in package.json erzwingt die
  bereinigte Fassung. Prüfstand `.doccheck.json`: nur Metadaten, Hashes,
  Befunde, kurze Auszüge; beim Laden geprüft (Schema, Werte, Größe) und bei
  Abweichung abgewiesen; gleiche Befund-IDs nach dem Laden. Der mobile
  Bereich „Befunde" öffnet Prüfstände und exportiert daraus.
- **Submission gate** warnt ab Werk (`gateSperrt: false`, Entscheidung
  vom 01.11.2026); Sperre ist Einstellung des Superadmins.
- **Keine erfundenen Preise.** Modellpreise sind ab Werk leer; ohne Preise
  keine Kostenschätzung und kein Start.
- **Keine echten OEM-Dokumente im Repo** — der Sandbox-Bestand ist
  synthetisch (`SBX-…`), der Test prüft das.

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
  zusätzlich der **Build** ab (`geheimeVariablen` in `vite.config.ts`), und
  `deploy.yml` durchsucht `dist/` nach Schlüsselwerten. `.env*` steht in
  `.gitignore`.
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
  Nebenzustand; `strong` schaltet auf die volle Fläche. In der weichen Form
  trägt die getönte Fläche (mit Rand) die Farbe, die Schrift bleibt `ink`:
  farbige Schrift auf eigener 15-%-Fläche lag nachgemessen bei 3,4–4,3:1. Keine handgebaute
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
- **Dialoge** führen den Fokus über `useDialogFokus` (`src/components/ui.tsx`):
  hinein beim Öffnen, Tab im Kreis, Escape, zurück zum Auslöser. `Modal`
  und der DocCheck-Viewer nutzen denselben Hook — der Viewer hatte die
  Regel nicht, und wer ihn per Tastatur öffnete, stand dahinter.
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
- **Das Logbuch speichert keine abgeleiteten Einträge.** Was aus einem
  Grading-Formular folgt, rechnet `src/logbook.ts` bei jedem Öffnen neu aus
  `gradingRecords`; im Store liegen nur Overrides (Teilzeiten, Notiz,
  Löschmarke) und manuelle Einträge. Wer abgeleitete Einträge materialisiert,
  baut die zweite Wahrheit für dieselbe Stunde — Formular korrigiert,
  Logbuch veraltet. Geschrieben wird **ausschließlich ins eigene** Logbuch
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
