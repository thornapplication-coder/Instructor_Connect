#!/usr/bin/env python3
"""Excel-Vorlage für den Benutzer-Massenimport bauen.

    python3 scripts/benutzer-vorlage.py

Warum ein Generator und keine von Hand gepflegte Datei: Die Spalten stehen
zweimal — in `IMPORT_COLUMNS` (src/userImport.ts, daraus entsteht die
CSV-Vorlage) und in der Excel-Datei. Zwei Prüfungen für dieselbe Sache laufen
auseinander; hier waren es zwei Quellen für dieselben Spalten. Dieses Skript
liest die Spalten und die Musterliste aus dem Quelltext und baut die Datei
daraus, statt sie zu wiederholen. Wer eine Spalte ändert, führt es erneut aus.

Braucht `openpyxl` (nur zum Bauen — die App selbst liest kein Excel, siehe
den Kommentar in src/userImport.ts).

Die Datei geht an Personalabteilungen. Sie steht deshalb in richtiger
Rechtschreibung (ä/ö/ü/ß — vorher 28 Umschreibungen wie „fuer“ und
„Pruefen“), druckt quer auf Seitenbreite statt auf neun zerschnittenen
Seiten und trägt einen Titel in den Eigenschaften (Audit 11/2026, VERW-08,
TPL-01, EXM-06, EXM-03). Jeder Lauf ergibt bei gleichem Quelltext dieselben
Bytes (siehe `speichern`).
"""
import io
import re
import sys
import zipfile
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.writer.excel import ExcelWriter

WURZEL = Path(__file__).resolve().parent.parent
ZIEL = WURZEL / 'public' / 'Instructor-Connect-Benutzer-Vorlage.xlsx'

TINTE = '1F3864'
GRAU = '7F7F7F'
HELLGRAU = 'EEEEEE'
SCHRIFT = 'Arial'


def _liste_aus_quelle(datei: Path, muster: str) -> list[str]:
    """Ein String-Array aus dem TypeScript-Quelltext ziehen."""
    text = datei.read_text(encoding='utf-8')
    treffer = re.search(muster, text, re.S)
    if not treffer:
        sys.exit(f'FEHLER: {muster!r} nicht gefunden in {datei}')
    return re.findall(r"'([^']+)'", treffer.group(1))


SPALTEN = _liste_aus_quelle(WURZEL / 'src' / 'userImport.ts', r'IMPORT_COLUMNS = \[(.*?)\] as const')
MUSTER = _liste_aus_quelle(WURZEL / 'src' / 'sandbox' / 'seed.ts', r'\n      aircraftTypes: \[([^\]]*)\],')
# Die Beispielzeilen stehen auf einer reservierten Domain, die der Import als
# Beispiel erkennt und überspringt. Vorher standen sie auf der echten Domain
# der ATO, und wer der Anleitung folgte („dürfen stehen bleiben“), legte zwei
# fiktive Konten an (Audit 11/2026, VERW-06). Der Wert kommt aus derselben
# Quelle wie die Prüfung.
BEISPIEL_DOMAIN = (_liste_aus_quelle(WURZEL / 'src' / 'userImport.ts', r'BEISPIEL_DOMAIN = (\'[^\']+\')') or [''])[0]

# Die Musterliste ist im Admin-Panel änderbar. Die Datei kann deshalb nur den
# Auslieferungsstand zeigen — darauf weist das Blatt „Muster“ ausdrücklich hin,
# sonst trägt jemand ein Muster ein, das seine ATO gar nicht führt.
if not MUSTER:
    sys.exit('FEHLER: Musterliste aus seed.ts ist leer')
if not BEISPIEL_DOMAIN.endswith('.invalid'):
    sys.exit('FEHLER: BEISPIEL_DOMAIN aus userImport.ts fehlt oder ist keine .invalid-Domain')

ROLLEN = ['superadmin', 'admin', 'training admin', 'member']

# Begriffe wie in der App (src/i18n/de.json): Wer in der Anleitung „Erlaubte
# Domains“ liest, findet in den Einstellungen „Erlaubte Login-Domains“ und
# sucht. userTemplate.test.ts prüft den Wortlaut gegen de.json.
EINSTELLUNG_DOMAINS = 'Erlaubte Login-Domains'

