import { RotateCcw, RotateCw, Smartphone, Tablet, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { navigate } from '../router'

/**
 * Sandbox-Gerätevorschau: rendert die App in einem iPhone- oder iPad-Rahmen
 * (echte Gerätemaße, skaliert auf die Fenstergröße), inklusive Drehung.
 * Die eingebettete App läuft mit eigenem Sandbox-Zustand.
 */

const DEVICES = {
  iphone: { label: 'iPhone', w: 390, h: 844, radius: 54, bezel: 14 },
  ipad: { label: 'iPad', w: 820, h: 1180, radius: 36, bezel: 22 },
} as const

type DeviceKey = keyof typeof DEVICES

export function DevicePreview() {
  const { t } = useTranslation()
  const [device, setDevice] = useState<DeviceKey>('iphone')
  const [landscape, setLandscape] = useState(false)
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight })
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const d = DEVICES[device]
  const w = landscape ? d.h : d.w
  const h = landscape ? d.w : d.h
  const outerW = w + d.bezel * 2
  const outerH = h + d.bezel * 2
  const scale = Math.min(1, (viewport.w - 48) / outerW, (viewport.h - 140) / outerH)

  return (
    <div className="flex min-h-full flex-1 flex-col items-center">
      <header className="flex w-full max-w-3xl items-center justify-center gap-2 px-4 py-3">
        {(Object.keys(DEVICES) as DeviceKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setDevice(key)}
            className={`min-h-11 flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
              device === key ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim hover:text-ink'
            }`}
          >
            {key === 'iphone' ? <Smartphone size={14} /> : <Tablet size={14} />} {DEVICES[key].label}
          </button>
        ))}
        <button
          onClick={() => setLandscape((v) => !v)}
          title={t('sandbox.rotate')}
          className="min-h-11 rounded-full border border-line/15 p-2 text-dim transition hover:text-ink"
        >
          {landscape ? <RotateCcw size={14} /> : <RotateCw size={14} />}
        </button>
        <button
          onClick={() => frameRef.current?.contentWindow?.location.reload()}
          title={t('sandbox.reset')}
          className="min-h-11 rounded-full border border-line/15 px-3 py-1.5 text-[13px] text-dim transition hover:text-ink"
        >
          ⟳
        </button>
        <button
          onClick={() => navigate('/')}
          aria-label={t('common.close')}
          className="min-h-11 ml-2 rounded-full border border-line/15 p-2 text-dim transition hover:text-danger"
        >
          <X size={14} />
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center pb-6">
        <div style={{ width: outerW * scale, height: outerH * scale }}>
          <div
            style={{
              width: outerW,
              height: outerH,
              borderRadius: d.radius,
              padding: d.bezel,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            className="relative bg-[#0a0c10] shadow-tile ring-1 ring-white/10"
          >
            {/* Dynamic Island / Kamera-Aussparung */}
            {device === 'iphone' && !landscape && (
              <span className="absolute left-1/2 top-[22px] z-10 h-[24px] w-[100px] -translate-x-1/2 rounded-full bg-black" />
            )}
            <iframe
              ref={frameRef}
              title="Device preview"
              src="./#/"
              style={{ width: w, height: h, borderRadius: d.radius - d.bezel }}
              className="border-0 bg-bg"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
