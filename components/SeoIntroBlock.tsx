/**
 * SeoIntroBlock — small server-rendered translated intro placed at the
 * top of every publicly crawlable page.
 *
 * Why this exists:
 *   The dashboard and landing pages are large client-rendered React
 *   apps. Converting them all to server components would be a multi-week
 *   rewrite. This block is the pragmatic middle path — it server-renders
 *   a translated heading + paragraph above the existing client app so
 *   crawlers index real, language-appropriate body text at every
 *   ?lang=<code> URL, while users see the full app unchanged below.
 *
 * Title + description are translated via the Supabase-backed cache
 * (lib/serverTranslate). First request per language hits MyMemory;
 * every subsequent render is a single indexed Supabase lookup.
 *
 * NOT a hidden block. The text is visible on the page — that's both
 * required by Google's quality guidelines (hidden content is a manual-
 * action risk) and good for non-English users who land on the page.
 */
import { headers } from 'next/headers'
import { translateBatch } from '@/lib/serverTranslate'

interface SeoIntroBlockProps {
  /** Headline. Plain English — gets translated server-side. */
  title: string
  /** Sub-headline / value prop. Plain English. */
  description: string
  /** Optional tagline rendered above the title in muted small caps. */
  eyebrow?: string
  /** Visual variant. */
  tone?: 'navy' | 'plain'
}

const SEO_INTRO_VIDEO = '/seo-intro-hero.mp4'
const SEO_INTRO_POSTER = '/seo-intro-hero-poster.jpg'

export async function SeoIntroBlock({
  title,
  description,
  eyebrow,
  tone = 'navy',
}: SeoIntroBlockProps) {
  let lang = 'en'
  try {
    const h = await headers()
    const fromHeader = h.get('x-lang')
    if (fromHeader && /^[a-z]{2}$/.test(fromHeader)) lang = fromHeader
  } catch { /* fallthrough — defaults to English */ }

  const sources = [title, description, eyebrow || '']
  const [tTitle, tDesc, tEyebrow] = await translateBatch(sources, lang)

  if (tone === 'plain') {
    return (
      <header data-no-translate style={{ padding: '32px 24px 16px', maxWidth: 980, margin: '0 auto', fontFamily: "var(--portal-font-body, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif)" }}>
        {tEyebrow && (
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A7B3B', marginBottom: 6, fontFamily: "'SF Mono', Menlo, Consolas, monospace" }}>
            {tEyebrow}
          </div>
        )}
        <h2 style={{ fontFamily: "var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 600, color: '#1A1F2E', margin: '0 0 10px', letterSpacing: '-.012em', lineHeight: 1.1 }}>{tTitle}</h2>
        <p style={{ fontSize: 16, color: '#5C6070', lineHeight: 1.6, margin: 0, maxWidth: 720 }}>{tDesc}</p>
      </header>
    )
  }

  return (
    <header
      data-no-translate
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0F172A 0%, #0d2060 100%)',
        color: '#FFF',
        padding: '40px 24px 28px',
        fontFamily: "var(--portal-font-body, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif)",
      }}
    >
      <video
        aria-hidden="true"
        className="ys-bg-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={SEO_INTRO_POSTER}
        disablePictureInPicture
        controls={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.42,
          filter: 'saturate(0.8) contrast(1.05) brightness(0.72)',
          pointerEvents: 'none',
        }}
      >
        <source src={SEO_INTRO_VIDEO} type="video/mp4" />
      </video>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, rgba(15,23,42,0.92) 0%, rgba(13,32,96,0.82) 54%, rgba(13,32,96,0.62) 100%)',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 980, margin: '0 auto' }}>
        {tEyebrow && (
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(196,164,90,0.95)', marginBottom: 6, fontFamily: "'SF Mono', Menlo, Consolas, monospace" }}>
            {tEyebrow}
          </div>
        )}
        <h2 style={{ fontFamily: "var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)", fontSize: 'clamp(28px, 4.5vw, 44px)', fontWeight: 600, color: '#FFF', margin: '0 0 12px', letterSpacing: '-.012em', lineHeight: 1.05 }}>{tTitle}</h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.78)', lineHeight: 1.6, margin: 0, maxWidth: 720 }}>{tDesc}</p>
      </div>
    </header>
  )
}
