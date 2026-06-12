import React from 'react'

export const LANDING_SLIDES = [
  {
    name: 'airport-terminal',
    position: 'center center',
  },
  {
    name: 'arrival-board',
    position: 'center center',
  },
  {
    name: 'airport-checkin',
    position: 'center center',
  },
  {
    name: 'immigrant-statue',
    position: 'center 38%',
  },
  {
    name: 'immigration-sign',
    position: 'center center',
  },
] as const

const SLIDE_DURATION_SECONDS = 30

export function LandingPhotoSlideshow({
  opacity = 1,
}: {
  opacity?: number
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        opacity,
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes ysLandingPhotoFade {
          0%, 16% { opacity: 1; transform: scale(1); }
          22%, 94% { opacity: 0; transform: scale(1.045); }
          100% { opacity: 1; transform: scale(1); }
        }
        .ys-landing-slide {
          position: absolute;
          inset: 0;
          opacity: 0;
          animation: ysLandingPhotoFade ${SLIDE_DURATION_SECONDS}s ease-in-out infinite;
          will-change: opacity, transform;
        }
        .ys-landing-slide:first-child {
          opacity: 1;
        }
        .ys-landing-slide img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          filter: saturate(0.95) contrast(1.04) brightness(0.96);
        }
        @media (prefers-reduced-motion: reduce) {
          .ys-landing-slide {
            animation: none;
            opacity: 0;
            transform: none;
          }
          .ys-landing-slide:first-child {
            opacity: 1;
          }
        }
      `}</style>
      {LANDING_SLIDES.map((slide, index) => (
        <picture
          key={slide.name}
          className="ys-landing-slide"
          style={{
            animationDelay: `${index * (SLIDE_DURATION_SECONDS / LANDING_SLIDES.length)}s`,
          }}
        >
          <source
            media="(max-width: 700px)"
            srcSet={`/landing-slides/${slide.name}-900.webp`}
            type="image/webp"
          />
          <img
            src={`/landing-slides/${slide.name}-1600.webp`}
            alt=""
            loading={index === 0 ? 'eager' : 'lazy'}
            fetchPriority={index === 0 ? 'high' : 'auto'}
            decoding={index === 0 ? 'sync' : 'async'}
            style={{
              objectPosition: slide.position,
            }}
          />
        </picture>
      ))}
    </div>
  )
}
