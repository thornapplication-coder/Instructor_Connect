/**
 * Tablet mit Eingabestift — Symbol des Grading Tools.
 * Bewusst als eigenes SVG statt Lucide-Icon, damit Tablet und Pencil
 * zusammen erkennbar sind.
 */
export function GradingIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Tablet */}
      <rect x="2.5" y="2.5" width="13" height="19" rx="2.2" />
      <line x1="7" y1="18.6" x2="11" y2="18.6" />
      {/* Eingabestift, diagonal über der rechten Kante */}
      <path d="M20.9 3.1a1.9 1.9 0 0 1 0 2.7l-8.2 8.2-3.1.9.9-3.1 8.2-8.2a1.9 1.9 0 0 1 2.2-.5z" />
      <line x1="18.4" y1="4.4" x2="20.3" y2="6.3" />
    </svg>
  )
}