# Spaltenbeschreibungen. Der Text zur Musterspalte ist der Grund für diese
# Fassung: Vorher stand dort „Leer = keines“ — seit die Sichtbarkeit am Muster
# hängt, wäre ein Mitglied ohne Muster für nichts zuständig und sähe
# weder Lesson Plan noch Info noch Chat.
SPALTEN_TEXT = {
    'Name': 'Vor- und Nachname. Pflichtfeld.',
    'Email': 'Anmeldeadresse. Pflichtfeld, muss eine freigegebene Domain haben.',
    # „0043“ wie in den Beispielzeilen: Ein führendes „+“ liest Excel beim
    # Tippen als Beginn einer Formel (TPL-02).
    'Phone': 'Optional, beliebiges Format. Am besten „0043 …“ statt „+43 …“ – ein führendes „+“ liest Excel als Beginn einer Formel.',
    'Role': f'{" | ".join(ROLLEN)}. Pflichtfeld.',
    'AircraftTypes': (
        'Muster, mehrere mit Semikolon: CL30; C560 XLS+. '
        'PFLICHT für member und admin — davon hängt ab, was sie sehen. '
        'Bei superadmin und training admin darf die Zelle leer bleiben: '
        'Diese beiden sehen ohnehin alles. Schreibweise siehe Blatt „Muster“.'
    ),
    # Beide wirken nur bei member: Bei admin und training admin entscheidet
    # die Rollen-Matrix im Admin-Panel, der superadmin darf ohnehin alles.
    # Vorher stand das nirgends, und wer „nein“ eintrug, glaubte das Recht
    # entzogen zu haben (Audit 11/2026, VERW-02).
    'CanGrade': 'Darf Grading-Formulare ausfüllen. ja/nein. Wirkt nur bei member – bei admin und training admin regelt das die Rollen-Matrix.',
    'IsTrainee': 'Steht in den Grading-Formularen zur Auswahl als Trainee. ja/nein.',
    'CanEditDirectory': 'Darf das Verzeichnis „Who to call“ bearbeiten. ja/nein. Wirkt nur bei member – bei admin und training admin regelt das die Rollen-Matrix.',
    'Active': 'Anmelden kann sich nur, wer hier ja stehen hat.',
}

ROLLEN_TEXT = {
    'superadmin': 'Vollzugriff inklusive Rechte-Matrix, Einstellungen und endgültigem Löschen. Sieht alle Muster.',
    'admin': 'In der App „Admin“: Formulare, Instructor Info, Lesson Plans und Chats verwalten — für die eigenen Muster.',
    'training admin': 'Lesender Zugriff auf die Formularablage samt Download, im Umfang der Rollen-Matrix. Sieht alle Muster.',
    'member': 'In der App „Mitglied“ (Instruktor): eigene Formulare, Chats, Info, Notizen — für die eigenen Muster.',
}


def _titel(ws, zelle, text, groesse=14):
    ws[zelle] = text
    ws[zelle].font = Font(name=SCHRIFT, size=groesse, bold=True, color=TINTE)


def _zeile(ws, r, links, rechts):
    # Oben ausgerichtet wie der Text daneben — sonst stand die Beschriftung
    # einer zweizeiligen Erklärung unten neben deren letzter Zeile.
    k = ws.cell(r, 2, links)
    k.font = Font(name=SCHRIFT, size=10, bold=True)
    k.alignment = Alignment(vertical='top')
    z = ws.cell(r, 3, rechts)
    z.font = Font(name=SCHRIFT, size=10)
    z.alignment = Alignment(wrap_text=True, vertical='top')


def _druck(ws, titelzeilen=None):
    """A4 quer, auf Seitenbreite verkleinert, beliebig viele Seiten hoch.

    Ohne Druckeinrichtung zerfiel die Anleitung auf neun Seiten — Seite 1
    zeigte nur Spalte B mit „Instructor Connect —“, Seite 2 nur das Wort
    „member“ (VERW-08, TPL-01). `fitToHeight = 0` heißt: so viele Seiten
    hoch wie nötig, die Breite aber immer eine Seite.
    """
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_options.horizontalCentered = True
    ws.oddFooter.center.text = '&A – Seite &P von &N'
    if titelzeilen:
        ws.print_title_rows = titelzeilen


