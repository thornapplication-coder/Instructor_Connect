# Datensicherung

Diese Anforderung gilt, **sobald die Datenbank steht**. In der Sandbox gibt es
nichts zu sichern: der Zustand liegt im Browser des jeweiligen Geräts.

## Anforderung

| Punkt | Vorgabe |
|---|---|
| Zeitpunkt | täglich um **03:00 Europe/Vienna** |
| Kurzfristige Aufbewahrung | die **letzten 30 Tage** |
| Langfristige Aufbewahrung | die Sicherung vom **1. jedes Monats** bleibt dauerhaft erhalten |
| Umfang | vollständiger Datenbestand inklusive Formularen, Unterschriften und Anhängen |
| Prüfung | jede Sicherung wird nach dem Erstellen auf Lesbarkeit geprüft |

Ergebnis nach einem Jahr: 30 Tagessicherungen plus 12 Monatssicherungen. Nach
fünf Jahren: 30 plus 60. Der Platzbedarf wächst also linear und langsam.

## Warum nicht die Sicherung des Anbieters allein

Supabase legt auf dem Pro-Plan täglich eine Sicherung an und hält sie
standardmäßig **7 Tage** vor; Point-in-Time-Recovery ist ein Zusatz. Das deckt
weder die geforderten 30 Tage noch die Monatssicherung über Jahre ab. Die
Anbietersicherung bleibt als zweite Ebene sinnvoll, ersetzt diese hier aber
nicht — schon deshalb, weil eine Sicherung, die nur beim selben Anbieter liegt,
dessen Ausfall nicht übersteht.

## Zeitzone und Sommerzeit

`cron` in GitHub Actions und in `pg_cron` rechnet in UTC. 03:00 Wiener Zeit ist
im Winter 02:00 UTC und im Sommer 01:00 UTC. Ein fester UTC-Eintrag verschiebt
die Sicherung also halbjährlich um eine Stunde.

Die mitgelieferte Vorlage plant deshalb **beide** Zeiten ein und bricht ab,
wenn es in Wien nicht gerade 3 Uhr ist. Damit läuft die Sicherung ganzjährig
zur selben lokalen Zeit, ohne Sonderbehandlung an den Umstellungstagen.

## Ablage und Benennung

```
backups/
  daily/2026-08-09T03-00Z.dump      # 30 Tage, danach automatisch entfernt
  monthly/2026-08-01.dump           # bleibt dauerhaft
```

Am 1. jedes Monats entsteht dieselbe Sicherung zweimal: einmal unter `daily/`,
einmal unter `monthly/`. Die Aufräumroutine fasst `monthly/` niemals an — so
kann ein Fehler in der Aufbewahrungslogik die Langzeitsicherungen nicht
löschen.

## Datenschutz

Die Sicherungen enthalten personenbezogene Daten: Namen von Piloten und
Instruktoren, Bewertungen, Kommentare und Unterschriften. Daraus folgt:

- Verschlüsselung im Ruhezustand am Ablageort, Zugriff auf einen benannten
  Personenkreis beschränkt
- Ablage in der EU, getrennt vom Datenbankanbieter
- Die Aufbewahrungsfrist der Monatssicherungen muss zur Frist im OM passen —
  „dauerhaft" ist datenschutzrechtlich keine Frist. Bitte im OM festlegen und
  hier eintragen.
- Zugriffe auf Sicherungen werden protokolliert

## Wiederherstellung

Eine Sicherung, die nie zurückgespielt wurde, ist keine Sicherung. Verbindlich:

- Nach dem Erstellen prüft der Job das Inhaltsverzeichnis der Datei
  (`pg_restore --list`). Schlägt das fehl, gilt der Lauf als fehlgeschlagen.
- **Einmal im Quartal** wird eine Sicherung in eine leere Datenbank
  zurückgespielt und stichprobenartig geprüft: ein unterschriebenes Formular
  öffnen, Unterschriften und Noten vergleichen.
- Das Ergebnis wird mit Datum festgehalten.

## Umsetzung

Im Ordner `docs/backup/` liegen drei Vorlagen. Sie sind bewusst **nicht** unter
`.github/workflows/` abgelegt, damit nichts anläuft, bevor die Zugangsdaten
hinterlegt sind.

| Datei | Zweck |
|---|---|
| `backup.sh` | erstellt den Dump, prüft ihn, lädt ihn hoch und räumt auf |
| `github-actions-backup.yml` | Zeitplan über GitHub Actions — nach `.github/workflows/` kopieren, wenn die Zugangsdaten stehen |
| `supabase-pg_cron.sql` | Alternative: Zeitplan in der Datenbank selbst |

### Benötigte Zugangsdaten

| Name | Inhalt |
|---|---|
| `DATABASE_URL` | Verbindungszeichenfolge mit Leserechten auf allen Tabellen |
| `BACKUP_REMOTE` | Ziel der Ablage in rclone-Schreibweise, z. B. `s3:instructor-connect-backups` |
| `RCLONE_CONFIG_*` | Zugangsdaten des Ablageorts |

### Noch zu entscheiden

1. **Wo liegen die Sicherungen?** Objektspeicher in der EU (Hetzner, OVH,
   Scaleway, Wasabi) oder ein eigener Server der Akademie.
2. **Wer wird bei einem Fehlschlag benachrichtigt?** Ein stiller Fehlschlag ist
   schlimmer als keine Sicherung, weil man sich auf sie verlässt.
3. **Werden Datei-Anhänge mitgesichert?** Der Datenbank-Dump enthält sie nur,
   wenn sie in der Datenbank liegen. Liegen sie im Objektspeicher, braucht es
   dafür einen zweiten, gleich getakteten Lauf.
