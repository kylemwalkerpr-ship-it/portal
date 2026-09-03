/**
 * SuperGrok / X Premium+ OAuth for Content Studio.
 *
 * Authenticates Grok against api.x.ai using the official xAI device-code
 * flow (auth.x.ai) — the same subscription login used by Grok CLI, OpenClaw,
 * and Hermes. No XAI_API_KEY is required once the admin completes browser
 * consent with an eligible SuperGrok or X Premium+ account.
 *
 * Tokens live in ai_settings (admin DB) and are refreshed before generation.
 * Same precedence as Grok CLI (`~/.grok/auth.json`): a live SuperGrok session
 * beats a console `XAI_API_KEY`. The metered team key is only used when
 * SuperGrok is disconnected or the refresh token is dead.
 */

import {
  deleteAiSetting,
  getAiSettings,
  setAiSetting,
} from '@/lib/aiKeyVault'

/** Public Grok CLI / Grok Build client — same id OpenClaw and Hermes use. */
export const XAI_OAUTH_CLIENT_ID_DEFAULT = 'b1a00492-073a-47ea-816f-4c329264a828'
export const XAI_OAUTH_ISSUER_DEFAULT = 'https://auth.x.ai'
export const XAI_API_BASE_DEFAULT = 'https://api.x.ai/v1'
export const XAI_OAUTH_SCOPE_DEFAULT =
  'openid profile email offline_access grok-cli:access api:access'
export const XAI_DEFAULT_MODEL = 'grok-4.6'

const SETTING = {
  access: 'xai_oauth_access_token',
  refresh: 'xai_oauth_refresh_token',
  expires: 'xai_oauth_expires_at',
  type: 'xai_oauth_token_type',
  pending: 'xai_oauth_pending',
} as const

const SKEW_MS = 60_000

export interface SuperGrokDeviceStart {
  userCode: string
  verificationUri: string
  verificationUriComplete: string | null
  expiresIn: number
  interval: number
}

export interface SuperGrokStatus {
  connected: boolean
  pending: boolean
  expiresAt: number | null
  userCode: string | null
  verificationUri: string | null
  verificationUriComplete: string | null
  interval: number | null
  model: string
  clientConfigured: boolean
}

export interface SuperGrokAccess {
  accessToken: string
  expiresAt: number
  authMode: 'supergrok'
}

interface PendingDevice {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string | null
  expires_at: number
  interval: number
}

interface TokenSet {
  access_token: string
  refresh_token?: string
  expires_at: number
  token_type?: string
}

export function xaiOAuthClientId(): string {
  return (
    process.env.XAI_OAUTH_CLIENT_ID?.trim() ||
    XAI_OAUTH_CLIENT_ID_DEFAULT
  )
}

export function xaiOAuthIssuer(): string {
  return (process.env.XAI_OAUTH_ISSUER?.trim() || XAI_OAUTH_ISSUER_DEFAULT).replace(/\/+$/, '')
}

export function xaiOAuthScope(): string {
  return process.env.XAI_OAUTH_SCOPE?.trim() || XAI_OAUTH_SCOPE_DEFAULT
}

export function isAccessTokenFresh(expiresAt: number, now = Date.now()): boolean {
  return Number.isFinite(expiresAt) && expiresAt - SKEW_MS > now
}

function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString()
}

async function postForm(url: string, fields: Record<string, string>): Promise<{
  status: number
  json: Record<string, unknown>
  text: string
}> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'YouSafe-ContentStudio/1.0 (SuperGrok OAuth)',
    },
    body: formBody(fields),
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    json = { error: text.slice(0, 240) }
  }
  return { status: res.status, json, text }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function parsePendingSetting(raw: string | null | undefined): PendingDevice | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as PendingDevice
    if (!parsed?.device_code || !parsed.user_code || !parsed.verification_uri) return null
    return parsed
  } catch {
    return null
  }
}

