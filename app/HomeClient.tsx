'use client'

import React from 'react'
import Nav from '@/components/design/landing/Nav'
import Hero from '@/components/design/landing/Hero'
import FeaturedServices from '@/components/design/landing/FeaturedServices'
import TwoPractices from '@/components/design/landing/TwoPractices'
import HowItWorks from '@/components/design/landing/HowItWorks'
import FeaturedProviders from '@/components/design/landing/FeaturedProviders'
import FAQ from '@/components/design/landing/FAQ'
import FinalCTA from '@/components/design/landing/FinalCTA'
import MemberSignInModal from '@/components/design/landing/MemberSignInModal'
import type { FeaturedGig } from '@/components/design/landing/data/featured-services'
import type { FeaturedProvider } from '@/components/design/landing/data/featured-providers'

interface HomeClientProps {
  gigs: FeaturedGig[]
  providers: FeaturedProvider[]
}

export default function HomeClient({ gigs, providers }: HomeClientProps) {
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
        <div className="stack-section"><FeaturedProviders providers={providers} /></div>
        <div className="stack-section"><FAQ /></div>
        <div className="stack-section"><FinalCTA /></div>
      </div>
      <MemberSignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  )
}
