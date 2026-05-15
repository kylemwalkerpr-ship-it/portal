import { UserProfile } from '@clerk/nextjs'

/**
 * /user/security — Clerk-managed account security panel.
 *
 * Embeds Clerk's UserProfile component so the user gets the full
 * security UI in our brand frame:
 *   - Phone number management + SMS OTP verification
 *   - Email management
 *   - Password management
 *   - Two-factor authentication (TOTP via Authy / Google Authenticator /
 *     1Password / etc., plus backup codes)
 *   - Active sessions
 *
 * The Settings → Security tab links here when the user clicks "Verify
 * phone" or "Set up 2FA". On every Settings page read, our profiles row
 * is mirrored from Clerk so verified-phone and 2FA-enabled flags stay
 * in sync app-wide.
 */
export default function SecurityPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F7F5F0',
      padding: '40px 24px',
      display: 'flex',
      justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 880 }}>
        <div style={{ marginBottom: 24 }}>
          <a href="/dashboard?page=settings" style={{ color: '#0E7C8E', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            ← Back to Settings
          </a>
          <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 32, fontWeight: 500, color: '#1A1F2E', margin: '6px 0 4px', letterSpacing: '-.012em' }}>
            Account security.
          </h1>
          <div style={{ fontSize: 13, color: '#5C6070' }}>
            Verify your phone, set up two-factor authentication, manage sessions, and update your password.
          </div>
        </div>
        <UserProfile routing="hash" />
      </div>
    </div>
  )
}