function tokensFromResponse(json: Record<string, unknown>, now = Date.now()): TokenSet {
  const access = asString(json.access_token)
  if (!access) {
    throw new Error(asString(json.error_description) || asString(json.error) || 'xAI OAuth returned no access token')
  }
  const expiresIn = asNumber(json.expires_in, 3600)
  return {
    access_token: access,
    refresh_token: asString(json.refresh_token) || undefined,
    expires_at: now + Math.max(30, expiresIn) * 1000,
    token_type: asString(json.token_type) || 'Bearer',
  }
}

async function persistTokens(tokens: TokenSet, updatedBy = 'admin'): Promise<void> {
  await setAiSetting(SETTING.access, tokens.access_token, updatedBy)
  if (tokens.refresh_token) {
    await setAiSetting(SETTING.refresh, tokens.refresh_token, updatedBy)
  }
  await setAiSetting(SETTING.expires, String(tokens.expires_at), updatedBy)
  await setAiSetting(SETTING.type, tokens.token_type || 'Bearer', updatedBy)
  await deleteAiSetting(SETTING.pending)
}

export async function getSuperGrokStatus(): Promise<SuperGrokStatus> {
  const settings = await getAiSettings(true)
  const pending = parsePendingSetting(settings.xai_oauth_pending)
  const expiresAt = Number(settings.xai_oauth_expires_at || 0) || null
  const connected = Boolean(
    settings.xai_oauth_access_token?.trim() || settings.xai_oauth_refresh_token?.trim(),
  )
  const pendingLive = Boolean(pending && pending.expires_at > Date.now())
  return {
    connected,
    pending: pendingLive,
    expiresAt: connected ? expiresAt : null,
    userCode: pendingLive ? pending!.user_code : null,
    verificationUri: pendingLive ? pending.verification_uri : null,
    verificationUriComplete: pendingLive ? pending.verification_uri_complete || null : null,
    interval: pendingLive ? pending.interval : null,
    model: settings.default_model?.trim() || process.env.XAI_MODEL?.trim() || XAI_DEFAULT_MODEL,
    clientConfigured: Boolean(xaiOAuthClientId()),
  }
}

export async function startSuperGrokDeviceLogin(updatedBy = 'admin'): Promise<SuperGrokDeviceStart> {
  const { status, json, text } = await postForm(`${xaiOAuthIssuer()}/oauth2/device/code`, {
    client_id: xaiOAuthClientId(),
    scope: xaiOAuthScope(),
  })
  if (status >= 400) {
    throw new Error(
      `SuperGrok login could not start (${status}): ${asString(json.error_description) || asString(json.error) || text.slice(0, 240)}`,
    )
  }
  const userCode = asString(json.user_code)
  const deviceCode = asString(json.device_code)
  const verificationUri =
    asString(json.verification_uri) ||
    asString(json.verification_uri_complete) ||
    `${xaiOAuthIssuer()}/device`
  if (!userCode || !deviceCode) {
    throw new Error('xAI device-code response was missing user_code or device_code')
  }
  const expiresIn = asNumber(json.expires_in, 900)
  const interval = Math.max(2, asNumber(json.interval, 5))
  const pending: PendingDevice = {
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: asString(json.verification_uri_complete) || null,
    expires_at: Date.now() + expiresIn * 1000,
    interval,
  }
  await setAiSetting(SETTING.pending, JSON.stringify(pending), updatedBy)
  return {
    userCode,
    verificationUri,
    verificationUriComplete: pending.verification_uri_complete || null,
    expiresIn,
    interval,
  }
}

