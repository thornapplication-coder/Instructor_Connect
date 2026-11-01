# DocCheck – Spezifikation · Nachtrag v1.2

Stand: 01.11.2026 · Erweiterung um **Re-Check bestehender Findinglisten**, **Paketprüfung** und **Word-Check**

> **Für Claude Code:**
> - Dieser Nachtrag **ergänzt** `DocCheck_Spezifikation_v1_1.md`. Alles, was hier nicht geregelt ist, gilt unverändert aus v1.1. Bei Widerspruch gilt für die hier beschriebenen Punkte dieser Nachtrag.
> - Kapitelverweise auf v1.1 nennen Nummer **und** Titel. Weicht die Nummer ab, gilt der Titel.
> - Es gelten die Arbeitsregeln aus v1.1: phasenweise bauen, bei Unklarheit **zuerst fragen**, nach jeder Phase Zusammenfassung und Freigabe abwarten.
> - Alle Aussagen zu Bibliotheken (ExcelJS, SheetJS, JSZip, DOCX-Parser) bei der Umsetzung gegen die **aktuelle** Dokumentation prüfen. Wo dieser Nachtrag ein Verhalten als „nach heutigem Kenntnisstand“ beschreibt, entscheidet der Abnahmetest, nicht die Annahme.
> - Weiterhin gilt aus `CLAUDE.md`: **keine echten OEM- oder ATO-Dokumente im Repo.** Alle Testdokumente dieses Nachtrags sind synthetisch (`SBX-…`).

---

## 1. Anlass

Am 01.11.2026 wurde ein komplettes Manualpaket einer FSTD-ATO manuell (KI-gestützt) nachgeprüft:

- 1 Training Manual, 4 Appendices, 8 Annexes, alle als DOCX, zusammen ca. 530 Seiten,
- eine **vom Team selbst geführte Findingliste** (Excel, eigenes Layout, 294 Befunde), deren Korrekturen eingearbeitet sein sollten,
- Ergebnis: Status je Altbefund (behoben / teilweise / nicht behoben) mit Remark, dazu 243 neue Befunde und ein technischer Word-Check.

Dabei sind Arbeitsschritte und Fehlerbilder aufgetreten, die v1.1 nicht oder nur teilweise abdeckt:

| Beobachtung | Folge für DocCheck |
|---|---|
| Die Findingliste stammt **nicht** aus DocCheck, sondern ist eine eigene Excel des Teams mit Dropdowns, bedingter Formatierung und Diagramm | Fremdlisten importieren, nachprüfen und **in die Originaldatei zurückschreiben**, ohne deren Formatierung zu zerstören (N3) |
| 10 von 13 Schreibweisen-Befunden waren nur teilweise behoben – die Reste standen auf anderen Seiten und in anderen Dokumenten | Nachprüfung immer per Volltextsuche über das **ganze Paket** (N3.4) |
| Korrekturen wurden nur in einem von zwei Schwesterdokumenten eingearbeitet (MP/SP-Fassungen, Varianten A–D) | Geschwistergruppen und Fix-Propagation-Check (N2) |
| Das TM ist die Referenz für seine eigenen Anhänge; Widersprüche sind im Anhang zu korrigieren | Dokumentpaket mit Hierarchie (N1) |
| In zwei Dokumenten stand **weiß formatierter, unsichtbarer Text** (interne Kommentare in Landessprache) | Word-Technik-Check als Einreichungs-Gate (N4) |
| Uneinheitliche Korrektursprache und „Rechtschreibung nicht prüfen“ auf Überschriften haben verhindert, dass Word selbst Tippfehler meldet | N4.3 |
| Seitenzahlen eines Renderings wichen von Word um bis zu 7 Seiten ab | Seitenangaben bei DOCX (N5) |
| Stundensummen, kumulierte Zeitleisten und Einheitenumrechnungen waren falsch | Rechen- und Plausibilitätsprüfung (N6) |
| Verweise zeigten auf nicht existierende Übungsnummern bzw. auf falsche Kapitel anderer Dokumente | Verweise zwischen Dokumenten (N7) |
| Regelwerksverweise konnten mangels Easy Access Rules / OSD / interner OMM nicht abschließend belegt werden | Bibliothekstypen OSD, CS, intern (N12) und Referenzprüfung (N8) |

---

## 2. Übersicht der Erweiterungen

| Nr. | Erweiterung | Art | Phase (v1.1 Kap. 18) |
|---|---|---|---|
| N1 | Dokumentpaket mit Hierarchie | Struktur | 8 |
| N2 | Geschwistergruppen und Fix-Propagation-Check | regelbasiert | 8 / 9 |
| N3 | Re-Check externer Findinglisten inkl. Rückschreiben in die Originaldatei | KI + regelbasiert | 9 (Import/Prüfung), 6 (Rückschreiben) |
| N4 | Word-Technik-Check als Einreichungs-Gate | regelbasiert, ohne KI-Kosten | 8 (Option: vorziehen, siehe Kap. 12) |
| N5 | Seitenangaben bei DOCX (Word-PDF-Paar, Fallback über TOC) | regelbasiert | 2 |
| N6 | Rechen- und Plausibilitätsprüfung | regelbasiert | 8 |
| N7 | Verweise zwischen Dokumenten | regelbasiert | 8 |
| N8 | Prüfung der Regelwerksverweise gegen die Bibliothek | regelbasiert | 5 |
| N9 | Fremdsprachige Reste und erweiterte Platzhalter | regelbasiert | 8 |
| N10 | Konsolidierung großer Pakete | Engine | 5 |
| N11 | Statuswerte und menschliche Freigabe | Datenmodell / UI | 5 |
| N12 | Neue Bibliothekstypen (OSD, CS, intern) | Datenmodell | 3 |

