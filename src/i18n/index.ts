import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './de.json'
import en from './en.json'

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('aaa-lang') : null

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, de: { translation: de } },
  lng: stored || 'de',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem('aaa-lang', lng)
  } catch {
    /* Privates Surfen o. Ä. — Sprache gilt dann nur für die Sitzung */
  }
})

export default i18n
