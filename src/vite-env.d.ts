/// <reference types="vite/client" />

/**
 * tailwind.config.js ist reines JavaScript und bringt keine Typen mit.
 * src/designScale.test.ts liest die Skalen aber direkt aus der Konfiguration
 * — nur so kann der Test pruefen, was der Build tatsaechlich benutzt, statt
 * eine Kopie der Werte zu bewachen.
 */
declare module '*/tailwind.config.js' {
  const config: {
    theme: {
      fontSize: Record<string, string>
      extend: { spacing: Record<string, string> } & Record<string, unknown>
    }
  }
  export default config
}
