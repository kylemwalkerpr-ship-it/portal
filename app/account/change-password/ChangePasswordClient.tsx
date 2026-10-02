'use client'
/**
 * Forced first-sign-in password change. Works for username-only accounts:
 * no email code, no reset link — the user proves the temporary password and
 * sets a new one via Clerk `user.updatePassword()`; the server then clears
 * `publicMetadata.mustChangePassword` after verifying the change.
 */
import { useState } from 'react'
import { useReverification, useSession, useUser } from '@clerk/nextjs'
import { YS_BRAND } from '@/lib/auth/ysClerkAppearance'

const input: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 8, border: `1px solid ${YS_BRAND.rule}`,
  background: YS_BRAND.cream, color: YS_BRAND.ink, fontSize: 16, boxSizing: 'border-box', font: 'inherit',
}
const label: React.CSSProperties = { display: 'block', fontWeight: 700, fontSize: 14, margin: '14px 0 6px', color: YS_BRAND.ink }

function clerkErrorMessage(error: any): string {
  const first = error?.errors?.[0]
  return first?.longMessage || first?.message || error?.message || 'Could not update your password.'
}

export default function ChangePasswordClient({ returnTo }: { returnTo: string }) {
  const { user, isLoaded } = useUser()
  const { session } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const updatePassword = useReverification((params: { currentPassword: string; newPassword: string }) =>
    user!.updatePassword({ ...params, signOutOfOtherSessions: true }),
  )

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get('current_password') ?? '')
    const newPassword = String(form.get('new_password') ?? '')
    const confirm = String(form.get('confirm_password') ?? '')
    setError(null)
    if (newPassword.length < 8) return setError('Use at least 8 characters.')
    if (newPassword !== confirm) return setError('The new passwords do not match.')
    if (newPassword === currentPassword) return setError('Choose a password different from the temporary one.')
    setBusy(true)
    try {
      await updatePassword({ currentPassword, newPassword })
      const res = await fetch('/api/account/password', { method: 'POST', credentials: 'same-origin' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || 'Password changed, but we could not finish setup. Please reload.')
      }
      // Refresh the session token so the ys_mcp claim drops before navigating.
      await user.reload().catch(() => undefined)
      await session?.getToken({ skipCache: true }).catch(() => undefined)
      window.location.assign(returnTo)
    } catch (e) {
      setError(clerkErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: YS_BRAND.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 16, border: `1px solid ${YS_BRAND.rule}`, padding: 28, boxShadow: '0 24px 70px rgba(29,36,51,0.10)' }}>
        <div style={{ height: 4, borderRadius: 4, background: `linear-gradient(90deg, ${YS_BRAND.navy} 0 50%, ${YS_BRAND.red} 50% 100%)`, marginBottom: 20 }} />
        <img src="/logo.png" alt="YouSafe" width={44} height={44} style={{ borderRadius: 10, marginBottom: 12 }} />
        <h1 style={{ margin: '0 0 6px', fontSize: 24, color: YS_BRAND.ink }}>Set your own password</h1>
        <p style={{ margin: '0 0 8px', color: YS_BRAND.inkSoft, lineHeight: 1.6 }}>
          {user?.username ? <>You are signed in as <strong>{user.username}</strong>. </> : null}
          For your security, replace the temporary password you were given before continuing.
        </p>
        <form onSubmit={onSubmit} noValidate>
          <input type="text" name="username" autoComplete="username" value={user?.username ?? ''} readOnly hidden />
          <label style={label} htmlFor="current_password">Temporary password</label>
          <input id="current_password" name="current_password" type="password" autoComplete="current-password" required style={input} />
          <label style={label} htmlFor="new_password">New password</label>
          <input id="new_password" name="new_password" type="password" autoComplete="new-password" required minLength={8} style={input} />
          <label style={label} htmlFor="confirm_password">Confirm new password</label>
          <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required minLength={8} style={input} />
          {error && <p role="alert" style={{ color: YS_BRAND.red, fontSize: 14, marginTop: 12 }}>{error}</p>}
          <button type="submit" disabled={busy || !isLoaded} style={{ marginTop: 20, width: '100%', padding: 13, borderRadius: 10, border: 0, background: YS_BRAND.navy, color: '#fff', fontWeight: 800, fontSize: 16, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      </div>
    </main>
  )
}