Regelbasierte Prüfungen laufen **lokal im Browser (Worker)**, kosten keine API-Tokens und funktionieren auch im Notbetrieb (v1.1 Kap. „Betriebssicherheit/Notbetrieb“).

---

## 3. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Dokumentpaket** | Mehrere Prüfdokumente, die gemeinsam eingereicht werden (z. B. TM mit Appendices und Annexes). Hat eine Bezeichnung und eine Revision. |
| **Ebene** | Rang innerhalb des Pakets: 1 = höchste Stufe (z. B. TM), 2 = Appendix, 3 = Annex. Frei konfigurierbar. |
| **Interner Master** | Ein Paketdokument höherer Ebene, gegen das Dokumente tieferer Ebene geprüft werden. Externe Master (OEM, EASA) bleiben in der Bibliothek. |
| **Geschwistergruppe** | Dokumente gleicher Ebene mit weitgehend gleichem Text, die sich nur in definierten Punkten unterscheiden dürfen (z. B. Multi-Pilot- und Single-Pilot-Fassung, Varianten A–D). |
| **Fremdliste** | Eine Findingliste, die nicht von DocCheck erzeugt wurde (eigene Excel des Teams, Liste einer Behörde, Audit-Liste). |
| **Statusvorschlag** | Von DocCheck ermittelter Status eines Befunds, der erst durch eine Person wirksam wird (N11). |
| **Word-PDF-Paar** | DOCX und das daraus mit Word erzeugte PDF desselben Dokuments. |
| **Kerndaten-Extrakt** | Strukturierte Fakten je Dokument (Stunden, Sessions, Codes, Gerätebezeichnungen, Voraussetzungen, Prüfungen) für den Querabgleich (N10.2). |

---

## 4. N1 – Dokumentpaket mit Hierarchie

### 4.1 Verhalten
- Im Tab „Prüfen“ kann statt Einzeldokumenten ein **Paket** angelegt werden: Name, Paket-Revision, Dokumente per Drag & Drop.
- Je Dokument: **Ebene** (1–n), optional **Geschwistergruppe** (N2), Kürzel (z. B. „TM“, „APX 4“, „ANX 2A“).
- **Automatische Vorbelegung** aus Dateiname und Deckblatt (v1.1 Metadaten-Erkennung): Präfixe `TM`, `APX`/`APPENDIX`, `ANX`/`ANNEX`; Ziffern-Präfixe wie `1_`, `2_`, `3_` als Ebene. Die Vorbelegung ist als „erkannt“ markiert und muss bestätigt werden.
- **Hierarchieregel:** Widerspricht ein Dokument tieferer Ebene einem Dokument höherer Ebene, wird der Befund **beim tieferen Dokument** geführt, mit Verweis auf die Fundstelle im höheren Dokument unter „Other Affected Documents“.
  - Ausnahme: Ist das höhere Dokument selbst regelwidrig (Abgleich gegen Bibliothek), wird der Befund beim höheren Dokument geführt und das tiefere als betroffen genannt.
- Die Paketstruktur wird im Prüfstand gespeichert und kann als Vorlage für die nächste Paket-Revision übernommen werden.

### 4.2 Paketweite Prüfpunkte
- **Liste der Appendices/Annexes** im Dokument der Ebene 1 gegen die tatsächlich im Paket enthaltenen Dokumente:
  - gelistet, aber nicht im Paket → Befund „Lücke“ (Hinweis: mit einreichen oder als „Reserved“ führen),
  - im Paket, aber nicht gelistet → Befund „Dokumentenlenkung“,
  - Titel in der Liste ≠ Titel auf dem Deckblatt → Befund „Inkonsistenz“.
- **Edition, Revision, Datum, Effectivity** paketweit gegenüberstellen (Tabelle im Summary, Abweichungen als Befund).
- **Gemeinsame Textbausteine** (z. B. Approval-Block, Behördenbezeichnung, Adresse) über alle Dokumente vergleichen; ein Befund je Abweichungstyp mit Liste aller betroffenen Dokumente statt 13 Einzelbefunden.

### 4.3 Abnahme
- Testpaket `SBX-PKG-01` (1 TM, 2 APX, 4 ANX): ein im TM gelisteter, aber fehlender Appendix wird gemeldet; ein Annex mit abweichender Stundenzahl wird beim Annex geführt, das TM steht unter „Other Affected Documents“.

---

## 5. N2 – Geschwistergruppen und Fix-Propagation-Check

### 5.1 Verhalten
- **Abgleich innerhalb der Gruppe:** Absätze werden über Kapitelnummer und Textähnlichkeit einander zugeordnet (jsdiff wie im v1.1-Revisionsvergleich). Abweichungen werden klassifiziert:
  - **erwartet:** durch eine je Gruppe hinterlegte Liste erlaubter Unterschiede (z. B. „PF/PM“, „crew“, „MCC“ nur in der MP-Fassung; Variantenbezeichnungen),
  - **verdächtig:** sonstige Unterschiede in sonst gleichen Absätzen → Befund „Inkonsistenz“ mit beiden Textauszügen.
- **Reste der Gegenfassung:** Begriffe aus der Liste erlaubter Unterschiede, die in der „falschen“ Fassung vorkommen (z. B. „PM“ in der SP-Fassung), werden als Befund gemeldet.
- **Fix-Propagation-Check:** Erkennt die Revisionsprüfung (v1.1 Kap. „Revisionsprüfung“) oder der Re-Check (N3) eine Korrektur in einem Geschwisterdokument, sucht DocCheck den **Originaltext** in allen anderen Mitgliedern der Gruppe. Steht er dort noch → Befund „Korrektur nicht in Schwesterdokument übernommen“, Priorität wie der Ursprungsbefund.

