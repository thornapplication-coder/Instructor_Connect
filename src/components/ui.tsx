import { ArrowLeft, Home as HomeIcon, Lock, Moon, Plus, Sun, X } from 'lucide-react'
import { Children, useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { vorhandenerEintrag } from '../einstellungen'
import { navigate } from '../router'

const THEME_KEY = 'aaa-theme'

/** Vor dem ersten Render aufrufen, damit es beim Laden nicht flackert.
 *  Standard ist der Hellmodus; nur eine bewusst gewählte dunkle
 *  Einstellung schaltet um. */
export function initTheme() {
  try {
    if (localStorage.getItem(THEME_KEY) === 'dark') {
      document.documentElement.dataset.theme = 'dark'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#161A21')
    }
  } catch {
    /* Ohne localStorage bleibt der Standard (hell) */
  }
}

export function ThemeToggle() {
  const { t } = useTranslation()
  const [light, setLight] = useState(() => document.documentElement.dataset.theme !== 'dark')
  const toggle = () => {
    const next = !light
    setLight(next)
    if (next) delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = 'dark'
    try {
      localStorage.setItem(THEME_KEY, next ? 'light' : 'dark')
    } catch {
      /* Auswahl gilt dann nur für diese Sitzung */
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next ? '#E4E7ED' : '#161A21')
  }
  return (
    <button
      onClick={toggle}
      aria-label={t('common.theme')}
      title={t('common.theme')}
      className="flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-ink"
    >
      {light ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  )
}

/** home=false unterdrückt den Home-Button — genutzt in den Grading-Forms,
 *  damit man dort nicht versehentlich aus dem Formular springt.
 *  wide=true nutzt am Desktop die volle Breite (Grading-Formulare). */
export function TopBar({
  title,
  back,
  right,
  home = true,
  wide = false,
  onBack,
}: {
  title: ReactNode
  back?: string
  right?: ReactNode
  home?: boolean
  wide?: boolean
  /** Rückfrage vor dem Verlassen; false verhindert die Navigation */
  onBack?: () => boolean
}) {
  const { t } = useTranslation()
  return (
    <header className="safe-top sticky top-0 z-20 border-b border-line/10 bg-bg/85 backdrop-blur">
      <div className={`mx-auto flex h-14 items-center gap-2 px-3 xl:px-8 ${wide ? 'max-w-5xl xl:max-w-7xl' : 'max-w-3xl xl:max-w-6xl'}`}>
        {back !== undefined && (
          <button
            onClick={() => {
              if (onBack && !onBack()) return
              navigate(back)
            }}
            aria-label={t('common.back')}
            className="-ml-1 flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-ink"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        {/* `data-page-heading` + `tabIndex -1`: Nach einem Seitenwechsel setzt
            der Router den Fokus hierher (siehe router.tsx). Ohne das fiel er
            auf <body> — Tastaturnutzer fingen wieder ganz oben an, und
            Sprachausgaben meldeten den Wechsel gar nicht. In der
            Tab-Reihenfolge taucht die Ueberschrift dadurch nicht auf. */}
        <h1 data-page-heading tabIndex={-1} className="min-w-0 flex-1 truncate text-head font-semibold tracking-tight outline-none">
          {title}
        </h1>
        {/* Der Titel gibt nach, die Aktion rechts nicht: Ein langer Titel
            drückte sonst „Upload lesson plan" zusammen, bis die globale
            Umbruchregel den Text mitten im Wort trennte. */}
        {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
        {home && (
          <button
            onClick={() => navigate('/')}
            aria-label="Home"
            title="Home"
            className="flex h-11 w-11 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-accent"
          >
            <HomeIcon size={19} />
          </button>
        )}
      </div>
    </header>
  )
}

/**
 * Seitenrahmen.
 *
 * Am Desktop lief der Inhalt vorher bis an beide Fensterraender
 * (`xl:max-w-none`). Auf einem 2560er Schirm hiess das: eine Formularzeile
 * 2500 px breit, ihr Inhalt in den ersten 400 px, die zugehoerigen Knoepfe
 * zwei Meter weiter rechts. Genutzt wurde die Breite damit nicht, nur
 * aufgespannt. Jetzt begrenzt der Rahmen auf 1152 px (breite Seiten:
 * 1280 px) — und die Breite wird dort, wo sie etwas traegt, ueber
 * `CardGrid` in zwei Spalten ausgefuellt statt in eine lange Zeile gezogen.
 */
export function Page({ children, className = '', wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <main className={`mx-auto w-full flex-1 px-4 pb-24 pt-4 xl:px-8 ${wide ? 'max-w-5xl xl:max-w-7xl' : 'max-w-3xl xl:max-w-6xl'} ${className}`}>{children}</main>
}

/**
 * Kartenliste, die am Desktop zweispaltig wird.
 *
 * Tritt an die Stelle des senkrechten Stapels ueberall dort, wo die Liste aus kompakten Karten
 * besteht (Notizen, Kontakte, Chats, Lehrplaene, Formularzeilen). Bis zum
 * Tablet bleibt es eine Spalte — die Karten brauchen die volle Breite.
 */
export function CardGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  // Eine einzelne Karte bleibt einspaltig. Sonst stuende neben ihr eine
  // leere Haelfte — die Breite waere wieder aufgespannt statt genutzt, und
  // genau das sollte das Raster abstellen.
  const einzeln = Children.count(children) < 2
  return <div className={`${einzeln ? 'space-y-stack' : 'grid grid-cols-1 gap-3 xl:grid-cols-2'} ${className}`}>{children}</div>
}

/**
 * ÜBERSCHRIFTEN — zwei Sorten, bewusst unterschiedlich laut.
 *
 * Gemeldet wurde eine Gliederungsüberschrift („ALL AIRCRAFT TYPES"), die
 * zwischen zwei weißen Karten praktisch verschwand: klein, `text-dim` auf
 * dem grauen Seitenhintergrund und ohne Abstand zur Karte darüber. Sie
 * markierte damit nichts — man sah nicht, wo eine Gruppe endet und die
 * nächste beginnt. Dasselbe Muster lag an rund vierzig Stellen im Code,
 * jedes Mal von Hand geschrieben und leicht abweichend.
 *
 * Deshalb hier EIN Paar Komponenten für die ganze App:
 *
 *  - `SectionHeading` gliedert die SEITE. Sie steht auf dem Hintergrund
 *    zwischen Karten, trägt eine Akzentmarke und eine feine Linie bis zum
 *    rechten Rand — damit ist auf einen Blick zu sehen, wo eine Gruppe
 *    anfängt, auch mitten im Scrollen.
 *  - `CardHeading` beschriftet den Inhalt EINER Karte. Sie ist ruhiger:
 *    Sie soll den Abschnitt benennen, nicht mit der Gliederung der Seite
 *    konkurrieren.
 *
 * Beide in `text-ink` statt `text-dim`: Eine Überschrift ist die Struktur
 * des Textes, nicht sein Kleingedrucktes.
 */
export function SectionHeading({
  children,
  icon,
  right,
  className = '',
  sticky = false,
}: {
  children: ReactNode
  /** kleines Symbol vor dem Titel (z. B. Muster, Ordner) */
  icon?: ReactNode
  /** Zusatz am rechten Rand, hinter der Linie (z. B. eine Anzahl) */
  right?: ReactNode
  className?: string
  /** bleibt beim Scrollen unter der Kopfzeile stehen (lange Listen) */
  sticky?: boolean
}) {
  return (
    <h2
      className={`flex items-center gap-2.5 text-micro font-bold uppercase tracking-[0.09em] text-ink ${
        sticky ? 'below-topbar sticky z-[5] -mx-1 bg-bg/90 px-1 py-2 backdrop-blur' : ''
      } ${className}`}
    >
      <span aria-hidden className="h-3.5 w-1 shrink-0 rounded-full bg-accent" />
      {icon}
      <span className="min-w-0 truncate">{children}</span>
      {/* Die Linie füllt den Rest der Zeile — sie trennt, ohne einen Kasten
          zu zeichnen, und macht die Gruppengrenze auch dann sichtbar, wenn
          der Titel kurz ist. */}
      <span aria-hidden className="h-px min-w-4 flex-1 bg-line/15" />
      {right}
    </h2>
  )
}

export function CardHeading({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`text-micro font-bold uppercase tracking-[0.08em] text-ink ${className}`}>{children}</h3>
}

/**
 * Eine klickbare Karte ist ein Bedienelement — sie braucht Rolle, Fokus und
 * Tastenbedienung. Vorher war sie ein nacktes <div onClick>: Die gemessene
 * Tab-Reihenfolge auf der Chat-Seite lautete Zurück → Gruppe anlegen →
 * Home → Sandbox-Leiste; keine einzige Gruppe war ohne Maus erreichbar.
 */
/**
 * Karte. Mit `onClick` wird sie als Ganzes anklickbar.
 *
 * `label` ist für Karten gedacht, die SELBST Knöpfe enthalten (Listenzeilen
 * mit Download- und Mülleimer-Knopf). Ein `role="button"` darf keine
 * weiteren Bedienelemente enthalten: Vorlesesoftware zieht den gesamten
 * Karteninhalt zum Namen des Knopfes zusammen, und die inneren Knöpfe sind
 * per Tastatur nicht mehr einzeln erreichbar — beim Formularblatt betraf
 * das ausgerechnet „PDF herunterladen" und „aus der Liste entfernen".
 *
 * Mit `label` liegt deshalb ein echter, unsichtbarer Knopf über der Karte
 * (mit genau diesem Namen), die inneren Knöpfe liegen darüber und behalten
 * ihre eigene Reihenfolge im Tabulator. Die Karte selbst bleibt ein
 * schlichtes div ohne ARIA-Rolle.
 */
export function Card({
  children,
  className = '',
  onClick,
  label,
  id,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  label?: string
  /** Sprungziel — z. B. fuer die Abschlussleiste des Grading-Formulars. */
  id?: string
}) {
  const optik = `rounded-2xl border border-line/[0.06] bg-surface/90 shadow-soft ${onClick ? 'cursor-pointer transition hover:border-accent/30 hover:bg-raised/70' : ''}`
  const base = `${optik} ${className}`

  if (onClick && label) {
    // `className` traegt hier die Anordnung (flex, Innenabstand) und gehoert
    // deshalb an den Inhalt, nicht an die aeussere Huelle — sonst waere der
    // ganze Inhalt EIN Flex-Element.
    return (
      <div id={id} className={`relative ${optik}`}>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="absolute inset-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
        {/* Der Inhalt selbst nimmt keine Klicks an — sie fallen auf den Knopf
            darunter. Einzelne Bedienelemente holen sich das mit
            `pointer-events-auto relative z-10` zurück; kartenBedienung.test.ts
            prüft das für jede Karte (TA-01: ohne die Klasse öffnete das
            PDF-Symbol nur die Zeile). */}
        <div className={`pointer-events-none ${className}`}>{children}</div>
      </div>
    )
  }

  return (
    <div
      id={id}
      onClick={onClick}
      {...(onClick
        ? {
            role: 'button',
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              // Leertaste scrollt sonst die Seite — wie bei echten Knöpfen abfangen
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            },
          }
        : {})}
      className={base}
    >
      {children}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
  className = '',
  label,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
  /** Name eines Knopfs, der nur ein Symbol zeigt — sonst sagt die
   *  Sprachausgabe bloß „Schaltfläche" (Audit 11/2026, A11Y-07). */
  label?: string
}) {
  const styles = {
    primary: 'bg-accent text-bg font-semibold hover:brightness-110',
    ghost: 'border border-line/15 text-ink hover:bg-line/5',
    danger: 'border border-danger/40 text-danger hover:bg-danger/10',
  }[variant]
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`min-h-11 rounded-xl px-4 py-2.5 text-body transition disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

/** Auswahlfelder tragen dieselbe Optik wie Eingabefelder — vorher stand die
 *  Klassenliste an vierzehn Stellen wortgleich im Code und wich an zwei
 *  Stellen davon ab.
 *
 *  `aria-[invalid=true]:border-danger`: Ein beanstandetes Feld trug zwar
 *  aria-invalid, sah aber aus wie jedes andere — wer die Meldung nicht
 *  vorgelesen bekommt, suchte das Feld (Audit 11/2026, A11Y-16). Der rote
 *  Rand bleibt auch im Fokus stehen (die aria-Variante steht im CSS hinter
 *  `focus:`) — der Akzent-Ring daneben sagt „hier bist du", der Rand weiter
 *  „hier fehlt etwas". */
export const selectCls =
  'w-full rounded-xl border border-field bg-bg/60 px-3 py-2.5 text-body text-ink outline-none transition aria-[invalid=true]:border-danger focus:border-accent/60 focus:ring-2 focus:ring-accent/20'

export const inputCls =
  'w-full rounded-xl border border-field bg-bg/60 px-3.5 py-2.5 text-lead text-ink placeholder:text-dim outline-none transition aria-[invalid=true]:border-danger focus:border-accent/60 focus:ring-2 focus:ring-accent/20'

/**
 * Beschriftetes Feld.
 *
 * Ein <label> gehört immer zu genau EINEM Bedienelement — dem ersten in ihm.
 * Enthielt ein Feld eine Knopfgruppe, wurde deshalb der erste Knopf mit dem
 * gesamten Inhalt der Beschriftung angesagt: „Competent" las sich als
 * „Overall Result CompetentNot Competent", „Completed" als „Session status
 * CompletedNot Completed". Wer die App hört statt sie zu sehen, bekam damit
 * an der wichtigsten Stelle des Formulars die Gegenteil-Aussage vorgelesen.
 *
 * Für Gruppen daher `group` setzen: dann beschriftet die Überschrift die
 * Gruppe als Ganzes, und jeder Knopf behält seinen eigenen Namen.
 *
 * Audit 11/2026, GTY-12: Eine beanstandete Gruppe (Entweder-oder auf 308F,
 * Training Device, Event) war nicht zu finden — ohne `id` lief der Sprung
 * ins Leere, und ohne `aria-invalid` sagte auch die Gruppe nichts. Bei
 * Gruppen hängen Beanstandung und Meldung deshalb HIER, an der Gruppe;
 * `tabIndex -1` macht sie zum Sprungziel, auch wenn kein Knopf darin ist.
 * Ein einzelnes Feld trägt beides selbst (das <label> ist kein Bedienelement).
 */
export function Field({
  label,
  children,
  group = false,
  id: anchorId,
  invalid = false,
  describedBy,
}: {
  label: string
  children: ReactNode
  group?: boolean
  /** Sprungziel — die Abschlussleiste des Formulars scrollt hierher. */
  id?: string
  /** nur bei `group`: die Gruppe ist beanstandet */
  invalid?: boolean
  /** nur bei `group`: id der Meldung bzw. des Hinweises zur Gruppe */
  describedBy?: string
}) {
  const id = useId()
  if (group) {
    return (
      <div
        id={anchorId}
        tabIndex={anchorId ? -1 : undefined}
        className="block scroll-mt-24"
        role="group"
        aria-labelledby={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        {/* Eine Knopfgruppe hat keinen Rand, der rot werden könnte — sichtbar
            wird die Beanstandung an ihrer Beschriftung. */}
        <span id={id} className={`mb-1.5 block text-small font-medium ${invalid ? 'text-danger' : 'text-dim'}`}>
          {label}
        </span>
        {children}
      </div>
    )
  }
  return (
    <label className="block">
      <span className="mb-1.5 block text-small font-medium text-dim">{label}</span>
      {children}
    </label>
  )
}

/**
 * Ankreuzfeld des Originalformulars als Umschaltknopf (☐/☒ wie auf Papier).
 *
 * Audit 11/2026, A11Y-08: Sechs Stellen im Grading-Formular schrieben diesen
 * Knopf von Hand, vier davon (CDR/FO, Left/Right, TKI/SFI/TRI, Left/Right/
 * Rear) ohne `aria-pressed`. Der Zustand steckte dort allein in Farbe und
 * Glyphe, und die Glyphe stand im Namen: Vorgelesen wurde „☐ Left" zweimal
 * hintereinander, ohne zu sagen, wessen Sitz und was gewählt ist. Jetzt
 * trägt der Knopf seinen Zustand als `aria-pressed`, die Glyphe ist
 * Schmuck. Den Namen der Gruppe gibt der Aufrufer (`role="group"`).
 */
export function Ankreuzknopf({
  an,
  onClick,
  children,
  klein = false,
}: {
  an: boolean
  onClick: () => void
  children: ReactNode
  /** kleinere Schrift für lange Ankreuzreihen (ATA-Kapitel, Events) */
  klein?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={an}
      onClick={onClick}
      className={`min-h-11 rounded-lg border py-1.5 transition ${klein ? 'px-2.5 text-micro' : 'px-3 text-small'} ${
        an ? 'border-accent bg-accent/15 font-medium text-ink' : 'border-line/15 text-dim'
      }`}
    >
      <span aria-hidden>{an ? '☒' : '☐'}</span> {children}
    </button>
  )
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-raised font-semibold text-accent"
    >
      {initials}
    </div>
  )
}

/**
 * Zaehler-Marke fuer Kacheln — Akzentfarbe, mit Zahl.
 *
 * Auf der Startseite bedeutete ein gruener Punkt zwei entgegengesetzte Dinge:
 * bei Grading die Ampel („alles unterschrieben und versendet"), bei Chat und
 * Info „ungelesen" — gleiche Farbe, gleiche Groesse, gleiche Position. Die
 * Ampel bleibt gruen/gelb/rot und exklusiv beim Grading; alles Ungelesene
 * traegt jetzt diese blaue Marke mit Zahl. Zwei Codierungen, zwei
 * Bedeutungen, kein Verwechseln.
 */
export function CountBadge({ count, label, className = '' }: { count: number; label: string; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      role="img"
      aria-label={`${count} ${label}`}
      className={`pointer-events-none absolute z-10 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-micro font-bold leading-none text-bg ring-2 ring-bg ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** Grüner „Neu“-Punkt; Position über className, Größe über size (px) steuern. */
export function NewDot({ className = '', size = 12 }: { className?: string; size?: number }) {
  const { t } = useTranslation()
  return (
    <span
      // Ohne Rolle verwerfen die meisten Sprachausgaben das Label eines
      // <span> — die ungelesenen Chats waren damit rein visuell markiert.
      role="img"
      aria-label={t('common.new')}
      style={{ width: size, height: size }}
      className={`pointer-events-none absolute z-10 rounded-full bg-ok ring-2 ring-bg ${className}`}
    />
  )
}

/** Mehrfachauswahl als Chip-Reihe — überall gleiches Verhalten und Styling */
export function ChipMultiSelect({ options, selected, onChange }: {
  /** `fest`: Der Chip zeigt seinen Zustand, laesst sich aber nicht
   *  umschalten — etwa die eigene Person in der Mitgliederliste einer
   *  Gruppe, die man verwaltet (VERW-09). Bleibt per Tab erreichbar
   *  (aria-disabled statt disabled), damit die Sprachausgabe ihn mitliest. */
  options: { id: string; label: string; fest?: boolean }[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.id)
        return (
          <button
            key={o.id}
            type="button"
            // Ausgewaehlt oder nicht war nur an der Farbe zu erkennen: Eine
            // Sprachausgabe meldete vorher wie nachher „C560 XLS+,
            // Schaltflaeche" — man konnte nicht feststellen, ob die
            // Pflichtangabe schon erfuellt ist.
            aria-pressed={on}
            aria-disabled={o.fest || undefined}
            onClick={() => {
              if (o.fest) return
              onChange(on ? selected.filter((x) => x !== o.id) : [...selected, o.id])
            }}
            // Fest heisst gestrichelter Rand, nicht gedaempfte Deckkraft —
            // die drueckte den Kontrast unter 3:1 (VERW-17).
            className={`min-h-11 rounded-full border px-3 py-1.5 text-micro transition ${
              on ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line/15 text-dim'
            } ${o.fest ? 'cursor-default border-dashed' : ''}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Bearbeitbare Liste als Chip-Reihe — Muster, Kategorien, Empfaenger,
 * Login-Domains, Grading-Verteiler.
 *
 * Stand vorher zweimal da (StringListEditor im Admin-Panel, StringList im
 * Grading-Bereich), verschieden gebaut: Der Loeschknopf war 13 px gross, im
 * Grading ein nacktes „×", das „+" hatte keinen Namen. Ein Fehltipper auf dem
 * Tablet loeschte Stammdaten, und nach dem Loeschen stand der Fokus auf
 * <body> — wer per Tastatur weiterwollte, begann oben auf der Seite
 * (Audit 11/2026, MOB-05, A11Y-04, A11Y-07).
 *
 * Jetzt: Loeschflaeche 44 px mit Namen „Loeschen: <Wert>", nach dem Loeschen
 * Fokus auf den Nachbarn (sonst ins Eingabefeld). `fest` nennt Eintraege,
 * die bleiben muessen — ohne Loeschknopf statt eines Loeschens, das der
 * naechste Start still rueckgaengig macht (TEC-09). `pruefeEntfernen` nennt
 * den Grund, warum etwas nicht geht, statt still nichts zu tun (VERW-18).
 */
export function ChipListe({
  label,
  values,
  onChange,
  normalisiere,
  ungueltig,
  vorAenderung,
  pruefeEntfernen,
  fest = [],
  festHinweis,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  /** Eingabe in die gespeicherte Form bringen; `null` = ungueltig. */
  normalisiere?: (roh: string) => string | null
  /** Meldung, wenn `normalisiere` ablehnt. */
  ungueltig?: string
  /** Letzte Pruefung vor dem Speichern (Rueckfrage); `false` bricht ab. */
  vorAenderung?: (neu: string[], entfernt?: string) => boolean
  /** Grund, warum ein Eintrag nicht entfernt werden kann — oder `null`. */
  pruefeEntfernen?: (wert: string) => string | null
  /** Eintraege ohne Loeschknopf (Pflichteintraege). */
  fest?: string[]
  /** Warum die festen Eintraege bleiben — steht unter der Liste. */
  festHinweis?: string
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  // Meldung unter der Liste; `feld` heisst: Sie gilt der Eingabe (ungueltig),
  // nicht einem abgelehnten Loeschen — nur dann ist das Feld beanstandet.
  const [meldung, setMeldung] = useState<{ text: string; feld: boolean } | null>(null)
  const meldungId = useId()
  const eingabe = useRef<HTMLInputElement>(null)
  const knoepfe = useRef(new Map<string, HTMLButtonElement>())
  // Stelle des zuletzt geloeschten Eintrags: Nach dem Neuzeichnen bekommt
  // der Nachbar den Fokus.
  const geloeschtAn = useRef<number | null>(null)

  useEffect(() => {
    const i = geloeschtAn.current
    if (i === null) return
    geloeschtAn.current = null
    // Nur retten, was verloren ging. Steht der Fokus noch irgendwo (etwa im
    // Eingabefeld), bleibt er dort.
    if (document.activeElement && document.activeElement !== document.body) return
    const loeschbar = (v: string | undefined) => v !== undefined && !fest.includes(v)
    let ziel: string | undefined
    for (let j = i; j < values.length && !ziel; j++) if (loeschbar(values[j])) ziel = values[j]
    for (let j = Math.min(i, values.length) - 1; j >= 0 && !ziel; j--) if (loeschbar(values[j])) ziel = values[j]
    ;(ziel ? knoepfe.current.get(ziel) : eingabe.current)?.focus()
    // Ausloeser ist allein die neue Liste; `fest` kommt im selben Zeichnen.
  }, [values])

  const aendern = (neu: string[], entfernt?: string) => {
    if (vorAenderung && !vorAenderung(neu, entfernt)) return false
    onChange(neu)
    return true
  }
  const entfernen = (v: string, i: number) => {
    const grund = pruefeEntfernen?.(v) ?? null
    setMeldung(grund ? { text: grund, feld: false } : null)
    if (grund) return
    if (aendern(values.filter((x) => x !== v), v)) geloeschtAn.current = i
  }
  const add = () => {
    const roh = draft.trim()
    if (!roh) return
    // Ungueltiges bleibt im Feld stehen, damit man es korrigieren kann —
    // eine Login-Domain „@Example.Test" wurde vorher gespeichert, wie sie
    // getippt war, und sperrte die ATO aus (VERW-05).
    const v = normalisiere ? normalisiere(roh) : roh
    if (v === null) {
      setMeldung({ text: ungueltig ?? '', feld: true })
      return
    }
    // Schon da, wenn auch anders geschrieben („cl30" bei „CL30")? Dann nicht
    // anfuegen, sondern den vorhandenen Eintrag nennen. Vorher ging die
    // zweite Schreibweise durch, und eine exakte Dublette verschwand still
    // aus dem Feld (Nachtrag VERW#3).
    const vorhanden = vorhandenerEintrag(values, v)
    if (vorhanden !== undefined) {
      setMeldung({ text: t('admin.valueTaken', { value: vorhanden }), feld: true })
      return
    }
    setMeldung(null)
    if (!aendern([...values, v])) return
    setDraft('')
  }
  const festeDa = values.some((v) => fest.includes(v))
  return (
    // Gruppe statt <label>: die Beschriftung gehoert zur Liste, nicht zum
    // ersten Loeschknopf darin.
    <Field label={label} group>
      <div className="mb-2 flex flex-wrap gap-2">
        {values.map((v, i) =>
          fest.includes(v) ? (
            // Fest: gestrichelter Rand und Schloss statt Loeschknopf — nicht
            // gedaempft, der Wert bleibt voll lesbar (VERW-17).
            <span key={v} className="flex items-center gap-1.5 rounded-full border border-dashed border-line/25 px-3 py-1.5 text-small">
              <Lock size={12} aria-hidden className="shrink-0 text-dim" />
              {v}
            </span>
          ) : (
            <span key={v} className="flex items-center gap-0.5 rounded-full bg-raised px-3 py-1.5 text-small">
              {v}
              {/* 44 px Trefferflaeche, die per negativem Rand in die Pille
                  hineinragt — die Pille selbst bleibt so hoch wie Text. */}
              <button
                type="button"
                ref={(el) => {
                  if (el) knoepfe.current.set(v, el)
                  else knoepfe.current.delete(v)
                }}
                onClick={() => entfernen(v, i)}
                aria-label={`${t('common.delete')}: ${v}`}
                className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-dim transition hover:text-danger"
              >
                <X size={15} aria-hidden />
              </button>
            </span>
          ),
        )}
      </div>
      {festeDa && festHinweis && <p className="mb-2 text-micro leading-relaxed text-dim">{festHinweis}</p>}
      <div className="flex gap-2">
        <input
          ref={eingabe}
          className={`${inputCls} ${meldung?.feld ? 'border-danger/60' : ''}`}
          value={draft}
          aria-label={label}
          aria-invalid={meldung?.feld || undefined}
          aria-describedby={meldung ? meldungId : undefined}
          placeholder={t('admin.addValue')}
          onChange={(e) => {
            setDraft(e.target.value)
            setMeldung(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <Button variant="ghost" onClick={add} label={`${t('common.add')}: ${label}`}>
          <Plus size={16} aria-hidden />
        </Button>
      </div>
      {meldung?.text && (
        <p id={meldungId} role="alert" className="mt-1.5 text-micro leading-relaxed text-danger">
          {meldung.text}
        </p>
      )}
    </Field>
  )
}

export type BadgeTone = 'accent' | 'ok' | 'wait' | 'bad' | 'dim'

/**
 * Statusmarke — die einzige Pille der App.
 *
 * Vorher stand dasselbe Signal in drei Gestalten nebeneinander: „Not
 * Competent" war in der Liste warm-braun, in der Akte rot getoent und in der
 * Detailansicht ein volles `bg-red-600`. Wer die drei Ansichten
 * hintereinander sah, musste jedes Mal neu lesen, statt die Farbe zu
 * erkennen. Deshalb gibt es hier fuenf Toene mit je EINER Bedeutung —
 * `ok` erledigt, `wait` wartet oder mahnt, `bad` durchgefallen oder kaputt,
 * `accent` neutrale Einordnung (Muster, Rolle), `dim` ruhiger Nebenzustand.
 *
 * `strong` waehlt die volle Flaeche statt der 15-%-Toenung. Das ist keine
 * zweite Farbwelt, sondern dieselbe Skala lauter — gebraucht dort, wo die
 * Marke gegen viel Text bestehen muss (fehlendes Pflichtformular, Ergebnis
 * im Kopf der Akte).
 */
export function Badge({ children, tone = 'accent', strong = false }: { children: ReactNode; tone?: BadgeTone; strong?: boolean }) {
  /* Akzentfarbe auf 15-%-Flaeche ergab gemessene 3,86:1 — unter den
     geforderten 4,5:1 fuer normalen Text. Die Flaeche traegt den Akzent,
     die Schrift bleibt Text (12,4:1). Dasselbe gilt fuer den aktiven
     Zustand jedes Umschalters in der App.
     Gleiches Bild bei ok/wait/bad (nachgemessen 01.11.2026): hell 3,4–4,3:1
     fuer wait und ok, dunkel 3,6:1 fuer bad auf getoenten Flaechen. Jetzt
     Schrift in ink (8:1 und mehr), die Farbe tragen Flaeche und Rand. */
  const soft: Record<BadgeTone, string> = {
    accent: 'bg-accent/15 text-ink',
    ok: 'bg-ok/15 text-ink ring-1 ring-inset ring-ok/50',
    wait: 'bg-wait/15 text-ink ring-1 ring-inset ring-wait/50',
    bad: 'bg-bad/15 text-ink ring-1 ring-inset ring-bad/50',
    dim: 'bg-line/10 text-dim',
  }
  /* Die Ink-Toene wechseln mit dem Theme mit — auf der hellen Ampelflaeche
     steht Weiss, auf der dunklen fast Schwarz. */
  const full: Record<BadgeTone, string> = {
    accent: 'bg-accent text-bg',
    ok: 'bg-ok text-okInk',
    wait: 'bg-wait text-waitInk',
    bad: 'bg-bad text-badInk',
    dim: 'bg-raised text-ink',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-micro font-medium ${(strong ? full : soft)[tone]} ${strong ? 'font-semibold' : ''}`}
    >
      {children}
    </span>
  )
}

/**
 * Dialog mit vollständiger Tastaturbedienung: Escape schließt, der Fokus
 * bleibt im Dialog gefangen und kehrt beim Schließen an die auslösende
 * Stelle zurück. Ein Klick auf den Hintergrund fragt nach, sobald etwas
 * eingetragen wurde — vorher verwarf er ein halb ausgefülltes Formular
 * kommentarlos.
 */
/** Bedienbare Elemente eines Dialogs in Tab-Reihenfolge. */
function focusableIn(panel: HTMLElement | null): HTMLElement[] {
  return [...(panel?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter(
    (e) => !e.hasAttribute('disabled') && e.offsetParent !== null,
  )
}

/**
 * Fokusführung eines Dialogs: beim Öffnen hinein (erstes Eingabefeld, sonst
 * erstes bedienbares Element), Tab läuft im Kreis, Escape schließt, beim
 * Schließen zurück auf das auslösende Element. EINE Stelle für Modal und
 * DocCheck-Viewer — der Viewer hatte das nicht, und wer ihn per Tastatur
 * öffnete, landete hinter ihm (Barrierefreiheitsprüfung 01.11.2026).
 */
export function useDialogFokus(panelRef: RefObject<HTMLElement>, onEscape: () => void): void {
  // Aufrufer übergeben Inline-Funktionen; über die Referenz bleibt der
  // Tasten-Effekt stabil — sonst hinge er sich bei jedem Rendern neu auf und
  // risse den Fokus mit.
  const escRef = useRef(onEscape)
  escRef.current = onEscape

  // Fokus genau einmal setzen: beim Öffnen in den Dialog, beim Schließen
  // zurück auf das auslösende Element. Hing das früher an close, sprang der
  // Fokus bei jedem getippten Zeichen zwischen Feld und Dialog hin und her —
  // die Seite ruckelte und es kam nur der erste Buchstabe an.
  useEffect(() => {
    const panel = panelRef.current
    const opener = document.activeElement
    // Das erste Eingabefeld ist der sinnvolle Startpunkt; erst wenn der
    // Dialog keines hat, zählt das erste bedienbare Element. Der
    // Schließen-Knopf steht im Quelltext vorne, ist als Startpunkt aber
    // nutzlos.
    const items = focusableIn(panel)
    const field = items.find((e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName))
    const target = field ?? items[0]
    if (target) target.focus()
    else panel?.focus()
    return () => {
      ;(opener as HTMLElement | null)?.focus?.()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        escRef.current()
        return
      }
      if (e.key !== 'Tab') return
      // Fokusfalle: Tab läuft im Kreis, statt hinter den Dialog zu wandern
      const items = focusableIn(panelRef.current)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [panelRef])
}

export function Modal({
  title,
  onClose,
  children,
  confirmDiscard,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  /** Rückfrage vor dem Verwerfen (Text); ohne Angabe schließt der Dialog sofort */
  confirmDiscard?: string
}) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    if (confirmDiscard && !window.confirm(confirmDiscard)) return
    onClose()
  }, [confirmDiscard, onClose])

  useDialogFokus(panelRef, close)

  // Solange der Dialog offen ist, darf die Seite dahinter nicht mitscrollen.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      onClick={close}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line/10 bg-surface p-5 shadow-tile sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-head font-semibold">{title}</h2>
          <button
            onClick={close}
            aria-label={t('common.close')}
            title={t('common.close')}
            className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-dim transition hover:bg-line/5 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
