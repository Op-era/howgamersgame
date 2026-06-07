'use client'

import { useEffect, useRef } from 'react'

type AdPosition = 'top' | 'left' | 'right'

const AD_SIZES: Record<AdPosition, { w: string; h: string; slot: string }> = {
  top:   { w: '100%', h: '90px',  slot: process.env.NEXT_PUBLIC_ADSENSE_TOP_SLOT   ?? '' },
  left:  { w: '160px', h: '100%', slot: process.env.NEXT_PUBLIC_ADSENSE_LEFT_SLOT  ?? '' },
  right: { w: '160px', h: '100%', slot: process.env.NEXT_PUBLIC_ADSENSE_RIGHT_SLOT ?? '' },
}

export default function AdBanner({ position }: { position: AdPosition }) {
  const ref = useRef<HTMLModElement>(null)
  const pubId = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID
  const { w, h, slot } = AD_SIZES[position]

  useEffect(() => {
    if (!pubId || !slot) return
    try {
      // @ts-ignore
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {}
  }, [pubId, slot])

  if (!pubId || !slot) {
    return (
      <div
        className="ad-slot"
        style={{ width: w, height: h, minWidth: w, minHeight: h }}
      >
        <span style={{ writingMode: position !== 'top' ? 'vertical-rl' : undefined }}>
          ADVERTISEMENT
        </span>
      </div>
    )
  }

  return (
    <div style={{ width: w, height: h, minWidth: w, minHeight: h }}>
      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: 'block', width: w, height: h }}
        data-ad-client={pubId}
        data-ad-slot={slot}
        data-ad-format={position === 'top' ? 'horizontal' : 'vertical'}
        data-full-width-responsive="false"
      />
    </div>
  )
}