### 5.2 Konfiguration
- `config/sibling-rules.json`: je Gruppentyp erlaubte Unterschiede, z. B.
  ```json
  { "MP_SP": { "onlyIn": { "MP": ["PM", "PNF", "crew", "MCC", "Captain", "First Officer"], "SP": [] } } }
  ```
- Die Liste ist durch DocCheck-Admins pflegbar (Audit-Log).

### 5.3 Abnahme
- `SBX-PKG-01`: In ANX-A ist ein Tippfehler korrigiert, in ANX-B nicht → Befund bei ANX-B mit Verweis auf ANX-A. „The PM verifies …“ in der SP-Fassung → Befund „Reste der Gegenfassung“. Unterschiedliche Variantenbezeichnungen werden **nicht** gemeldet.

---

## 6. N3 – Re-Check externer Findinglisten

### 6.1 Ablauf
1. **Import:** Fremdliste hochladen (XLSX, CSV). Mehrere Blätter möglich; Blattauswahl.
2. **Spaltenzuordnung:** DocCheck schlägt die Zuordnung vor (Nr./ID, Dokument/Bereich, Seite, Kapitel, Befundtext, Empfehlung, Status-Spalten, Verantwortlich). Die Person bestätigt. Die Zuordnung wird als **Listenprofil** gespeichert und beim nächsten Import derselben Liste automatisch verwendet.
3. **Dokumentzuordnung:** Werte der Spalte „Dokument/Bereich“ (z. B. „APX 4“, „APPENDIX 4“, „TM ABC-123“) werden den Paketdokumenten zugeordnet. Nicht zuordenbare Werte (z. B. „Schreibweise“, „OSD“) gelten paketweit.
4. **Nachprüfung je Befund** (KI + regelbasiert):
   - Befundtext und Empfehlung werden in eine **Prüfanweisung** übersetzt: Was muss im Dokument stehen bzw. nicht mehr stehen?
   - Regelbasierte Volltextsuche nach dem beanstandeten Text im ganzen Paket (N3.4).
   - KI-Prüfung nur für inhaltliche Befunde, mit Belegzitat aus der aktuellen Revision.
   - Ergebnis je Befund: **Statusvorschlag** `Resolved` · `Partially resolved` · `Not resolved` · `Not verifiable` (N11), **Nachweis** (Zitat, Seite, Kapitel) und bei offenem Status ein **Remark**: Dokument, Kapitel, Seite, Originaltext, was fehlt, konkreter Korrekturvorschlag (Manual-Text in der Sprache des Manuals).
   - Kommentare des Teams in der Fremdliste (z. B. „Table added 1.1.1“, „IPT removed“) werden als Behauptung behandelt und **überprüft**, nicht übernommen.
   - Befunde, die nur als Empfehlung formuliert waren („evtl.“, „könnte man“), erhalten bei Nichtumsetzung den Vorschlag „Closed – justification required“ statt „Not resolved“.
5. **Freigabe:** Die Person sieht alle Vorschläge in einer Tabelle (Filter: Status, Dokument, Abweichung zum Team-Status). Einzel- oder Sammelbestätigung (N11).
6. **Neue Befunde** aus dem Re-Check erscheinen getrennt (nicht in der Fremdliste) und werden fortlaufend nach der höchsten vorhandenen Nummer der Fremdliste nummeriert.
7. **Rückschreiben** (N3.5) oder Export im DocCheck-Layout (v1.1 Kap. „Excel“).

### 6.2 Remark-Format
- Präfix mit Status und Datum, z. B. `PARTIALLY RESOLVED (re-check 2026-11-01): …` bzw. lokalisiert `TEILWEISE BEHOBEN (Re-Check 01.11.2026): …`.
- Mehrere Restfundstellen als Aufzählung, je Zeile: Dokument · Kapitel · Seite · Auszug.
- Sprache der Remarks wählbar (DE/EN); **Korrekturvorschläge immer in der Sprache des Manuals**.

### 6.3 Seitenangaben in Fremdlisten
- Seitenzahlen in Fremdlisten beziehen sich auf die **Vorrevision**. Sie dienen nur als Hinweis; gesucht wird über Text und Kapitel. Der Remark nennt die Seite in der **aktuellen** Revision (N5).

### 6.4 Restfundstellen-Regel
- Ein Befund ist nur dann `Resolved`, wenn der beanstandete Text bzw. alle Varianten **im ganzen Paket** nicht mehr vorkommen – nicht nur auf der genannten Seite.
- Bei Schreibweisen-Befunden: Zählung je Variante und Dokument wie im Terminologie-Scanner (v1.1); Nomen/Verb-Paare (z. B. „the callout“ / „to call out“) sind keine Restfundstellen; **wörtliche Zitate** aus Regelwerk/OEM sind ausgenommen, wenn sie als Zitat erkennbar oder in der Bibliothek belegbar sind.
- Restfundstellen alter Befunde werden **im Remark** des alten Befunds geführt und **nicht** zusätzlich als neue Befunde angelegt (Dublettenregel N10.3).

