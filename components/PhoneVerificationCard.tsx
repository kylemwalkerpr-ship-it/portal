"use client"

import React from "react"
import { useUser } from "@clerk/nextjs"

/**
 * PhoneVerificationCard
 *
 * In-app phone verification using Clerk's React SDK. Runs the entire flow
 * inside our brand frame — no Clerk modal, no /user redirect.
 *
 * Steps:
 *   1. User types a phone number (or picks an unverified one already on
 *      their Clerk account).
 *   2. Component calls phoneNumber.prepareVerification({ strategy: 'phone_code' }).
 *      Clerk sends an SMS OTP via the configured Twilio account.
 *   3. User enters the 6-digit code.
 *   4. Component calls phoneNumber.attemptVerification({ code }). On success,
 *      promotes the phone to primary so it becomes the canonical contact.
 *   5. /api/profile/sync-phone is poked so our profiles row updates immediately
 *      (the Settings GET also syncs via Clerk on every read, but this gives
 *      instant feedback in the current session).
 *
 * Errors handled inline:
 *   - duplicate number on a different account
 *   - invalid format
 *   - wrong code (still allows retry up to Clerk's rate limit)
 *   - SMS not yet sent (re-send button after 30s cooldown)
 *
 * Requires Clerk dashboard config:
 *   User & Authentication → Email, Phone, Username
 *     → Phone number: enabled as either an identifier OR a contact field
 *     → "Verify at sign-up" toggle does NOT need to be on for this flow
 */

type Mode = "idle" | "sending" | "code_sent" | "verifying" | "success"

