import { useEffect, useState } from 'react'

// Der Browser stellt beim Zurückgehen sonst die alte Scrollposition wieder
// her und arbeitet damit gegen den Sprung an den Seitenanfang.
if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

/**
 * Jede Seite beginnt oben. Beim Hash-Routing wechselt nur der Inhalt, die
 * Scrollposition der vorherigen Seite blieb sonst stehen — man landete
 * mitten in einem Formular oder unterhalb einer kurzen Liste.
 *
 * Der Sprung passiert im hashchange-Handler, also BEVOR React die neue Seite
 * rendert. Damit bleibt eine Ansicht, die sich bewusst anders positioniert
 * (der Chatraum springt ans Ende), weiterhin Herr über ihre Scrollposition:
 * ihr Effekt läuft danach.
 */
export function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  // Manche Ansichten scrollen einen inneren Container statt des Fensters.
  document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

/** Mini-Hash-Router: funktioniert auch unter GitHub-Pages-Unterpfaden. */
export function useRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/')
  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash.slice(1) || '/'
      // Nur bei echtem Seitenwechsel — ein reiner Parameterwechsel innerhalb
      // derselben Ansicht (z. B. ?print=1) soll nicht springen.
      if (next.split('?')[0] !== route.split('?')[0]) scrollToTop()
      setRoute(next)
    }
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