def blatt_anleitung(wb):
    ws = wb.create_sheet('Anleitung')
    ws.sheet_view.showGridLines = False
    for spalte, breite in (('A', 4), ('B', 26), ('C', 88)):
        ws.column_dimensions[spalte].width = breite

    _titel(ws, 'B2', 'Instructor Connect — Benutzer anlegen')
    ws['B3'] = 'Vorlage für den Massenimport im Admin-Panel'
    ws['B3'].font = Font(name=SCHRIFT, size=10, color=GRAU)

    r = 5
    for links, rechts in (
        ('1. Ausfüllen', f'Im Blatt „Benutzer“ ab Zeile 4 eintragen — eine Person je Zeile. Die beiden grauen Beispielzeilen (2 und 3) zeigen das Format. Ihre Adressen enden auf @{BEISPIEL_DOMAIN}: Der Import erkennt sie daran und überspringt sie. Sie dürfen also stehen bleiben oder gelöscht werden.'),
        ('2. Speichern', 'Datei → Speichern unter → Dateityp „CSV UTF-8 (durch Trennzeichen getrennt) (*.csv)“. Wichtig: UTF-8, sonst werden Umlaute falsch.'),
        ('3. Hochladen', 'In der App: Admin Panel → Benutzer → „Benutzer importieren“ → Datei wählen. Dort auch die Gruppen wählen, in die die neuen Personen kommen.'),
        ('4. Prüfen', 'Vor dem Anlegen zeigt die App jede Zeile mit Status. Angelegt werden nur die fehlerfreien Zeilen — die übrigen können in der Datei korrigiert und erneut hochgeladen werden.'),
    ):
        _zeile(ws, r, links, rechts)
        r += 1

    r += 1
    _titel(ws, f'B{r}', 'Muster (Aircraft Types)', 12)
    r += 1
    for links, rechts in (
        ('Warum das zählt', 'Das Muster entscheidet, was eine Person inhaltlich sieht: Lesson Plans, Instructor Info und Chats. Wer keinem Muster zugeordnet ist, sieht davon nichts.'),
        ('Pflicht für', 'member und admin. Eine solche Zeile ohne Muster weist der Import ab — sie ergäbe ein Konto, das für nichts zuständig ist.'),
        ('Frei für', 'superadmin und training admin. Beide sehen alle Muster, unabhängig von der Zelle; eine Eintragung ändert daran nichts.'),
        ('Mehrere', 'Mit Semikolon trennen: CL30; C560 XLS+. Kein Schrägstrich — Musterkennungen enthalten selbst welche („ATR 42/72“).'),
        ('Schreibweise', 'Muss der Liste im Blatt „Muster“ entsprechen. Unbekannte Muster halten die Zeile nicht auf, werden aber verworfen und sind danach im Admin-Panel nachzutragen.'),
        ('Nicht betroffen', 'Formularablage, Statistik und Behördenexport folgen der Rolle, nicht dem Muster — die Aufbewahrungspflicht gilt für den ganzen Bestand.'),
    ):
        _zeile(ws, r, links, rechts)
        r += 1

    r += 1
    _titel(ws, f'B{r}', 'Anmeldung', 12)
    r += 1
    for links, rechts in (
        ('Kein Passwort', 'Angemeldet wird sich mit der E-Mail-Adresse und einem 6-stelligen Code. Es gibt deshalb keine Passwortspalte — die Adresse ist die Anmeldung.'),
        ('Domain', f'Die Domain der Adresse muss im Admin-Panel unter Einstellungen → {EINSTELLUNG_DOMAINS} stehen. Sonst kann sich die Person nie anmelden, und der Import weist die Zeile ab.'),
        ('Aktiv', 'Nur Personen mit Active = ja können sich anmelden. So legt man jemanden im Voraus an, ohne ihn schon freizuschalten.'),
    ):
        _zeile(ws, r, links, rechts)
        r += 1

    r += 1
    _titel(ws, f'B{r}', 'Spalten', 12)
    r += 1
    for spalte in SPALTEN:
        _zeile(ws, r, spalte, SPALTEN_TEXT[spalte])
        r += 1

    r += 1
    _titel(ws, f'B{r}', 'Rollen', 12)
    r += 1
    for rolle in ROLLEN:
        _zeile(ws, r, rolle, ROLLEN_TEXT[rolle])
        r += 1
    _druck(ws)
    return ws


