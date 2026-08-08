import { useEffect, useState } from 'react'

/**
 * Desktop = breiter Bildschirm UND Mauszeiger. Die Pointer-Abfrage sorgt
 * dafür, dass ein iPad im Querformat (1180 px, aber Touch) nicht
 * fälschlich als Desktop gilt.
 */
const QUERY = '(min-width: 1024px) and (pointer: fine)'

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