### 6.5 Rückschreiben in die Originaldatei
- **Ziel:** Die Fremdliste bleibt in ihrem Layout erhalten. DocCheck setzt nur:
  - die gewählte Status-Spalte (z. B. „Status Compliance“) auf den bestätigten Wert aus der dort verwendeten Werteliste,
  - eine **neue Remark-Spalte** rechts neben der letzten Spalte (Überschrift im Stil der vorhandenen Kopfzeile, Zeilenumbruch, Breite ca. 95),
  - ein **neues Blatt** „New findings“ / „Neue Findings“ im Stil der Liste: gleiche Kopfzeilenformate, Dropdowns aus dem vorhandenen Listen-Blatt, Prioritätsfarben, fixierte Kopfzeile, Autofilter, A4 quer,
  - optional einen Block mit Zählformeln im vorhandenen Übersichtsblatt, **unterhalb** vorhandener Diagramme.
- **Technische Anforderungen (verbindlich):**
  - Nach heutigem Kenntnisstand verlieren gängige Bibliotheken beim Lesen/Schreiben vorhandener Dateien Teile der Formatierung (u. a. Datenüberprüfungen im Erweiterungsbereich `x14:dataValidations` mit Bezug auf andere Blätter, Diagramme, Web-Erweiterungen). **Daher wird die Originaldatei auf XML-Ebene gepatcht** (JSZip): nur die betroffenen Teile (`sheetN.xml`, `styles.xml`, `workbook.xml`, Beziehungen, `[Content_Types].xml`, `docProps/app.xml`) werden geändert, alles andere bleibt byte-identisch.
  - Neue Zellen als Inline-Strings; neue Formate als zusätzliche `cellXfs`/`dxfs`-Einträge, vorhandene Indizes bleiben unverändert.
  - `calcChain.xml` entfernen und `fullCalcOnLoad` setzen; zwischengespeicherte Ergebnisse geänderter Zählformeln zusätzlich aktualisieren, damit auch Programme ohne Neuberechnung korrekte Zahlen zeigen.
  - Bestehende bedingte Formatierungen dürfen auf neue Zeilenbereiche erweitert werden, aber nicht verändert.
  - Die Originaldatei wird **nie überschrieben**; Ausgabe als neue Datei mit Datumssuffix.
- **Abnahme (Round-Trip-Test):** Eine synthetische Fremdliste `SBX-FL-01.xlsx` mit x14-Dropdowns auf ein verstecktes Listen-Blatt, bedingter Formatierung, verbundenen Zellen und einem Diagramm wird zurückgeschrieben. Danach:
  - alle Dropdowns, Formatierungen, verbundenen Zellen und das Diagramm sind vorhanden (XML-Vergleich der unveränderten Teile: identisch),
  - die Datei öffnet in Microsoft Excel (Windows/Mac) und LibreOffice ohne Reparaturdialog,
  - Zählformeln im Übersichtsblatt zeigen die neuen Werte.

### 6.6 Abnahme N3 gesamt
- `SBX-FL-01` mit 20 Befunden gegen `SBX-PKG-01` R0.1: korrekte Statusvorschläge für die eingebauten Fälle (behoben; teilweise behoben mit Rest in anderem Dokument; nicht behoben; Team-Kommentar behauptet Korrektur, Text fehlt; „evtl.“-Befund nicht umgesetzt; Quelle fehlt → `Not verifiable`).

---

## 7. N4 – Word-Technik-Check (Einreichungs-Gate)

### 7.1 Zweck
Regelbasierte Prüfung der DOCX-Struktur auf Mängel, die im Ausdruck oder in Word nicht sichtbar sind, aber im eingereichten Dokument stecken. Ergänzt die v1.1-Formalprüfung (dort bereits: nicht angenommene Änderungen, Kommentare, „Error! Reference source not found.“).

### 7.2 Prüfpunkte

| Prüfpunkt | Erkennung | Priorität |
|---|---|---|
| **Unsichtbarer Text** | Runs mit Schriftfarbe gleich oder nahe dem wirksamen Hintergrund (Weiß auf hellem Grund; Kontrast < 1,5:1), `w:vanish`, Schriftgröße ≤ 2 pt. Wirksamer Hintergrund = Run-Schattierung → Absatz-Schattierung → Zellen-Schattierung → **bedingte Formatierung der Tabellenformatvorlage** (z. B. erste Zeile) → Seitenhintergrund. Textfelder/Formen auf dem Deckblatt mit eigener Füllung separat auflösen. | Hoch |
| **Text in anderer Sprache als das Dokument** | siehe N9 | Hoch bei Entwurfs-/Arbeitskommentaren, sonst Mittel |
| **Textmarker** | `w:highlight` je Dokument zählen, Fundstellen listen | Niedrig (Hoch, wenn auf Platzhaltern) |
| **Korrektursprache** | `w:lang` der Runs und der Formatvorlage „Standard“ (`w:rPrDefault`) gegen die Dokumentsprache; Anteil Zeichen je Sprache | Niedrig |
| **„Rechtschreibung nicht prüfen“** | `w:noProof` je Dokument zählen; Hinweis, dass Word dort keine Fehler meldet | Niedrig |
| **Kompatibilitätsmodus** | `w:compatSetting compatibilityMode` < 15 bzw. abweichend vom Rest des Pakets | Niedrig |
| **Dokumenteigenschaften** | `docProps/core.xml`: Titel leer/abweichend, Autor, „zuletzt geändert von“ mit Personennamen | Niedrig |
| **Kopf-/Fußzeilen je Abschnitt** | Alle `headerN.xml`/`footerN.xml` auslesen, auch die **nicht sichtbarer oder leerer Abschnitte** (z. B. letzter leerer Abschnitt mit altem Datum). Inhalte paketweit vergleichen: Revision, Datum, Edition, Titel, Schreibweise | Mittel |
| **Edition/Revision-Konsistenz** | Deckblatt ↔ Kopf-/Fußzeilen ↔ Record of Revisions ↔ Highlights ↔ **Dateiname** (z. B. `E2R0.0` im Dateinamen, „Edition 1“ auf dem Deckblatt) | Mittel |
| **Veraltete Felder** | TOC-Einträge gegen Überschriften (Titel); Plausibilität der TOC-Seitenzahlen: monotone Folge, Abschnittslängen im Verhältnis zur Textmenge (Ausreißer > Faktor 2 melden); PAGEREF/REF-Ziele vorhanden | Niedrig |
| **Verirrte Fragmente** | Kurze Absätze (≤ 12 Zeichen) vor dem ersten Kapitel oder auf Deckblatt/Titelseite, die keine Kapitelnummer-Überschrift sind (z. B. „3.8.3.“) | Mittel |

