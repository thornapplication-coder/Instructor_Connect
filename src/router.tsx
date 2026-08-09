import { useEffect, useState } from 'react'

/** Mini-Hash-Router: funktioniert auch unter GitHub-Pages-Unterpfaden. */
export function useRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/')
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1) || '/')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [route])
  return route
}

/**
 * @param replace ersetzt den aktuellen Verlaufseintrag, statt einen neuen
 * anzulegen. Nach dem Absenden eines Formulars führt die Zurück-Taste sonst
 * auf dieselbe Adresse zurück und zeigt dort ein leeres Formular — mit der
 * Gefahr einer zweiten Erfassung.
 */
export function navigate(to: string, replace = false) {
  if (replace) {
    const url = `${window.location.pathname}${window.location.search}#${to}`
    window.history.replaceState(null, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    return
  }
  window.location.hash = to
}