const NAVY = "#1B2D4F"
const GREEN = "#1A6B45"
const RED = "#8B1A1A"
const AMBER = "#8B5E0A"
const BORDER = "#DDD8CE"
const SURFACE = "#FFFFFF"
const SURFACE2 = "#FAFAF7"
const TEXT = "#1A1F2E"
const MUTED = "#5C6070"
const DIM = "#9097A8"
const SANS = `-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO = `'SF Mono', Menlo, Consolas, monospace`

export function PhoneVerificationCard() {
  const { user, isLoaded } = useUser()

  const [mode, setMode] = React.useState<Mode>("idle")
  const [phoneInput, setPhoneInput] = React.useState("")
  const [activePhoneId, setActivePhoneId] = React.useState<string | null>(null)
  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState("")
  const [cooldown, setCooldown] = React.useState(0)

  // Snapshot the user's existing Clerk phone numbers
  const primaryId = user?.primaryPhoneNumberId
  const phones = user?.phoneNumbers || []
  const primary = phones.find(p => p.id === primaryId)
  const isVerified = primary?.verification?.status === "verified"

  // Cooldown ticker
  React.useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // Pre-fill the input with the primary number if the user has one
  React.useEffect(() => {
    if (!phoneInput && primary?.phoneNumber) setPhoneInput(primary.phoneNumber)
  }, [primary?.phoneNumber, phoneInput])

  if (!isLoaded) {
    return <div style={cardBase}><span style={{ color: MUTED, fontSize: 13 }}>Loading…</span></div>
  }

  /** Send (or resend) the OTP. */
  const sendOtp = async () => {
    setError("")
    const raw = phoneInput.trim()
    if (!raw) { setError("Enter a phone number first."); return }
    if (!user) { setError("Sign in expired — please refresh."); return }

    setMode("sending")
    try {
      // 1. Find existing phoneNumber object on this Clerk user, or create one
      let phoneObj = phones.find(p => p.phoneNumber === raw)
      if (!phoneObj) {
        phoneObj = await user.createPhoneNumber({ phoneNumber: raw })
      }
      setActivePhoneId(phoneObj.id)

      // 2. Send the SMS code
      await phoneObj.prepareVerification()
      setMode("code_sent")
      setCooldown(30)
    } catch (err: any) {
      setError(extractClerkError(err) || "Could not send the verification code.")
      setMode("idle")
    }
  }

  /** Verify the user-entered code. */
  const verifyCode = async () => {
    setError("")
    if (!code.trim()) { setError("Enter the 6-digit code from your SMS."); return }
    if (!user || !activePhoneId) { setError("Verification expired — start again."); return }

    setMode("verifying")
    try {
      const phoneObj = user.phoneNumbers.find(p => p.id === activePhoneId)
      if (!phoneObj) throw new Error("Phone number not found on your account")
      await phoneObj.attemptVerification({ code: code.trim() })
      // Promote to primary so the rest of the app uses it
      if (user.primaryPhoneNumberId !== phoneObj.id) {
        await user.update({ primaryPhoneNumberId: phoneObj.id })
      }
      // Nudge our profiles row to sync immediately
      fetch("/api/profile/sync-phone", { method: "POST", credentials: "same-origin" }).catch(() => null)
      setMode("success")
    } catch (err: any) {
      setError(extractClerkError(err) || "That code didn't match. Try again.")
      setMode("code_sent")
    }
  }

  const reset = () => {
    setMode("idle")
    setCode("")
    setError("")
    setActivePhoneId(null)
  }

  // ── UI ────────────────────────────────────────────────────────────────
  return (
    <div style={cardBase}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>📱</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Phone verification</div>
          <div style={{ fontSize: 12, color: MUTED }}>
            {isVerified
              ? "Your phone is verified and ready for SMS notifications + 2FA."
              : "Verify your phone via SMS to unlock notifications and two-factor auth."}
          </div>
        </div>
        {isVerified && <Pill color={GREEN}>✓ Verified</Pill>}
      </div>

      {/* Success state — stays sticky until user closes */}
      {mode === "success" && (
        <div style={{ padding: 12, background: `${GREEN}10`, border: `1px solid ${GREEN}33`, borderRadius: 8, marginBottom: 10 }}>
          <div style={{ fontWeight: 700, color: GREEN, fontSize: 13 }}>✓ Phone verified</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
            You can now receive SMS notifications. Set up an authenticator app (Settings → Security) to enable two-factor.
          </div>
          <button onClick={reset} style={ghostBtn}>Done</button>
        </div>
      )}

      {/* Idle / re-enter state */}
      {(mode === "idle" || mode === "sending") && (
        <div>
          <label style={label}>Phone number</label>
          <input
            type="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="+1 555 555 0123"
            disabled={mode === "sending"}
            style={input}
          />
          <div style={{ fontSize: 11, color: DIM, marginTop: 4, fontFamily: MONO }}>
            Include country code. Standard SMS rates may apply.
          </div>
          {error && <div style={errorBox}>{error}</div>}
          <button onClick={sendOtp} disabled={mode === "sending" || !phoneInput.trim()} style={primaryBtn(mode === "sending" || !phoneInput.trim())}>
            {mode === "sending" ? "Sending…" : isVerified ? "Re-verify" : "Send SMS code"}
          </button>
        </div>
      )}

      {/* Code entry state */}
      {(mode === "code_sent" || mode === "verifying") && (
        <div>
          <div style={{ fontSize: 12, color: TEXT, marginBottom: 10, lineHeight: 1.55 }}>
            We sent a 6-digit code to <strong style={{ fontFamily: MONO }}>{phoneInput}</strong>. Enter it below.
          </div>
          <label style={label}>Verification code</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
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
            <button onClick={verifyCode} disabled={mode === "verifying" || code.length < 4} style={primaryBtn(mode === "verifying" || code.length < 4)}>
              {mode === "verifying" ? "Verifying…" : "Verify code"}
            </button>
            <button
              onClick={sendOtp}
              disabled={cooldown > 0 || mode === "verifying"}
              style={secondaryBtn(cooldown > 0 || mode === "verifying")}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
            <button onClick={reset} disabled={mode === "verifying"} style={ghostBtn}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────
function extractClerkError(err: any): string | null {
  if (!err) return null
  if (typeof err === "string") return err
  const fromErrors = err.errors?.[0]?.long_message || err.errors?.[0]?.message
  if (fromErrors) return fromErrors
  return err.message || null
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
  marginTop: 12, padding: "9px 18px", fontSize: 13, fontWeight: 700,
  background: disabled ? "#A0A8B5" : NAVY, color: "#fff", border: "none",
  borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer", fontFamily: SANS,
})
const secondaryBtn = (disabled: boolean): React.CSSProperties => ({
  marginTop: 0, padding: "9px 18px", fontSize: 13, fontWeight: 700,
  background: SURFACE2, color: disabled ? DIM : TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 6,
  cursor: disabled ? "not-allowed" : "pointer", fontFamily: SANS,
})
const ghostBtn: React.CSSProperties = {
  marginTop: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600,
  background: "transparent", color: MUTED, border: `1px solid ${BORDER}`,
  borderRadius: 5, cursor: "pointer", fontFamily: SANS,
}