def blatt_muster(wb):
    """Die gültigen Musterkennungen zum Abschreiben — und als Auswahlliste."""
    ws = wb.create_sheet('Muster')
    ws.sheet_view.showGridLines = False
    ws.column_dimensions['A'].width = 22
    ws.column_dimensions['B'].width = 88

    _titel(ws, 'A1', 'Gültige Muster')
    hinweis = ws['A2']
    hinweis.value = (
        'Stand der Auslieferung. Die Liste ist im Admin-Panel unter Einstellungen änderbar — '
        'für die eigene ATO gilt die dortige Liste, nicht diese. Schreibweise genau übernehmen; '
        'Groß- und Kleinschreibung ist dabei egal.'
    )
    hinweis.font = Font(name=SCHRIFT, size=10, color=GRAU)
    hinweis.alignment = Alignment(wrap_text=True, vertical='top')
    ws.merge_cells('A2:B2')
    ws.row_dimensions[2].height = 30

    for i, muster in enumerate(MUSTER, start=4):
        z = ws.cell(i, 1, muster)
        z.font = Font(name=SCHRIFT, size=10)
    _druck(ws)
    return ws


def blatt_benutzer(wb):
    ws = wb.create_sheet('Benutzer')
    ws.freeze_panes = 'A2'
    breiten = {'Name': 26, 'Email': 34, 'Phone': 20, 'Role': 16, 'AircraftTypes': 26}
    for i, spalte in enumerate(SPALTEN, start=1):
        z = ws.cell(1, i, spalte)
        z.font = Font(name=SCHRIFT, size=11, bold=True, color=TINTE)
        ws.column_dimensions[z.column_letter].width = breiten.get(spalte, 12 if len(spalte) < 12 else 18)

    zwei = '; '.join(MUSTER[:2]) if len(MUSTER) >= 2 else (MUSTER[0] if MUSTER else '')
    # Telefon mit „0043“: dieselben Werte wie in der CSV-Vorlage
    # (buildImportTemplate), wo ein führendes „+“ ein sichtbares Hochkomma
    # bekam (TPL-02).
    beispiele = [
        ['Max Beispiel', f'max.beispiel@{BEISPIEL_DOMAIN}', '0043 664 1234567', 'member', zwei, 'ja', 'nein', 'nein', 'ja'],
        ['Erika Beispiel', f'erika.beispiel@{BEISPIEL_DOMAIN}', '0043 664 7654321', 'admin', MUSTER[0] if MUSTER else '', 'ja', 'nein', 'ja', 'ja'],
    ]
    for r, werte in enumerate(beispiele, start=2):
        for c, wert in enumerate(werte, start=1):
            z = ws.cell(r, c, wert)
            z.font = Font(name=SCHRIFT, size=10, color=GRAU)
            z.fill = PatternFill('solid', fgColor=HELLGRAU)

    letzte = 203
    dv_rolle = DataValidation(type='list', formula1=f'"{",".join(ROLLEN)}"', allow_blank=True)
    dv_ja = DataValidation(type='list', formula1='"ja,nein"', allow_blank=True)
    ws.add_data_validation(dv_rolle)
    ws.add_data_validation(dv_ja)
    for i, spalte in enumerate(SPALTEN, start=1):
        buchstabe = ws.cell(1, i).column_letter
        if spalte == 'Role':
            dv_rolle.add(f'{buchstabe}2:{buchstabe}{letzte}')
        elif spalte in ('CanGrade', 'IsTrainee', 'CanEditDirectory', 'Active'):
            dv_ja.add(f'{buchstabe}2:{buchstabe}{letzte}')
        elif spalte == 'AircraftTypes':
            # Bewusst KEINE Auswahlliste: Excel lässt je Zelle nur einen
            # Listeneintrag zu, die Zuordnung ist aber eine Mehrfachauswahl.
            # Eine Liste hätte hier also genau das verboten, was die Spalte
            # können muss. Stattdessen ein Hinweis, der beim Anklicken steht.
            # Ohne `type`: keine Prüfung, nur der Sprechblasen-Hinweis beim
            # Anklicken. Eine `custom`-Regel mit Formel TRUE täte dasselbe,
            # trägt aber eine Formel in die Datei, die nichts prüfen soll.
            dv_muster = DataValidation(
                allow_blank=True,
                showInputMessage=True, showErrorMessage=False,
                promptTitle='Muster', prompt=(
                    'Mehrere mit Semikolon trennen: CL30; C560 XLS+\n'
                    'Pflicht für member und admin.\n'
                    'Gültige Kennungen im Blatt „Muster“.'
                ),
            )
            ws.add_data_validation(dv_muster)
            dv_muster.add(f'{buchstabe}2:{buchstabe}{letzte}')
    # Kopfzeile auf jeder Druckseite: Wer 150 Zeilen druckt, sieht sonst ab
    # Seite 2 nicht mehr, welche Spalte was ist.
    _druck(ws, titelzeilen='1:1')
    return ws


