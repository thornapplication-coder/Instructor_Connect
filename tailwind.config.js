/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Siehe den Kommentar bei fontFamily: Diese Skala ERSETZT den
    // Tailwind-Standard, deshalb steht sie ausserhalb von `extend`.
    fontSize: {
      fine: '9.5px', // nur im Druck: Fussnote, Notenlegende, Tabellenkopf
      micro: '12px', // Marken, Meta-Zeilen, Hinweise
      small: '13px', // Zweitzeilen, Filterleisten
      body: '14px', // Fliesstext
      lead: '15px', // Kartentitel, Eingabefelder
      head: '17px', // Karten- und Abschnittsueberschrift
      title: '20px', // Seitentitel
      display: '24px', // Titel eines Nachweisblatts
      hero: '30px', // Anmeldeseite
      mega: '36px', // Wortmarke
      giant: '48px', // Wortmarke ab Tablet
    },
    extend: {
      screens: {
        // Flaches Fenster (Handy im Querformat, ~390px hoch): der Kopfbereich
        // muss schrumpfen, sonst liegt keine einzige Kachel über der Falz.
        short: { raw: '(max-height: 520px)' },
      },
      colors: {
        // Alle Farbwerte kommen aus src/index.css (zentrale Theme-Datei).
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        dim: 'rgb(var(--c-dim) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        warm: 'rgb(var(--c-warm) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        // Rand von Eingabefeldern — eigener Ton je Theme, weil er 3:1 gegen
        // die Feldfüllung erreichen muss (WCAG 1.4.11).
        field: 'rgb(var(--c-field) / <alpha-value>)',
        sand: 'rgb(var(--c-sand) / <alpha-value>)',
        // Ampel- und Fokusfarben je Theme — im Hellmodus deutlich dunkler,
        // damit der Statuspunkt überhaupt sichtbar ist.
        ok: 'rgb(var(--c-ok) / <alpha-value>)',
        wait: 'rgb(var(--c-wait) / <alpha-value>)',
        bad: 'rgb(var(--c-bad) / <alpha-value>)',
        focus: 'rgb(var(--c-focus) / <alpha-value>)',
        // Schrift auf den Ampelflächen — wechselt mit dem Theme mit
        okInk: 'rgb(var(--c-ok-ink) / <alpha-value>)',
        waitInk: 'rgb(var(--c-wait-ink) / <alpha-value>)',
        badInk: 'rgb(var(--c-bad-ink) / <alpha-value>)',
      },
      /**
       * SCHRIFTSKALA — abgeschlossen, nicht erweiterbar per Einzelfall.
       *
       * Im Bestand standen 448 Groessenangaben als Einzelwerte im Markup:
       * 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 17, 19, 20 px, dazu die
       * Tailwind-Standardnamen. Vierzehn Stufen im Bereich von drei
       * Millimetern — Unterschiede, die niemand als Bedeutung liest,
       * sondern nur als Unruhe sieht. Jede neue Stelle erfand die naechste
       * Zwischenstufe dazu.
       *
       * Deshalb ersetzt diese Skala den Tailwind-Standard KOMPLETT (nicht
       * `extend`): `text-sm`, `text-xs` und Verwandte gibt es nicht mehr,
       * eine vergessene Stelle faellt damit auf. Sechs Textstufen fuer die
       * Oberflaeche, vier Anzeigestufen fuer Titel und Wortmarke, eine
       * Druckstufe fuer Fussnoten auf Papier.
       *
       * Ohne Zeilenhoehe: Die bestehenden `leading-*`-Klassen und die
       * geerbte Zeilenhoehe bleiben unangetastet, hier geht es nur um die
       * Groesse. src/designScale.test.ts bewacht, dass keine neue
       * Einzelangabe dazukommt.
       */
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      /**
       * ABSTANDSSTUFEN — vier statt acht.
       *
       * Senkrechte Stapel standen auf space-y-1, -1.5, -2, -2.5, -3, -3.5,
       * -4 und -5: acht Abstaende zwischen 4 und 20 px, oft zwei davon auf
       * derselben Seite. Vier Stufen reichen und ergeben einen Rhythmus,
       * den man wiedererkennt. Die Namen gelten fuer die ganze
       * Abstandsskala, also auch fuer `gap-` und `p-`.
       */
      spacing: {
        tight: '6px', // innerhalb eines Blocks (Zeilen einer Angabe)
        stack: '12px', // zwischen Karten einer Liste
        section: '20px', // zwischen Abschnitten einer Seite
        major: '32px', // zwischen den grossen Teilen einer Seite
      },
      borderRadius: {
        bubble: '1.25rem',
      },
      boxShadow: {
        soft: 'var(--sh-soft)',
        tile: 'var(--sh-tile)',
      },
    },
  },
  plugins: [],
}
