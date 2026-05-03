'use client'
import { SignUp } from '@clerk/nextjs'

const FLAGS = [
  '🇺🇸','🇨🇦','🇬🇧','🇫🇷','🇩🇪','🇦🇺','🇯🇵','🇧🇷','🇮🇳','🇨🇳',
  '🇲🇽','🇿🇦','🇰🇪','🇳🇬','🇬🇭','🇪🇹','🇹🇳','🇸🇳','🇰🇷','🇵🇭',
  '🇻🇳','🇹🇭','🇮🇩','🇸🇬','🇵🇰','🇧🇩','🇳🇵','🇺🇬','🇹🇿','🇲🇦',
  '🇩🇿','🇿🇲','🇲🇿','🇨🇮','🇨🇲','🇦🇴','🇷🇼','🇺🇦','🇵🇱','🇮🇹',
  '🇪🇸','🇵🇹','🇳🇱','🇧🇪','🇸🇪','🇳🇴','🇨🇭','🇦🇹','🇬🇷','🇹🇷',
  '🇸🇦','🇦🇪','🇮🇶','🇯🇴','🇱🇧','🇮🇷','🇦🇫','🇲🇾','🇱🇰','🇲🇲',
]

export default function SignUpPage() {
  const repeated = Array.from({ length: 300 }, (_, i) => FLAGS[i % FLAGS.length])

  return (
    <div
      style={{
        minHeight: '100vh',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#E8E8E8',
        overflow: 'hidden',
      }}
    >
      {/* World flags tiled background */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'flex-start',
          gap: '2px',
          padding: '8px',
          opacity: 0.18,
          fontSize: '26px',
          lineHeight: '38px',
          userSelect: 'none',
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        {repeated.map((flag, i) => (
          <span key={i} style={{ display: 'inline-block' }}>{flag}</span>
        ))}
      </div>

      {/* Radial gradient overlay — fades flags toward centre so the form stays readable */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 55% 55% at 50% 50%, rgba(232,232,232,0.75) 0%, rgba(232,232,232,0.55) 40%, rgba(232,232,232,0.88) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Clerk sign-up form */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        <SignUp forceRedirectUrl="/dashboard" />
      </div>
    </div>
  )
}