### 7.3 Ausgabe
- Ampel je Prüfpunkt und Dokument im Summary („Submission gate“).
- Befunde in der Findings-Tabelle mit Kategorie „Dokumentenlenkung“ bzw. „Redaktionell“, Kennzeichnung `[Word check]`.
- Je Prüfpunkt eine **Handlungsanweisung für Word**, z. B. „Strg+A → Überprüfen → Sprache → Englisch (UK), Haken ‚Rechtschreibung nicht prüfen‘ entfernen“, „Datei → Auf Probleme überprüfen → Dokument prüfen“, „Strg+A → F9“.
- Gate-Regel (konfigurierbar): Export mit Gesamtbewertung „einreichungsfähig“ ist gesperrt, solange ein Prüfpunkt mit Priorität Hoch offen ist.

### 7.4 Abnahme
- `SBX-WORD-01.docx` mit: weißem Text in Tabellenzelle ohne Schattierung; weißem Text in Kopfzeile einer Tabelle mit dunkler Formatvorlagen-Schattierung (**darf nicht gemeldet werden**); `w:vanish`; spanisch/italienisch markierten englischen Absätzen; `noProof` auf Überschriften; letztem leerem Abschnitt mit eigener Kopfzeile und abweichendem Datum; Dateiname `…E2R0.0…` bei Deckblatt „Edition 1“; verirrtem Fragment auf dem Deckblatt. Alle Fälle werden gefunden, der Fehlalarmfall nicht.

---

## 8. N5 – Seitenangaben bei DOCX

### 8.1 Problem
Der Browser kann DOCX nicht so umbrechen wie Word. Jede eigene Darstellung weicht ab (im Anlassfall bis zu 7 Seiten). v1.1 kennzeichnet DOCX-Seiten als „ca.“ – das reicht für Befunde, aber nicht für die Arbeit des Teams, das in Word nach der Seite sucht.

### 8.2 Lösung
1. **Word-PDF-Paar (empfohlen):** Beim Hochladen eines DOCX bietet DocCheck an, das **aus Word exportierte PDF** dazuzulegen. Zuordnung über Dateiname und Textabgleich der ersten Seiten.
   - Struktur, Kapitel und Word-Technik kommen aus dem DOCX; **Seitenzahlen kommen aus dem PDF** (Textsuche der Fundstelle im PDF).
   - Abweichung zwischen DOCX und PDF (PDF älter als DOCX, Textunterschiede > 2 %) → Warnung, Seitenangaben dann wie Fallback.
2. **Fallback ohne PDF:** Abbildung über die von Word gespeicherten Daten:
   - Seitenzahlen im Feldergebnis des Inhaltsverzeichnisses (`TOC`-Feld) je Überschrift,
   - Gesamtseitenzahl `docProps/app.xml` `<Pages>`,
   - Fundstelle → nächste vorangehende Überschrift → deren Word-Seite + anteilige Position im Abschnitt, gedeckelt durch die Seite der nächsten Überschrift.
   - Kennzeichnung „S. 42 (±1)“; TOC-Plausibilität aus N4 beachten (bei veraltetem TOC Hinweis statt Seitenzahl).
3. **Immer:** Kapitel/Abschnitt wird zusätzlich zur Seite angegeben und ist maßgeblich.

### 8.3 Abnahme
- `SBX-PAGE-01.docx` + `SBX-PAGE-01.pdf` (aus Word exportiert): 20 Stichproben-Fundstellen haben die PDF-Seite. Ohne PDF liegen ≥ 90 % der Stichproben innerhalb ±1 Seite.

---

## 9. N6 – Rechen- und Plausibilitätsprüfung

| Prüfung | Erkennung | Beispiel |
|---|---|---|
| **Tabellensummen** | Spalten mit Zeitwerten (`H:MM`, `HH:MM`, `HH:MMh`, Dezimal mit Komma/Punkt) bzw. Zahlen; Zeile mit „TOTAL/Total/Summe“ gegen die Summe der Einzelzeilen | Module ergeben 24:00, TOTAL zeigt 16:00 |
| **Kumulierte Zeitleisten** | Zeitspalte „Dauer (kumuliert)“: kumulierter Wert = vorheriger kumulierter Wert + Dauer | 00:20 + 00:30 → 00:55 statt 00:50 |
| **Sessiondauer** | Summe der Timeline-Blöcke einer Session gegen die angegebene Sessiondauer (z. B. FSTD 04:00h) | Timeline 2:00, Kopf 4:00 |
| **Einheitenumrechnung** | Wertepaare mit zwei Einheiten (lbs/kg, ft/m, kt/km/h, °C/°F) im selben Satz/Zelle; Toleranz 1 % | 11930 lbs / 5834 kg |
| **Paketweite Zahlen** | Gleiche Größe (z. B. „WBT-Stunden“, „Anzahl FFS-Sessions“, „Dauer Skill Test“) über die Kerndaten-Extrakte (N10.2) aller Dokumente vergleichen | TM 2 h, Appendix 4 h |
| **Wetterangaben (Szenarien)** | METAR-ähnliche Zeilen gegen ICAO-Format (Regex), Taupunkt ≤ Temperatur, Sicht/Wolken/Wettererscheinung plausibel (z. B. Sicht ≤ 5000 m ohne Wettererscheinung), Vertikalsicht-Kodierung | „15/4“ bei Nebel; VV200 bei 200 m Sicht |
| **Wiederholte Tokens** | Doppelte Wegpunkte/Wörter in Routings und Freitext | „RUPET RUPET“ |

