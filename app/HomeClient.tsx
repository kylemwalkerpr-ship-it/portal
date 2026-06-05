'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import Nav from '@/components/design/landing/Nav'
import Hero from '@/components/design/landing/Hero'
import FeaturedServices from '@/components/design/landing/FeaturedServices'
import TwoPractices from '@/components/design/landing/TwoPractices'
import HowItWorks from '@/components/design/landing/HowItWorks'
import FAQ from '@/components/design/landing/FAQ'
import FinalCTA from '@/components/design/landing/FinalCTA'
import type { FeaturedGig } from '@/components/design/landing/data/featured-services'

// MemberSignInModal is invisible until the user clicks the Sign In button.
// Eager-loading it pulled the Clerk sign-in UI bundle (~80 kB gzipped) into
// the initial chunk for every market subdomain visitor — drove the slow-JS
// load time Ahrefs flagged. Code-split lets the chunk arrive only when
// signInOpen flips true.
const MemberSignInModal = dynamic(
  () => import('@/components/design/landing/MemberSignInModal').then((m) => m.default ?? m),
  { ssr: false, loading: () => null },
)

interface HomeClientProps {
  gigs: FeaturedGig[]
}

export default function HomeClient({ gigs }: HomeClientProps) {
  const [signInOpen, setSignInOpen] = React.useState(false)

  return (
    <>
      <Nav onOpenSignIn={() => setSignInOpen(true)} />
      {/* Sticky cascade: every section below pins under the nav as the
          user scrolls; later sections paint over earlier ones, producing
          a card-stack effect. Inner sections keep their full-bleed
          backgrounds, so each one occludes the previous one cleanly.
          Section list deliberately lean — the original 13-section deck
          read as filler and density. Order: intro → product → pillars →
          process → proof → FAQ → CTA.
          The .stack-wrapper bounds the cascade: position: sticky pins
          only while its containing block is in view, so when the wrapper
          scrolls past, the last section releases and the footer (a
          sibling of HomeClient in page.tsx) flows in normally instead
          of being covered by a perpetually-pinned FinalCTA. */}
      <div className="stack-wrapper">
        <div className="stack-section"><Hero onSignup={() => { window.location.href = '/sign-up/student' }} /></div>
        <div className="stack-section"><FeaturedServices gigs={gigs} /></div>
        <div className="stack-section"><TwoPractices /></div>
        <div className="stack-section"><HowItWorks /></div>
        <div className="stack-section"><FAQ /></div>
        <div className="stack-section"><FinalCTA /></div>
      </div>
      <MemberSignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  )
}
