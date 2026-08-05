# Instructor Connect

Interne Kommunikations-App für Instruktoren (PWA).
Aktueller Stand: **Sandbox-Version** — komplett durchklickbar ohne Supabase,
Twilio oder Kosten.

## Module

- **Chat** — Gruppenchats mit Umfragen (Ja/Nein und Mehrfachauswahl), fetten
  Admin-Nachrichten, Anhängen (Sandbox-Attrappe) und Chat-Info-Ansicht inkl.
  Aufbewahrungsdauer.
- **Instructor Info** — dauerhafte Bibliothek (PDF- und Texteinträge, Suche).
- **Who to call** — Kontaktverzeichnis mit `tel:`- und `mailto:`-Links,
  gruppiert nach Abteilung.
- **Feedback** — Formular mit Gruppen-Mehrfachauswahl und Kategorien; nicht anonym.
- **Admin Panel** — nur Superadmin: Benutzer, Gruppen, globale Einstellungen,
  Impressum, Changelog.

## Sandbox-Modus

- Rollenwechsler (Superadmin / Admin / Mitglied) in der gelben Leiste unten
- iPhone/iPad-Gerätevorschau
- Zeitraffer (+1/+8/+31 Tage), um die automatische Löschung zu beobachten
- Daten-Reset; alle Daten liegen nur im Arbeitsspeicher
- Anmeldung akzeptiert jede Seed-Kennung (E-Mail oder Telefonnummer) und
  bleibt bis zum Abmelden bestehen

## Entwicklung

```bash
npm install
npm run dev     # Entwicklungsserver
npm run build   # Produktions-Build (relativer Basispfad, AC_BASE optional)
```

Sprache: Deutsch/Englisch über den DE/EN-Schalter (react-i18next).
Theme-Farben zentral in `src/index.css`. Hell/Dunkel-Modus umschaltbar.