- Alle Prüfungen sind Heuristiken; jeder Befund nennt die gerechneten Werte („Summe der Zeilen: 24:00; ausgewiesen: 16:00“).
- Abnahme: `SBX-CALC-01.docx` mit je einem Fehler pro Zeile der Tabelle wird vollständig erkannt; korrekte Tabellen erzeugen keine Meldung.

---

## 10. N7 – Verweise zwischen Dokumenten

- Erkannt werden Verweise der Form „TM 1.11.2“, „refer to TM … chapter 1.5“, „APX 5, Chapter 4“, „Annex 9“ vs. „Appendix 9“, „OMM 3.3.8“, „see 1.4.1.1“ sowie **Nummern aus Referenzlisten** (z. B. Übungsnummern „3.8.3.5“ aus einer Exercise Reference List).
- Auflösung:
  - Paketdokumente: gegen deren Überschriftenbaum bzw. deren Referenzlisten (Liste wird aus Tabellen mit Nummernspalte erkannt),
  - interne Master in der Bibliothek (N12, z. B. OMM): gegen deren Überschriftenbaum in der **aktiven Revision**,
  - nicht auflösbar, weil Zieldokument fehlt → `Not verifiable` mit Hinweis, welches Dokument fehlt.
- Zusätzlich: Ziel existiert, aber der **Titel passt nicht zum Kontext** (z. B. Verweis „Grading“ zeigt auf Kapitel „Standardisation“) → KI-Kurzprüfung, Ergebnis als „To verify“.
- Abnahme: `SBX-PKG-01` mit einem Verweis auf eine nicht existierende Übungsnummer, einem Verweis auf ein falsches Kapitel und einem Zirkelverweis (A → B → A ohne Inhalt) – alle drei werden gemeldet.

---

## 11. N8 – Prüfung der Regelwerksverweise

- Jede Regel-ID in Befunden **und** im Prüfdokument (Regex aus v1.1, z. B. `FCL.725(b)`, `AMC1 ORA.ATO.125`, `GM1 …`, `CS-FCD …`) wird gegen den Index der Regelwerks-Sammlung in der Bibliothek geprüft:
  - ID existiert → Absatzbuchstaben/-ziffern prüfen ((a), (b)(2) …),
  - ID existiert nicht oder Absatz fehlt → Verification „To verify“, Hinweis mit nächstliegender existierender ID,
  - Regelwerk nicht in der Bibliothek → „To verify – source not in library“.
- Befunde der KI mit nicht belegter Regel-ID dürfen nicht als „Verified“ erscheinen.
- Im Summary: Regelwerksstand (Ausgabe der Easy Access Rules in der Bibliothek) und Anzahl „To verify“.
- Abnahme: Synthetischer Regelwerksauszug `SBX-EAR-01`; eine erfundene ID und ein falscher Absatzbuchstabe werden als „To verify“ markiert, korrekte IDs als „Verified (rule-based)“.

---

## 12. N9 – Fremdsprachige Reste und erweiterte Platzhalter

- **Spracherkennung je Absatz** (lokale Bibliothek, z. B. Trigramm-Verfahren; Mindestlänge 3 Wörter). Absätze in einer anderen Sprache als der Dokumentsprache → Befund. Ausnahmen: als Zitat gekennzeichnet, Eigennamen, Adressen, Ortsnamen.
- Kurze Einschübe (1–2 Wörter) über eine Wortliste der Landessprache (z. B. „Normale“, „siehe“, „und“) im englischen Text → Befund Niedrig.
- **Platzhalter-Muster** zusätzlich zu v1.1 („TBD“, „XXX“, „[insert …]“):
  - `n{3,}` als Zahlplatzhalter in Kennungen (`AT-FFS-nnnn`, `S/N: FFS-nnn-nnn`),
  - `_XX`, `XX` am Wortende (`NEMAL_XX`),
  - `____` als Ausfüllfeld außerhalb von Formularen/Unterschriftsblöcken,
  - mit Textmarker hervorgehobene Kennungen (N4).
- Abnahme: `SBX-WORD-01` enthält einen landessprachigen Arbeitskommentar in einer Tabellenzelle, ein einzelnes landessprachiges Wort und drei Platzhalterformen – alle werden gefunden; eine Adresszeile mit landessprachigem Straßennamen nicht.

---

## 13. N10 – Konsolidierung großer Pakete

### 13.1 Parallelisierung
- Pakete werden in **Prüfgruppen** zerlegt (Standard: je Ebene-1-Dokument eine Gruppe; Appendix mit zugehörigen Annexes als eine Gruppe; Geschwistergruppen nie trennen).
- Jede Gruppe wird mit Zugriff auf das Ebene-1-Dokument geprüft (Hierarchieregel N1).
- Nebenläufigkeit und Backoff wie v1.1 Prüf-Engine.

