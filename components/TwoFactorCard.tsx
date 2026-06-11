"use client"

import React from "react"
import { useUser } from "@clerk/nextjs"

/**
 * TwoFactorCard
 *
 * Authenticator-app (TOTP) two-factor authentication setup card.
 * Mirrors PhoneVerificationCard — the whole enrolment happens inside
 * our brand frame, no Clerk modal, no /user redirect.
 *
 * Steps:
 *   1. user.createTOTP() — Clerk generates a secret + URI + base64 QR
 *   2. We show the QR (or the secret as text fallback) so the user
 *      adds it to Google Authenticator / 1Password / Authy / etc.
 *   3. User enters the 6-digit code currently shown in their app
 *   4. user.verifyTOTP({ code }) on success
 *   5. Generate 8 single-use backup codes via createBackupCode()
 *      and show them ONCE for the user to save
 *   6. /api/profile/sync-phone is poked (it also mirrors two_factor
 *      state so the profiles row updates immediately)
 *
 * Disable flow:
 *   - Confirm prompt → user.disableTOTP() → success state
 *
 * Clerk dashboard prerequisite:
 *   User & Authentication → Multi-factor → Authenticator app: enabled
 */

type Mode =
  | "idle"
  | "enrolling"
  | "qr_shown"
  | "verifying"
  | "success"
  | "disabling"

const NAVY = "#0F172A"
const GREEN = "#1A6B45"
const RED = "#8B1A1A"
const BORDER = "#DDD8CE"
const SURFACE = "#FFFFFF"
const SURFACE2 = "#FAFAF7"
const TEXT = "#1A1F2E"
const MUTED = "#5C6070"
const DIM = "#9097A8"
const INDIGO = "#3C3B6E"
const SANS = `var(--portal-font-body, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif)`
const MONO = `'SF Mono', Menlo, Consolas, monospace`

interface CreatedTOTP {
  secret: string
  uri: string
  qrCode?: string
}