export async function pollSuperGrokDeviceLogin(updatedBy = 'admin'): Promise<{
  connected: boolean
  pending: boolean
  error?: string
}> {
  const settings = await getAiSettings(true)
  const pending = parsePendingSetting(settings.xai_oauth_pending)
  if (!pending) {
    const connected = Boolean(settings.xai_oauth_access_token?.trim())
    return { connected, pending: false, error: connected ? undefined : 'No SuperGrok login in progress' }
  }
  if (pending.expires_at <= Date.now()) {
    await deleteAiSetting(SETTING.pending)
    return { connected: false, pending: false, error: 'SuperGrok login timed out — start again' }
  }

  const { status, json } = await postForm(`${xaiOAuthIssuer()}/oauth2/token`, {
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: pending.device_code,
    client_id: xaiOAuthClientId(),
  })
  const err = asString(json.error)
  if (err === 'authorization_pending' || status === 428) {
    return { connected: false, pending: true }
  }
  if (err === 'slow_down') {
    return { connected: false, pending: true, error: 'xAI asked us to poll more slowly' }
  }
  if (err === 'expired_token' || err === 'access_denied') {
    await deleteAiSetting(SETTING.pending)
    return {
      connected: false,
      pending: false,
      error: err === 'access_denied' ? 'SuperGrok login was denied' : 'SuperGrok login expired — start again',
    }
  }
  if (status >= 400) {
    return {
      connected: false,
      pending: true,
      error: asString(json.error_description) || err || `xAI token poll failed (${status})`,
    }
  }

  const tokens = tokensFromResponse(json)
  await persistTokens(tokens, updatedBy)
  await setAiSetting('default_model', XAI_DEFAULT_MODEL, updatedBy)
  return { connected: true, pending: false }
}

export async function refreshSuperGrokToken(refreshToken: string): Promise<TokenSet> {
  const { status, json, text } = await postForm(`${xaiOAuthIssuer()}/oauth2/token`, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: xaiOAuthClientId(),
  })
  if (status >= 400) {
    const message = asString(json.error_description) || asString(json.error) || text.slice(0, 240)
    throw new Error(`SuperGrok token refresh failed (${status}): ${message}`)
  }
  return tokensFromResponse({ ...json, refresh_token: asString(json.refresh_token) || refreshToken })
}

/**
 * Grok CLI parity: interactive SuperGrok session wins over a console API key.
 * `XAI_API_KEY` (Worker secret / vault `xai-…` key) is fallback only.
 */
export function overlayGrokAuth(
  overlay: Record<string, string>,
  oauth: SuperGrokAccess | null,
): Record<string, string> {
  if (!oauth?.accessToken) return overlay
  const next = { ...overlay }
  next.XAI_API_KEY = oauth.accessToken
  next.XAI_AUTH_MODE = 'supergrok'
  if (!next.XAI_MODEL) next.XAI_MODEL = XAI_DEFAULT_MODEL
  return next
}

export async function ensureSuperGrokAccessToken(): Promise<SuperGrokAccess | null> {
  const settings = await getAiSettings(true)
  const access = settings.xai_oauth_access_token?.trim() || ''
  const refresh = settings.xai_oauth_refresh_token?.trim() || ''
  const expiresAt = Number(settings.xai_oauth_expires_at || 0)
  if (!access && !refresh) return null
  if (access && isAccessTokenFresh(expiresAt)) {
    return { accessToken: access, expiresAt, authMode: 'supergrok' }
  }
  if (!refresh) {
    // Expired access with no refresh — do not keep minting 403s from a
    // previous SuperGrok session. Let XAI_API_KEY / vault take over.
    return null
  }
  try {
    const tokens = await refreshSuperGrokToken(refresh)
    await persistTokens(tokens, 'oauth-refresh')
    return { accessToken: tokens.access_token, expiresAt: tokens.expires_at, authMode: 'supergrok' }
  } catch (err) {
    console.warn(
      '[superGrok] refresh failed — not reusing the stale access token',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

export async function disconnectSuperGrok(): Promise<void> {
  await Promise.all([
    deleteAiSetting(SETTING.access),
    deleteAiSetting(SETTING.refresh),
    deleteAiSetting(SETTING.expires),
    deleteAiSetting(SETTING.type),
    deleteAiSetting(SETTING.pending),
  ])
}

export function isSuperGrokConnectedFromSettings(settings: {
  xai_oauth_access_token?: string | null
  xai_oauth_refresh_token?: string | null
}): boolean {
  return Boolean(settings.xai_oauth_access_token?.trim() || settings.xai_oauth_refresh_token?.trim())
}
