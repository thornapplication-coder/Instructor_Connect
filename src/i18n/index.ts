import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './de.json'
import en from './en.json'
import forms from './forms.json'

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('aaa-lang') : null

i18n.use(initReactI18next).init({
  /*
   * Zwei Namensräume mit ABSICHT ungleicher Sprachabdeckung.
   *
   * `forms` trägt alles, was auf einem Grading-Formular, einem Bericht oder
   * im Behördenexport landet — und existiert NUR auf Englisch. Das ist keine
   * Lücke, sondern die Umsetzung der Regel „Grading-Formulare und der
   * Behördenexport sind immer englisch": Es gibt schlicht keine zweite
   * Fassung, die versehentlich gezogen werden könnte.
   *
   * Vorher hing das an Disziplin: Jede Ansicht musste `getFixedT('en')`
   * benutzen und die Sprache an ihre Unteransichten weiterreichen. Genau
   * das ging schief — der Verlauf je Pilot und der Monatsbericht standen im
   * Grading Tool auf Englisch, im Admin-Panel aber auf Deutsch, obwohl es
   * dieselben Berichte sind. Mit einem Namensraum ohne deutsche Fassung
   * kann das nicht mehr passieren, egal wer die Ansicht einbindet.
   */
  resources: { en: { translation: en, forms }, de: { translation: de } },
  ns: ['translation', 'forms'],
  defaultNS: 'translation',
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
