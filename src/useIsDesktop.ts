import { useEffect, useState } from 'react'

/**
 * Breiter Bildschirm — ab Tablet-Querformat. Die frühere Pointer-Abfrage
 * sperrte das Admin-Panel am iPad komplett aus: 1194 px Breite, aber Touch.
 * Wer unterwegs mit dem iPad arbeitet, kam damit an keine Verwaltung heran.
 * Am Handy bleibt der Hinweis, dort sind die Tabellen nicht bedienbar.
 */
const QUERY = '(min-width: 1024px)'

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}
