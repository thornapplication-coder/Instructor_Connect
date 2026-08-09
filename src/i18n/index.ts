import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './de.json'
import en from './en.json'

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('aaa-lang') : null

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, de: { translation: de } },
  // Standardsprache ist Englisch; eine bewusst gewählte Sprache bleibt gespeichert
  lng: stored || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

/** Sprachkennung des Dokuments mitführen — Vorleseprogramme und die
 *  Silbentrennung richten sich danach; sie stand dauerhaft auf „en". */
function applyLang(lng: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = lng
}
applyLang(i18n.language)

i18n.on('languageChanged', (lng) => {
  applyLang(lng)
  try {
    localStorage.setItem('aaa-lang', lng)
  } catch {
    /* Privates Surfen o. Ä. — Sprache gilt dann nur für die Sitzung */
  }
})

export default i18n