# Fester Zeitstempel für Eigenschaften und ZIP-Einträge.
STAND = datetime(2026, 1, 1)


def speichern(wb, ziel: Path):
    """Schreiben, sodass gleicher Quelltext dieselben Bytes ergibt.

    openpyxl setzt beim Speichern `modified` auf die aktuelle Uhrzeit und
    stempelt jeden ZIP-Eintrag mit der Ortszeit — jeder Lauf ergab eine
    geänderte Datei, ohne dass sich am Inhalt etwas geändert hätte. Deshalb
    über ExcelWriter in den Speicher und von dort mit festem Datum neu
    packen. In app.xml trägt openpyxl „Microsoft Excel Compatible /
    Openpyxl …“ als Anwendung ein; die Datei nennt stattdessen die App, wie
    der DocCheck-Export (EXM-03).
    """
    puffer = io.BytesIO()
    with zipfile.ZipFile(puffer, 'w', zipfile.ZIP_DEFLATED) as roh:
        ExcelWriter(wb, roh).save()
    with zipfile.ZipFile(io.BytesIO(puffer.getvalue())) as quelle, zipfile.ZipFile(ziel, 'w', zipfile.ZIP_DEFLATED) as aus:
        for eintrag in quelle.infolist():
            daten = quelle.read(eintrag.filename)
            if eintrag.filename == 'docProps/app.xml':
                daten = re.sub(rb'<Application>[^<]*</Application>', b'<Application>Instructor Connect</Application>', daten)
                daten = re.sub(rb'<AppVersion>[^<]*</AppVersion>', b'', daten)
            neu = zipfile.ZipInfo(eintrag.filename, date_time=STAND.timetuple()[:6])
            neu.compress_type = zipfile.ZIP_DEFLATED
            neu.external_attr = 0o600 << 16
            aus.writestr(neu, daten)


def main():
    wb = Workbook()
    wb.remove(wb.active)
    # Eigenschaften, die Datei → Informationen und der Explorer zeigen.
    # Vorher stand dort nur der Ersteller (EXM-03).
    wb.properties.title = 'Instructor Connect – Benutzer-Vorlage'
    wb.properties.subject = 'Vorlage für den Benutzer-Massenimport im Admin-Panel'
    wb.properties.creator = 'Instructor Connect'
    wb.properties.lastModifiedBy = 'Instructor Connect'
    wb.properties.language = 'de-AT'
    wb.properties.created = wb.properties.modified = STAND
    blatt_anleitung(wb)
    blatt_benutzer(wb)
    blatt_muster(wb)
    wb.active = 0
    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    speichern(wb, ZIEL)
    print(f'geschrieben: {ZIEL.relative_to(WURZEL)}')
    print(f'  Spalten aus src/userImport.ts: {", ".join(SPALTEN)}')
    print(f'  Muster aus src/sandbox/seed.ts: {", ".join(MUSTER)}')
    print(f'  Beispiel-Domain aus src/userImport.ts: {BEISPIEL_DOMAIN}')


if __name__ == '__main__':
    main()
