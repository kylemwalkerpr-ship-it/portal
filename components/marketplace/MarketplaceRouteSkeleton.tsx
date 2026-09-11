'use client'

import React from 'react'
import { T, F } from './tokens'

/**
 * Shared first-paint chrome for marketplace detail routes.
 *
 * Deliberate structural skeletons (not empty LoadingState chrome) so
 * Marketplace → gig / provider navigations reserve the same layout the
 * interactive island will occupy. Prefer seeding real SSR data when
 * available; these skeletons are the fallback when enrichment is still
 * pending or Suspense is resolving search-param islands.
 */

const shimmer: React.CSSProperties = {
  background: `linear-gradient(90deg, ${T.paper2} 0%, ${T.vellum} 45%, ${T.paper2} 100%)`,
  backgroundSize: '200% 100%',
  animation: 'ys-market-skel 1.2s ease-in-out infinite',
  borderRadius: 10,
}

function Bone({ style }: { style?: React.CSSProperties }) {
  return <div aria-hidden="true" style={{ ...shimmer, ...style }} />
}

function SkeletonStyles() {
  return (
    <style>{`
      @keyframes ys-market-skel {
        0% { background-position: 100% 0; }
        100% { background-position: -100% 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .ys-market-route-skel * { animation: none !important; }
      }
      @media (max-width: 900px) {
        .ys-market-route-skel-grid { grid-template-columns: 1fr !important; }
        .ys-market-route-skel-side { position: static !important; }
      }
    `}</style>
  )
}

/** Reserved-height placeholder for the sticky category rail during Suspense. */
export function CategoryBarSkeleton() {
  return (
    <div
      className="ys-cat-bar ys-cat-bar-skel"
      role="status"
      aria-label="Loading categories"
      style={{
        position: 'sticky',
        top: 60,
        zIndex: 180,
        borderBottom: `1px solid ${T.rule}`,
        background: T.paper2,
        height: 52,
        minHeight: 52,
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, height: '100%' }}>
        {[96, 110, 88, 120, 100].map((w, i) => (
          <Bone key={i} style={{ width: w, height: 36, borderRadius: 999, flexShrink: 0 }} />
        ))}
      </div>
    </div>
  )
}

/** Structural gig-detail shell matching breadcrumb + hero + 2-col layout. */
export function GigDetailSkeleton({ title }: { title?: string }) {
  return (
    <div className="ys-market-route-skel" style={{ minHeight: '100vh', color: T.onPaper, fontFamily: F.ui }} role="status" aria-busy="true" aria-label="Loading gig details">
      <SkeletonStyles />
      <main style={{ width: 'min(1280px, calc(100vw - 32px))', margin: '0 auto', padding: '32px 0 64px' }}>
        {title ? (
          <h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
            {title}
          </h1>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <Bone style={{ width: 88, height: 12 }} />
          <Bone style={{ width: 12, height: 12, borderRadius: 4 }} />
          <Bone style={{ width: 120, height: 12 }} />
        </div>
        <Bone style={{ width: 'min(640px, 92%)', height: 42, marginBottom: 14, borderRadius: 12 }} />
        <Bone style={{ width: 'min(420px, 70%)', height: 16, marginBottom: 24 }} />
        <div className="ys-market-route-skel-grid ys-content-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Bone style={{ width: '100%', aspectRatio: '1280 / 769', borderRadius: 14, border: `1px solid ${T.rule}` }} />
            <Bone style={{ width: '100%', height: 160, borderRadius: 14 }} />
            <Bone style={{ width: '100%', height: 120, borderRadius: 14 }} />
          </div>
          <aside className="ys-market-route-skel-side ys-sidebar" style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Bone style={{ width: '100%', height: 220, borderRadius: 14 }} />
            <Bone style={{ width: '100%', height: 140, borderRadius: 14 }} />
            <Bone style={{ width: '100%', height: 96, borderRadius: 14 }} />
          </aside>
        </div>
      </main>
    </div>
  )
}

/** Structural provider-profile shell matching breadcrumb + hero + tabs. */
export function ProviderProfileSkeleton({ name }: { name?: string }) {
  return (
    <div
      className="ys-market-route-skel ys-seller-profile-page"
      style={{ minHeight: '100vh', color: T.onPaper, padding: '24px 32px', maxWidth: 1200, margin: '0 auto', fontFamily: F.ui }}
      role="status"
      aria-busy="true"
      aria-label="Loading seller profile"
    >
      <SkeletonStyles />
      {name ? (
        <h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
          {name}
        </h1>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <Bone style={{ width: 96, height: 12 }} />
        <Bone style={{ width: 12, height: 12 }} />
        <Bone style={{ width: 140, height: 12 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 16, marginBottom: 20, padding: 18, border: `1px solid ${T.rule}`, borderRadius: 14, background: T.vellum }}>
        <Bone style={{ width: 96, height: 96, borderRadius: 999 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <Bone style={{ width: 'min(280px, 80%)', height: 28 }} />
          <Bone style={{ width: 'min(360px, 90%)', height: 14 }} />
          <Bone style={{ width: 'min(200px, 60%)', height: 14 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: `1px solid ${T.rule}`, paddingBottom: 0 }}>
        <Bone style={{ width: 72, height: 40, borderRadius: 0 }} />
        <Bone style={{ width: 96, height: 40, borderRadius: 0 }} />
        <Bone style={{ width: 88, height: 40, borderRadius: 0 }} />
      </div>
      <Bone style={{ width: '100%', height: 280, borderRadius: 14 }} />
    </div>
  )
}

/** Compact reserved slot for auth controls before Clerk resolves. */
export function AuthNavSkeleton() {
  return (
    <div
      className="ys-auth-nav-skel"
      role="status"
      aria-label="Loading account"
      style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120, minHeight: 44 }}
    >
      <Bone style={{ width: 72, height: 36, borderRadius: 999 }} />
      <Bone style={{ width: 44, height: 36, borderRadius: 999 }} />
    </div>
  )
}