export function TwoFactorCard() {
  const { user, isLoaded } = useUser()

  const [mode, setMode] = React.useState<Mode>("idle")
  const [totp, setTotp] = React.useState<CreatedTOTP | null>(null)
  const [code, setCode] = React.useState("")
  const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null)
  const [error, setError] = React.useState("")

  const isEnabled = !!user?.totpEnabled
  const hasBackupCodes = !!user?.backupCodeEnabled

  if (!isLoaded) {
    return <div style={cardBase}><span style={{ color: MUTED, fontSize: 13 }}>Loading…</span></div>
  }

  const startEnrolment = async () => {
    if (!user) return
    setError("")
    setMode("enrolling")
    try {
      // createTOTP returns { secret, uri, qrCode }. qrCode is a base64-
      // encoded PNG (data:image/png;base64,…) — we render it directly.
      const created = await user.createTOTP() as unknown as CreatedTOTP
      setTotp({
        secret: created.secret,
        uri: created.uri,
        qrCode: created.qrCode,
      })
      setMode("qr_shown")
    } catch (err) {
      setError(extractClerkError(err) || "Could not start authenticator setup.")
      setMode("idle")
    }
  }

  const verifyCode = async () => {
    if (!user) return
    setError("")
    if (code.trim().length < 6) { setError("Enter the 6-digit code from your authenticator app."); return }
    setMode("verifying")
    try {
      await user.verifyTOTP({ code: code.trim() })
      // Generate single-use backup codes immediately so the user has
      // a recovery path if they lose their device. They see these
      // exactly once.
      let codes: string[] = []
      try {
        const created = await user.createBackupCode() as unknown as { codes?: string[] }
        codes = Array.isArray(created.codes) ? created.codes : []
      } catch {
        // Backup-code generation is non-fatal — TOTP is still enabled.
      }
      setBackupCodes(codes)
      // Mirror to our profiles row so compliance / settings reflect it.
      fetch("/api/profile/sync-phone", { method: "POST", credentials: "same-origin" }).catch(() => null)
      setMode("success")
      setCode("")
    } catch (err) {
      setError(extractClerkError(err) || "That code didn't match. Try again.")
      setMode("qr_shown")
    }
  }

  const disableTOTP = async () => {
    if (!user) return
    if (!window.confirm("Turn off two-factor authentication? You will sign in with just your password until you re-enable it.")) return
    setMode("disabling")
    setError("")
    try {
      await user.disableTOTP()
      fetch("/api/profile/sync-phone", { method: "POST", credentials: "same-origin" }).catch(() => null)
      setMode("idle")
      setTotp(null)
      setBackupCodes(null)
    } catch (err) {
      setError(extractClerkError(err) || "Could not turn off 2FA.")
      setMode("idle")
    }
  }

  const reset = () => {
    setMode("idle")
    setTotp(null)
    setCode("")
    setBackupCodes(null)
    setError("")
  }

  return (
    <div style={cardBase}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>🔐</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Two-factor authentication</div>
          <div style={{ fontSize: 12, color: MUTED }}>
            {isEnabled
              ? "Your account is protected by an authenticator app. You’ll be asked for a code on every new sign-in."
              : "Add a one-time code from Google Authenticator, 1Password, Authy, or any TOTP app."}
          </div>
        </div>
        {isEnabled && <Pill color={GREEN}>✓ Enabled</Pill>}
      </div>

      {/* SUCCESS — backup codes shown once */}
      {mode === "success" && (
        <div style={{ padding: 12, background: `${GREEN}10`, border: `1px solid ${GREEN}33`, borderRadius: 8, marginBottom: 10 }}>
          <div style={{ fontWeight: 700, color: GREEN, fontSize: 13 }}>✓ Two-factor enabled</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.55 }}>
            Save these backup codes somewhere safe — each one works exactly once if you lose your authenticator device.
            You won&apos;t see them again.
          </div>
          {backupCodes && backupCodes.length > 0 ? (
            <div style={{
              marginTop: 10,
              padding: "10px 12px",
              background: SURFACE,
              border: `1px dashed ${GREEN}55`,
              borderRadius: 6,
              fontFamily: MONO,
              fontSize: 13,
              color: TEXT,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4px 16px",
              letterSpacing: 1,
            }}>
              {backupCodes.map((c, i) => <div key={i}>{c}</div>)}
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 12, color: DIM }}>
              Backup codes can be generated from /user/security if you didn&apos;t get them just now.
            </div>
          )}
          {backupCodes && backupCodes.length > 0 && (
            <button
              onClick={() => {
                const text = backupCodes.join("\n")
                navigator.clipboard.writeText(text).catch(() => null)
              }}
              style={ghostBtn}
            >
              Copy all to clipboard
            </button>
          )}
          <button onClick={reset} style={{ ...ghostBtn, marginLeft: 8 }}>I&apos;ve saved them</button>
        </div>
      )}

      {/* IDLE (enabled OR disabled) */}
      {(mode === "idle" || mode === "enrolling" || mode === "disabling") && (
        <div>
          {error && <div style={errorBox}>{error}</div>}
          {isEnabled ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href="/user/security" style={{ textDecoration: "none" }}>
                <button style={secondaryBtn(false)}>Manage / regenerate backup codes</button>
              </a>
              <button onClick={disableTOTP} disabled={mode === "disabling"} style={dangerBtn(mode === "disabling")}>
                {mode === "disabling" ? "Turning off…" : "Turn off 2FA"}
              </button>
            </div>
          ) : (
            <button onClick={startEnrolment} disabled={mode === "enrolling"} style={primaryBtn(mode === "enrolling")}>
              {mode === "enrolling" ? "Generating…" : "Set up authenticator app"}
            </button>
          )}
          {!isEnabled && hasBackupCodes && (
            <div style={{ marginTop: 8, fontSize: 11, color: DIM }}>
              You have backup codes from a previous enrolment. They become active again when you re-enable 2FA.
            </div>
          )}
        </div>
      )}

      {/* QR / SECRET DISPLAY + CODE ENTRY */}
      {(mode === "qr_shown" || mode === "verifying") && totp && (
        <div>
          <div style={{ fontSize: 12, color: TEXT, marginBottom: 10, lineHeight: 1.55 }}>
            <strong>Step 1.</strong> Scan this QR with your authenticator app (Google Authenticator, 1Password, Authy, etc.).
            Or paste the secret manually.
          </div>
          {totp.qrCode ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={totp.qrCode}
              alt="Authenticator QR code"
              style={{
                width: 168, height: 168,
                background: SURFACE, padding: 8,
                border: `1px solid ${BORDER}`, borderRadius: 8,
                display: "block",
              }}
            />
          ) : null}
          <div style={{ marginTop: 10 }}>
            <label style={label}>Secret (if scanning fails)</label>
            <div style={{
              fontFamily: MONO, fontSize: 13,
              padding: "8px 12px",
              background: SURFACE2,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              color: TEXT,
              wordBreak: "break-all" as const,
              userSelect: "all" as const,
            }}>
              {totp.secret}
            </div>
          </div>

          <div style={{ fontSize: 12, color: TEXT, margin: "16px 0 10px", lineHeight: 1.55 }}>
            <strong>Step 2.</strong> Enter the 6-digit code currently shown in your authenticator app.
          </div>
          <label style={label}>Verification code</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            autoFocus
            disabled={mode === "verifying"}
            style={{ ...input, fontFamily: MONO, fontSize: 20, letterSpacing: 6, textAlign: "center" }}
          />
          {error && <div style={errorBox}>{error}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={verifyCode} disabled={mode === "verifying" || code.length < 6} style={primaryBtn(mode === "verifying" || code.length < 6)}>
              {mode === "verifying" ? "Verifying…" : "Verify & enable"}
            </button>
            <button onClick={reset} disabled={mode === "verifying"} style={ghostBtn}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────
function extractClerkError(err: unknown): string | null {
  if (!err) return null
  if (typeof err === "string") return err
  const e = err as { errors?: Array<{ long_message?: string; message?: string }>; message?: string }
  const fromErrors = e.errors?.[0]?.long_message || e.errors?.[0]?.message
  if (fromErrors) return fromErrors
  return e.message || null
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 9px", borderRadius: 4, fontSize: 10, fontWeight: 700,
      letterSpacing: ".04em", textTransform: "uppercase",
      background: `${color}15`, color,
    }}>
      {children}
    </span>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────
const cardBase: React.CSSProperties = {
  background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10,
  padding: "16px 18px", fontFamily: SANS, color: TEXT,
}
const label: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
  textTransform: "uppercase", color: MUTED, fontFamily: MONO, marginBottom: 6,
}
const input: React.CSSProperties = {
  width: "100%", padding: "9px 12px", fontSize: 14, fontFamily: SANS,
  border: `1px solid ${BORDER}`, borderRadius: 6, background: SURFACE2, color: TEXT,
  outline: "none", boxSizing: "border-box",
}
const errorBox: React.CSSProperties = {
  marginTop: 8, padding: "8px 12px", background: `${RED}10`, color: RED,
  border: `1px solid ${RED}33`, borderRadius: 6, fontSize: 12, fontWeight: 600,
}
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  marginTop: 6, padding: "9px 18px", fontSize: 13, fontWeight: 700,
  background: disabled ? "#A0A8B5" : INDIGO, color: "#fff", border: "none",
  borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer", fontFamily: SANS,
})
const secondaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: "9px 18px", fontSize: 13, fontWeight: 700,
  background: SURFACE2, color: disabled ? DIM : TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 6,
  cursor: disabled ? "not-allowed" : "pointer", fontFamily: SANS,
})
const dangerBtn = (disabled: boolean): React.CSSProperties => ({
  padding: "9px 18px", fontSize: 13, fontWeight: 700,
  background: "transparent", color: disabled ? DIM : RED,
  border: `1px solid ${RED}40`, borderRadius: 6,
  cursor: disabled ? "not-allowed" : "pointer", fontFamily: SANS,
})
const ghostBtn: React.CSSProperties = {
  marginTop: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600,
  background: "transparent", color: MUTED, border: `1px solid ${BORDER}`,
  borderRadius: 5, cursor: "pointer", fontFamily: SANS,
}
// Suppress unused: NAVY is reserved for future variants.
void NAVY
