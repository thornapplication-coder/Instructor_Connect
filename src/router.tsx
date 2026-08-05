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

export function navigate(to: string) {
  window.location.hash = to
}
