'use client'

import React from 'react'

const COPY = {
  en: {
    title: 'Get the free OPT checklist',
    email: 'Email',
    consent: 'Email me the free OPT checklist. I can unsubscribe at any time.',
    button: 'Send the checklist',
    note: 'No confirmation email is sent yet. Unsubscribe instructions will be in each message.',
    privacy: 'Privacy policy',
    done: 'Saved. We will email the checklist to that address.',
  },
  zh: {
    title: '领取免费 OPT 清单',
    email: '邮箱',
    consent: '请把免费 OPT 清单发到我的邮箱。我可以随时退订。',
    button: '发送清单',
    note: '目前还不会发送确认邮件。每封邮件都会附上退订说明。',
    privacy: '隐私政策',
    done: '已保存。清单会发到这个邮箱。',
  },
} as const

export function EmailOptIn({ locale = 'en', source }: { locale?: 'en' | 'zh'; source: string }) {
  const copy = COPY[locale]
  const [email, setEmail] = React.useState('')
  const [consent, setConsent] = React.useState(false)
  const [status, setStatus] = React.useState<'idle' | 'done' | 'error'>('idle')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setStatus('idle')
    const response = await fetch('/api/marketplace/email-opt-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        consent,
        consentText: copy.consent,
        source,
        company_website: (event.currentTarget.querySelector('[name="company_website"]') as HTMLInputElement | null)?.value || '',
      }),
    })
    setStatus(response.ok ? 'done' : 'error')
  }

  return (
    <form onSubmit={submit} className="wrap" style={{ padding: '28px 0' }}>
      <h2 className="serif" style={{ fontSize: 28, margin: '0 0 12px' }}>{copy.title}</h2>
      <label style={{ display: 'block', marginBottom: 8 }}>
        {copy.email}
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} style={{ display: 'block', width: 'min(420px, 100%)', marginTop: 6, padding: 10 }} />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', maxWidth: 640 }}>
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
        <span>{copy.consent}</span>
      </label>
      <input name="company_website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }} />
      <p style={{ fontSize: 13, maxWidth: 640 }}>
        {copy.note}{' '}
        <a href="https://legal.yousafeconsultancy.com/privacy/">{copy.privacy}</a>
      </p>
      <button type="submit" disabled={!consent} style={{ minHeight: 44, padding: '10px 16px' }}>{copy.button}</button>
      {status === 'done' && <p>{copy.done}</p>}
      {status === 'error' && <p>Could not save that signup.</p>}
    </form>
  )
}