### 13.2 Kerndaten-Extrakt
- Je Dokument extrahiert die Engine strukturierte Fakten in ein festes JSON-Schema: Stunden je Phase (TKI/WBT/CR/SIS/FSTD/Tests), Session-Liste mit Dauer, Codes, Gerätebezeichnung und Level, Pre-entry requirements, Prüfungen (Fragenanzahl, Bestehensgrenze), Funktionsbezeichnungen (Instructor/Examiner), Verweise auf andere Dokumente – jeweils mit Fundstelle.
- Der Extrakt ist Grundlage für N6 (paketweite Zahlen) und N7 und wird im Prüfstand gespeichert.
- Optional als Export „Package data sheet“ (Blatt im Excel).

### 13.3 Dubletten und Zuordnung
- Gleicher Sachverhalt aus mehreren Prüfgruppen → ein Befund beim Dokument der **tieferen Ebene** (bzw. Ebene 1, wenn es dort liegt), andere Dokumente unter „Other Affected Documents“.
- Restfundstellen eines Altbefunds (N3) werden nie als neuer Befund geführt.
- Gleicher Fehler in mehreren Geschwistern → ein Befund mit Liste der Fundstellen je Dokument.
- Nummerierung: fortlaufend; bei Re-Check im Anschluss an die höchste Nummer der Fremdliste.

### 13.4 Abnahme
- `SBX-PKG-01` geprüft in 3 Gruppen: Kein Sachverhalt erscheint doppelt; ein in zwei Annexes identischer Tippfehler ergibt einen Befund mit zwei Fundstellen.

---

## 14. N11 – Statuswerte und menschliche Freigabe

- v1.1 bleibt gültig (Status, Revision status, Verification, „Verworfen mit Begründung“). Ergänzt wird:
  - Verification **`Not verifiable – source missing`** (z. B. referenziertes internes Dokument nicht in der Bibliothek). Erscheint im Summary separat.
  - Revision status **`Closed – justification required`** für nicht umgesetzte Empfehlungen („evtl.“), bis eine Begründung eingetragen ist.
- **Grundsatz aus v1.1 bleibt:** DocCheck schließt keinen Befund selbst. Jeder Statuswechsel aus Re-Check oder Revisionsprüfung ist ein **Statusvorschlag**:
  - Anzeige mit Nachweis (Zitat/Seite) neben dem bisherigen Status,
  - Einzelbestätigung oder Sammelbestätigung („alle `Resolved` mit Nachweis bestätigen“),
  - jede Bestätigung mit Nutzer und Zeitpunkt im Audit-Log; im Export Spalte „Confirmed by / on“.
- **Werte-Mapping für Fremdlisten:** DocCheck-Status ↔ Werte der Fremdliste (z. B. `Resolved` → „Completed“, offen → „In Review“) wird im Listenprofil (N3.1) gespeichert.

---

## 15. N12 – Neue Bibliothekstypen

- `DocCheckDokTyp` (`src/modules/doccheck/types.ts`) erweitern um:

| Typ | Inhalt | `rechtscharakter` |
|---|---|---|
| `OSD` | Operational Suitability Data Flight Crew inkl. ODR-/MDR-Tabellen, TASE, Training-/Checking-Level | `oem` (verbindlich über Part-ORA/Part-FCL) |
| `CS` | Certification Specifications, z. B. CS-FCD, CS-FSTD | `amc` (Einstufung bei Umsetzung fachlich bestätigen lassen) |
| `INTERNAL_MANUAL` | Eigene genehmigte Handbücher der ATO (OM/OMM, CMM) als **interne Master** für Verweise und Prüfungen | `intern` |

- Interne Master folgen denselben Regeln wie OEM-Dokumente (Revision, Archiv, Revisionserinnerung).
- Für die Prüfung eines Training-Manual-Pakets einer FSTD-ATO soll die Sammlung mindestens enthalten: Part-FCL inkl. Appendix 9 mit AMC/GM, Part-ORA (ORA.GEN, ORA.ATO, ORA.FSTD) mit AMC/GM, das OSD des Musters, CS-FCD, die aktuelle OMM.
- Abnahme: Ein Verweis „OMM 3.3.8“ wird gegen die interne OMM aufgelöst; nach Hochladen einer neuen OMM-Revision erzeugt der Impact-Check (v1.1) Nachprüf-Empfehlungen für alle Paketdokumente, die auf geänderte OMM-Kapitel verweisen.

---

## 16. Datenmodell-Ergänzungen (Supabase, Schema `doccheck`)

| Tabelle / Feld | Zweck |
|---|---|
| `packages` (id, name, revision, created_by, created_at) | Dokumentpaket (N1) |
| `package_documents` (package_id, document_id, kuerzel, ebene, sibling_group) | Ebene und Geschwistergruppe |
| `list_profiles` (id, name, sheet, column_map jsonb, status_map jsonb, created_by) | Listenprofile für Fremdlisten (N3, N11) |
| `recheck_runs` (id, package_id, list_profile_id, source_file_hash, run_id, created_by) | Re-Check-Läufe, Verknüpfung mit `review_runs` |
| `finding_proposals` (run_id, finding_ref, proposed_status, evidence jsonb, remark, confirmed_by, confirmed_at) | Statusvorschläge und Bestätigung (N11) |
| `review_runs.page_source` (`pdf_pair` · `toc_mapping` · `approx`) | Herkunft der Seitenangaben (N5) |

- RLS wie v1.1: Nutzer sehen eigene Läufe und freigegebene Pakete; Listenprofile können DocCheck-Admins für alle freigeben.
- Fremdlisten und Paketdokumente sind **Sitzungs- bzw. Prüfdokumente**, keine Bibliotheksdokumente.

---

## 17. Feature-Schalter (v1.1 Kap. 13.2)

