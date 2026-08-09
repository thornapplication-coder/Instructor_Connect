/**
 * Instructor-Connect-Logo als SVG-Nachbildung der Bildmarke:
 * offener Kreis, Jet nach rechts, drei Speed-Stripes als Tragfläche.
 * Navy folgt der Textfarbe des Themes (dunkel im Hellmodus, hell im
 * Dunkelmodus), der blaue Stripe dem Akzentton — dadurch wirkt das Logo
 * auf jedem Hintergrund und im Druck korrekt.
 */
export function LogoMark({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="Instructor Connect" role="img">
      {/* offener Kreis: Lücken links und rechts auf Höhe der Flugachse */}
      <circle
        cx="58"
        cy="50"
        r="35"
        stroke="rgb(var(--c-ink))"
        strokeWidth="7"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray="36 14"
        strokeDashoffset="-7"
      />
      {/* Speed-Stripes (Tragfläche): blau, grau, hellgrau */}
      <path d="M10 31 H58 L53 38.5 H4 Z" fill="rgb(var(--c-accent))" />
      <path d="M15 42.5 H52 L48 50 H10 Z" fill="#97A5B4" />
      <path d="M20 54 H47 L43 61.5 H16 Z" fill="#CBD4DE" />
      {/* Jet nach rechts */}
      <g fill="rgb(var(--c-ink))">
        <path d="M92 47.5 C92 44 86 42 78 42 L34 42 L34 53 L78 53 C86 53 92 51 92 47.5 Z" />
        <path d="M60 42 L46 26 L38 26 L50 42 Z" />
        <path d="M60 53 L46 69 L38 69 L50 53 Z" />
        <path d="M40 42 L30 30 L24 30 L32 42 Z" />
      </g>
    </svg>
  )
}

/** Wort-Bild-Marke für Seitenenden: Bildmarke + INSTRUCTOR / CONNECT + Claim */
export function LogoFull({ size = 64, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <div className="text-center leading-none">
        <p className="text-[17px] font-bold tracking-[0.32em] text-ink">INSTRUCTOR</p>
        <div className="mt-1.5 flex items-center justify-center gap-2.5">
          <span className="h-px w-7 bg-dim/50" />
          <p className="text-[13px] font-semibold tracking-[0.42em] text-accent">CONNECT</p>
          <span className="h-px w-7 bg-dim/50" />
        </div>
        <p className="mt-2 text-[8px] font-medium tracking-[0.28em] text-dim">CONNECT. GRADE. INFORM. EXCEL.</p>
      </div>
    </div>
  )
}
