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
      {/* Keep the sticky cascade only for the opening handoff into Featured
          Services. Practices onward scrolls normally so the rest of the page
          reads as a progressive landing page instead of a stacked deck. */}
      <div className="stack-wrapper">
        <div className="stack-section"><Hero onSignup={() => { window.location.href = '/sign-up/student' }} /></div>
        <div className="stack-section"><FeaturedServices gigs={gigs} /></div>
      </div>
      <TwoPractices />
      <HowItWorks />
      <FAQ />
      <FinalCTA />
      <MemberSignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  )
}