`DocCheckFeature` erweitern um: `recheck`, `packageCheck`, `wordCheck`, `calcCheck`, `pdfPairing`. Alle ab Werk **an**, außer `recheck` (an nach Abnahme N3).

---

## 18. UI-Ergänzungen

- **Tab „Prüfen“:** Umschalter „Einzeldokument | Paket“; Paketansicht als Baum nach Ebenen, Geschwistergruppen als Klammer; Hinweis „Word-PDF fehlt“ je DOCX mit Schaltfläche „PDF dazulegen“.
- **Neuer Tab „Re-Check“** (Desktop): Import → Spaltenzuordnung → Dokumentzuordnung → Lauf → **Vorschlagstabelle** (Alt-Status, Team-Status, Vorschlag, Nachweis, Remark) → Bestätigung → Rückschreiben/Export.
- **Summary:** Block „Submission gate“ (N4) und Block „Package overview“ (Edition/Revision/Datum je Dokument, N1).
- **Mobil (v1.1 Kap. „Mobiler Ansichtsmodus“):** Re-Check-Ergebnisse ansehen und Vorschläge bestätigen; Re-Check starten nur am Desktop.

---

## 19. Phasenzuordnung (Ergänzung zu v1.1 Kap. 18)

| Phase (v1.1) | Zusätzlicher Inhalt | Zusätzliche Abnahme |
|---|---|---|
| 2 – Parser | DOCX-Run-Eigenschaften (Farbe, Schattierung inkl. Tabellenformatvorlagen, Textmarker, Sprache, `noProof`, `vanish`), alle Kopf-/Fußzeilen je Abschnitt, `docProps`, TOC-Feldergebnisse; Word-PDF-Paarung (N5) | `SBX-PAGE-01` (N5.3); Run-Eigenschaften von `SBX-WORD-01` vollständig im Extract |
| 3 – Bibliothek | Typen `OSD`, `CS`, `INTERNAL_MANUAL` (N12) | N12-Abnahme |
| 5 – Verifikation/Konsolidierung | N8, N10, N11 | N8-, N10-Abnahme; Sammelbestätigung im Audit-Log |
| 6 – Exporte | Rückschreiben in Fremdlisten (N3.5), Blatt „Package data sheet“ | Round-Trip-Test `SBX-FL-01` |
| 8 – Formalprüfung/Konsistenz | N1, N2 (Gruppenabgleich), N4, N6, N7, N9 | Abnahmen N1, N2, N4, N6, N7, N9 |
| 9 – Revisionsprüfung | N3 (Import, Nachprüfung, Restfundstellen), Fix-Propagation (N2) | N3-Gesamtabnahme; Fix-Propagation an `SBX-PKG-01` |

---

## 20. Tests und Benchmark

- **Unit:** Zeit-Parser und -Arithmetik (N6), Wirksamer-Hintergrund-Auflösung inkl. Tabellenformatvorlagen (N4), Kontrastberechnung, Spracherkennung mit Ausnahmen (N9), Verweis-Regex und Auflösung (N7), Regel-ID-Absatzprüfung (N8), Spaltenzuordnungs-Heuristik (N3), XML-Patch-Funktionen (N3.5) mit Vorher/Nachher-Vergleich unveränderter Teile, TOC-Seitenabbildung (N5).
- **Synthetische Testdateien** (im Repo, Präfix `SBX-`): `SBX-PKG-01` (Paket mit eingebauten Fehlern), `SBX-FL-01.xlsx` (Fremdliste), `SBX-WORD-01.docx`, `SBX-PAGE-01.docx/.pdf`, `SBX-CALC-01.docx`, `SBX-EAR-01` (Regelwerksauszug). Inhalte frei erfunden, keine echten Musterdaten.
- **Qualitäts-Regressionstest (v1.1):** um einen Re-Check-Fall erweitern (`SBX-PKG-01` R0.0 → R0.1 mit `SBX-FL-01`); Kennzahlen: Trefferquote Statusvorschläge, Restfundstellen gefunden, Fehlalarme Word-Check.
- **Privater Benchmark (optional, nicht im Repo):** Das reale Manualpaket aus dem Anlassfall mit der Findingliste und dem Re-Check-Ergebnis als Referenz. Ablage nur in der Supabase-Bibliothek mit Zugriff Superadmin; Freigabe durch den Superadmin erforderlich (v1.1 offene Punkte).

---

## 21. Offene Punkte für den Superadmin

1. **Vorziehen des Word-Checks (N4):** N4, N5 und N9 sind regelbasiert und unabhängig von KI und Backend. Sollen sie als eigene Phase direkt nach Phase 2 (Parser) umgesetzt werden, damit das Einreichungs-Gate früh nutzbar ist?
2. **Gate-Regel (N4.3):** Soll ein offener Hoch-Befund aus dem Word-Check den Export mit „einreichungsfähig“ sperren oder nur warnen?
3. **Sprache der Remarks (N3.2):** Standard Deutsch mit englischen Korrekturvorschlägen (wie im Anlassfall) oder Englisch?
4. **Listen erlaubter Unterschiede (N2.2):** Erstbefüllung für die Gruppen MP/SP und Varianten durch den Superadmin.
5. **Bibliothek (N12):** Freigabe, die aktuelle OMM und das OSD des Musters als Bibliotheksdokumente aufzunehmen (Vertraulichkeit wie bei OEM-Unterlagen klären).
6. **Repo-Sichtbarkeit:** Das InstructorConnect-Repository ist **öffentlich**. Spezifikationen, Testdaten und Changelog dürfen daher keine internen Befundtexte, Personennamen oder vertraulichen Dokumentinhalte enthalten. Prüfen, ob das Repo auf „privat“ umgestellt werden soll.
