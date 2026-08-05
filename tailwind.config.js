/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
        sand: 'rgb(var(--c-sand) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
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
