import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relativer Basispfad: dank Hash-Routing funktioniert die App unter jedem
// Unterpfad (GitHub Pages, Repo-Umbenennungen) ohne Anpassung.
// AC_BASE kann das bei Bedarf weiterhin überschreiben.
export default defineConfig({
  base: process.env.AC_BASE || './',
  plugins: [react()],
})
