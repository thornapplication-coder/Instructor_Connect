#!/usr/bin/env bash
#
# Tägliche Sicherung der Instructor-Connect-Datenbank.
#
#   30 Tagessicherungen unter daily/, dazu am 1. jedes Monats eine
#   Monatssicherung unter monthly/, die dauerhaft erhalten bleibt.
#
# Erwartete Umgebung:
#   DATABASE_URL    Verbindungszeichenfolge (Leserechte auf allen Tabellen)
#   BACKUP_REMOTE   Ziel in rclone-Schreibweise, z. B. s3:ic-backups
#   TZ_LOCAL        Zeitzone der Akademie (Vorgabe Europe/Vienna)
#
# Voraussetzungen: postgresql-client (pg_dump, pg_restore) und rclone.
#
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL fehlt}"
: "${BACKUP_REMOTE:?BACKUP_REMOTE fehlt}"
TZ_LOCAL="${TZ_LOCAL:-Europe/Vienna}"
KEEP_DAILY_DAYS="${KEEP_DAILY_DAYS:-30}"

# Ortszeit bestimmen — der Zeitplan läuft in UTC, die Vorgabe lautet aber
# 03:00 Wiener Zeit. Siehe docs/backup.md, Abschnitt Sommerzeit.
local_hour=$(TZ="$TZ_LOCAL" date +%H)
local_day=$(TZ="$TZ_LOCAL" date +%d)
local_date=$(TZ="$TZ_LOCAL" date +%Y-%m-%d)
stamp=$(date -u +%Y-%m-%dT%H-%MZ)

if [[ "${FORCE:-0}" != "1" && "$local_hour" != "03" ]]; then
  echo "Es ist $local_hour Uhr in $TZ_LOCAL — die Sicherung läuft um 03:00. Nichts zu tun."
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
dump="$work/instructor-connect-$stamp.dump"

echo "==> Dump wird erstellt"
# custom format: komprimiert, erlaubt selektives Zurückspielen einzelner
# Tabellen. --no-owner/--no-privileges, damit sich der Stand auch in eine
# frisch angelegte Datenbank mit anderen Rollen einspielen lässt.
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$dump"

size=$(stat -c%s "$dump")
echo "==> Größe: $size Byte"
if [[ "$size" -lt 4096 ]]; then
  echo "FEHLER: Der Dump ist auffällig klein — vermutlich unvollständig." >&2
  exit 1
fi

# Eine Sicherung, die sich nicht lesen lässt, ist keine. Das
# Inhaltsverzeichnis zu ziehen erkennt Abbrüche und Beschädigungen sofort.
echo "==> Lesbarkeit wird geprüft"
tables=$(pg_restore --list "$dump" | grep -c 'TABLE DATA' || true)
echo "==> $tables Tabellen mit Daten enthalten"
if [[ "$tables" -lt 1 ]]; then
  echo "FEHLER: Der Dump enthält keine Tabellendaten." >&2
  exit 1
fi

sha256sum "$dump" | awk '{print $1}' > "$dump.sha256"

echo "==> Tagessicherung wird abgelegt"
rclone copyto "$dump"        "$BACKUP_REMOTE/daily/$stamp.dump"
rclone copyto "$dump.sha256" "$BACKUP_REMOTE/daily/$stamp.dump.sha256"

# Am Monatsersten zusätzlich als Monatssicherung. Bewusst eine zweite Datei
# statt einer Verschiebung: die Aufräumroutine unten fasst monthly/ nie an,
# damit ein Fehler dort die Langzeitsicherungen nicht löschen kann.
if [[ "$local_day" == "01" ]]; then
  echo "==> Monatsanfang — zusätzlich als Monatssicherung"
  rclone copyto "$dump"        "$BACKUP_REMOTE/monthly/$local_date.dump"
  rclone copyto "$dump.sha256" "$BACKUP_REMOTE/monthly/$local_date.dump.sha256"
fi

echo "==> Tagessicherungen älter als $KEEP_DAILY_DAYS Tage werden entfernt"
rclone delete "$BACKUP_REMOTE/daily" --min-age "${KEEP_DAILY_DAYS}d"

echo "==> Bestand"
echo "    Tagessicherungen:   $(rclone lsf "$BACKUP_REMOTE/daily"   --include '*.dump' | wc -l)"
echo "    Monatssicherungen:  $(rclone lsf "$BACKUP_REMOTE/monthly" --include '*.dump' | wc -l)"
echo "==> Fertig: $stamp"
