'use client'
// @ts-nocheck
import React from 'react'
import { C, Btn, Badge, Card, Input, Select, Avatar, StatusBadge, Divider, StatCard, ProgressBar, NavItem } from './shared'

function LandingPage({ onLogin, onSignup }) {
  const [menuOpen, setMenuOpen] = React.useState(null);
  const [activePlan, setActivePlan] = React.useState('monthly');

  const services = [
    { icon: '🎓', title: 'University Selection', desc: 'Shortlisting the best universities based on your profile, budget, and goals.', price: 'From $149' },
    { icon: '📄', title: 'SOP & Essays', desc: 'Expert review and editing of your statement of purpose and application essays.', price: 'From $99' },
    { icon: '✈️', title: 'Visa Support', desc: 'Step-by-step student visa documentation guidance for UK, Canada, Australia and more.', price: 'From $199' },
    { icon: '🏠', title: 'Accommodation Help', desc: 'Finding verified student housing near your campus before you arrive.', price: 'From $79' },
    { icon: '💼', title: 'Career Services', desc: 'CV building, LinkedIn optimisation and job search strategy for international students.', price: 'From $129' },
    { icon: '🗂️', title: 'Full Application', desc: 'End-to-end support from shortlisting to visa approval with a dedicated consultant.', price: 'From $599' },
  ];

  const steps = [
    { n: '01', title: 'Create your profile', desc: 'Tell us your academic background, target country and timeline.' },
    { n: '02', title: 'Choose a service', desc: 'Browse packages or get a free recommendation from our team.' },
    { n: '03', title: 'Work with your consultant', desc: 'Collaborate securely via our platform — share documents, chat, track progress.' },
    { n: '04', title: 'Achieve your goal', desc: 'Get your offer letter, visa approved and land in your dream destination.' },
  ];

  const plans = [
    {
      name: 'Starter', price: { monthly: '$49', yearly: '$39' }, period: '/mo',
      desc: 'Perfect for early explorers',
      features: ['1 active service at a time', 'Document storage (2 GB)', 'Email support', 'Progress tracker'],
      cta: 'Get Started', highlight: false,
    },
    {
      name: 'Scholar', price: { monthly: '$129', yearly: '$99' }, period: '/mo',
      desc: 'Most popular for full applications',
      features: ['3 active services', 'Dedicated consultant', 'Document storage (20 GB)', 'Priority support', 'Visa checklist tool', 'Offer letter tracker'],
      cta: 'Start Free Trial', highlight: true,
    },
    {
      name: 'Elite', price: { monthly: '$299', yearly: '$239' }, period: '/mo',
      desc: 'White-glove end-to-end support',
      features: ['Unlimited services', 'Senior consultant', 'Unlimited storage', '24/7 WhatsApp support', 'Mock interviews', 'Airport pickup coordination'],
      cta: 'Contact Sales', highlight: false,
    },
  ];

  const testimonials = [
    { name: 'Aisha Rahman', country: 'Pakistan → UK', text: 'Got into University of Manchester with full scholarship. YouSafe guided me through every step of the process.', rating: 5 },
    { name: 'Carlos Mendez', country: 'Colombia → Canada', text: 'Visa got approved in 3 weeks. My consultant was incredibly thorough and I always knew what to do next.', rating: 5 },
    { name: 'Priya Sharma', country: 'India → Australia', text: 'The SOP review was game-changing. I had 4 rejections before and got 3 offers after their help.', rating: 5 },
  ];

  const navLinks = ['Services', 'How It Works', 'Pricing', 'About'];
  const signInOptions = [
    { label: 'Student', description: 'Access services, orders, wallet, and documents.', lane: 'student' },
    { label: 'Consultant', description: 'Manage assigned students, orders, and payouts.', lane: 'consultant' },
  ];

  const openSignIn = lane => {
    setMenuOpen(null);
    onLogin?.(lane);
  };

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: 'inherit', minHeight: '100vh' }}>
      {/* NAV */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(8,12,16,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="logo.png" style={{ height: '36px', filter: 'invert(1)' }} alt="YouSafe" />
          </div>
          <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
            {navLinks.map(l => (
              <a key={l} href="#" style={{ color: C.textMuted, fontSize: '14px', textDecoration: 'none', fontWeight: 500 }}>{l}</a>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => setMenuOpen(open => open === 'nav' ? null : 'nav')}
                aria-haspopup="menu"
                aria-expanded={menuOpen === 'nav'}
              >
                Sign in ▾
              </Btn>
              {menuOpen === 'nav' && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 10px)',
                    right: 0,
                    width: '260px',
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: '12px',
                    boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
                    padding: '8px',
                    zIndex: 500,
                  }}
                >
                  {signInOptions.map(option => (
                    <button
                      key={option.lane}
                      role="menuitem"
                      onClick={() => openSignIn(option.lane)}
                      style={{
                        width: '100%',
                        display: 'block',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '12px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        color: C.text,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.surface2 }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 800 }}>{option.label} sign in</div>
                      <div style={{ marginTop: '4px', fontSize: '12px', lineHeight: 1.45, color: C.textMuted }}>{option.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Btn variant="primary" size="sm" onClick={onSignup}>Sign up free</Btn>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '100px 24px 80px', textAlign: 'center', position: 'relative' }}>
        {/* Glow */}
        <div style={{
          position: 'absolute', top: '40px', left: '50%', transform: 'translateX(-50%)',
          width: '600px', height: '300px',
          background: 'radial-gradient(ellipse, rgba(34,211,238,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <Badge color="cyan" style={{ marginBottom: '24px', fontSize: '13px', padding: '6px 16px' }}>
          🌍 Trusted by 2,400+ students worldwide
        </Badge>
        <h1 style={{
          fontSize: 'clamp(38px, 5vw, 68px)', fontWeight: 800, lineHeight: 1.1,
          marginBottom: '24px', letterSpacing: '-1.5px',
        }}>
          Your journey abroad,<br />
          <span style={{ color: C.cyan }}>guided every step.</span>
        </h1>
        <p style={{ fontSize: '18px', color: C.textMuted, maxWidth: '560px', margin: '0 auto 40px', lineHeight: 1.7 }}>
          YouSafe connects international students with expert consultants for university applications, visas, accommodation, and beyond.
        </p>
        <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn variant="primary" size="xl" onClick={onSignup}>Get started free</Btn>
          <Btn variant="secondary" size="xl">See how it works</Btn>
        </div>
        <div style={{ marginTop: '60px', display: 'flex', gap: '48px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['2,400+', 'Students helped'], ['94%', 'Visa success rate'], ['180+', 'Universities'], ['48h', 'Avg first response']].map(([v, l]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 800, color: C.cyan }}>{v}</div>
              <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '4px' }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* SERVICES */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <h2 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '12px', letterSpacing: '-0.5px' }}>Everything you need to study abroad</h2>
          <p style={{ color: C.textMuted, fontSize: '16px' }}>Expert services for every stage of your international journey.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {services.map(s => (
            <Card key={s.title} hover style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '32px' }}>{s.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>{s.title}</div>
                <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.6 }}>{s.desc}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                <span style={{ color: C.cyan, fontWeight: 700, fontSize: '14px' }}>{s.price}</span>
                <Btn variant="ghost" size="sm" onClick={onSignup}>Learn more →</Btn>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <h2 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '12px', letterSpacing: '-0.5px' }}>How YouSafe works</h2>
            <p style={{ color: C.textMuted, fontSize: '16px' }}>From first consultation to arriving at your university.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '32px' }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '14px',
                  background: `${C.cyan}18`, border: `1px solid ${C.cyan}33`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 800, color: C.cyan,
                }}>{s.n}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>{s.title}</div>
                  <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '12px', letterSpacing: '-0.5px' }}>Simple, transparent pricing</h2>
          <p style={{ color: C.textMuted, fontSize: '16px', marginBottom: '24px' }}>Save up to 25% with annual billing.</p>
          <div style={{ display: 'inline-flex', background: C.surface2, borderRadius: '10px', padding: '4px', border: `1px solid ${C.border}` }}>
            {['monthly', 'yearly'].map(p => (
              <button key={p} onClick={() => setActivePlan(p)} style={{
                padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: activePlan === p ? C.cyan : 'transparent',
                color: activePlan === p ? '#000' : C.textMuted,
                fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.2s',
              }}>{p === 'monthly' ? 'Monthly' : 'Yearly  🎉'}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px', alignItems: 'start' }}>
          {plans.map(p => (
            <div key={p.name} style={{
              background: p.highlight ? `linear-gradient(135deg, ${C.surface} 0%, ${C.surface2} 100%)` : C.surface,
              border: `1px solid ${p.highlight ? C.cyan : C.border}`,
              borderRadius: '20px', padding: '32px',
              boxShadow: p.highlight ? `0 0 40px ${C.cyanGlow}` : undefined,
              position: 'relative', overflow: 'hidden',
            }}>
              {p.highlight && (
                <div style={{
                  position: 'absolute', top: '16px', right: '16px',
                  background: C.cyan, color: '#000', fontSize: '11px', fontWeight: 800,
                  padding: '3px 10px', borderRadius: '99px',
                }}>POPULAR</div>
              )}
              <div style={{ marginBottom: '8px', fontSize: '18px', fontWeight: 800 }}>{p.name}</div>
              <div style={{ color: C.textMuted, fontSize: '13px', marginBottom: '20px' }}>{p.desc}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '24px' }}>
                <span style={{ fontSize: '40px', fontWeight: 800, color: p.highlight ? C.cyan : C.text }}>{p.price[activePlan]}</span>
                <span style={{ color: C.textMuted, fontSize: '14px' }}>{p.period}</span>
              </div>
              <Btn variant={p.highlight ? 'primary' : 'secondary'} fullWidth onClick={onSignup}>{p.cta}</Btn>
              <Divider style={{ margin: '24px 0' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {p.features.map(f => (
                  <div key={f} style={{ display: 'flex', gap: '10px', fontSize: '14px', color: C.textMuted }}>
                    <span style={{ color: C.green }}>✓</span> {f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 24px' }}>
          <h2 style={{ fontSize: '36px', fontWeight: 800, textAlign: 'center', marginBottom: '48px', letterSpacing: '-0.5px' }}>
            Students who made it
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
            {testimonials.map(t => (
              <Card key={t.name} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ color: C.cyan, fontSize: '20px' }}>{'★'.repeat(t.rating)}</div>
                <p style={{ color: C.text, fontSize: '15px', lineHeight: 1.7, flex: 1 }}>"{t.text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Avatar name={t.name} size={40} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>{t.name}</div>
                    <div style={{ color: C.textMuted, fontSize: '12px' }}>{t.country}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FOOTER */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{
          background: `linear-gradient(135deg, ${C.surface} 0%, rgba(34,211,238,0.05) 100%)`,
          border: `1px solid ${C.cyan}33`, borderRadius: '24px', padding: '64px',
          boxShadow: `0 0 60px ${C.cyanGlow}`,
        }}>
          <h2 style={{ fontSize: '40px', fontWeight: 800, marginBottom: '16px', letterSpacing: '-0.5px' }}>
            Ready to start your journey?
          </h2>
          <p style={{ color: C.textMuted, fontSize: '16px', marginBottom: '32px' }}>
            Join thousands of students who got into their dream universities with YouSafe.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center' }}>
            <Btn variant="primary" size="xl" onClick={onSignup}>Create free account</Btn>
            <div style={{ position: 'relative' }}>
              <Btn variant="outline" size="xl" onClick={() => setMenuOpen(open => open === 'footer' ? null : 'footer')}>I already have an account</Btn>
              {menuOpen === 'footer' && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: 'calc(100% + 12px)',
                    transform: 'translateX(-50%)',
                    width: '280px',
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: '12px',
                    boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
                    padding: '8px',
                    zIndex: 500,
                  }}
                >
                  {signInOptions.map(option => (
                    <button
                      key={option.lane}
                      role="menuitem"
                      onClick={() => openSignIn(option.lane)}
                      style={{
                        width: '100%',
                        display: 'block',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '12px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        color: C.text,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.surface2 }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 800 }}>{option.label} sign in</div>
                      <div style={{ marginTop: '4px', fontSize: '12px', lineHeight: 1.45, color: C.textMuted }}>{option.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '32px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <img src="logo.png" style={{ height: '28px', filter: 'invert(1)', opacity: 0.6 }} alt="YouSafe" />
          <div style={{ color: C.textDim, fontSize: '13px' }}>© 2025 YouSafe Consultancy. All rights reserved.</div>
          <div style={{ display: 'flex', gap: '24px' }}>
            {['Privacy', 'Terms', 'Contact'].map(l => (
              <a key={l} href="#" style={{ color: C.textDim, fontSize: '13px', textDecoration: 'none' }}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
