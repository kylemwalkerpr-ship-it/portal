/**
 * ChatGPT Plus OAuth for Content Studio.
 *
 * Authenticates OpenAI against auth.openai.com using the official device-code
 * flow — the same subscription login the ChatGPT web / mobile apps use. No
 * OPENAI_API_KEY is required once the admin completes browser consent with an
 * eligible ChatGPT Plus / Pro account.
 *
 * Tokens live in ai_settings (admin DB) and are refreshed before generation,
 * mirroring the SuperGrok flow (lib/xaiSuperGrokOAuth). The token is injected
 * into the OpenAI provider slot (OPENAI_API_KEY) so the studio chain treats a
 * connected Plus account exactly like a metered key — selectable in Discover
 * (command), Brief, Reviewer / Editor, and the whole command center.
 *
 * OpenAI decides which subscription tiers may resolve the prompt scope; a 403
 * after a successful login means the account is gated and the metered
 * OPENAI_API_KEY remains the fallback.
 */

import {
  deleteAiSetting,
  getAiSettings,
  setAiSetting,
} from '@/lib/aiKeyVault'

/** Public ChatGPT web-app client — the same id the ChatGPT apps use for the
 *  device flow. Override with CHATGPT_OAUTH_CLIENT_ID if OpenAI rotates it. */
export const CHATGPT_OAUTH_CLIENT_ID_DEFAULT = 'pdlvIXc9bUqhsESQhZ1zQHPDQ79mH2Py'
/** Device-code + token issuer. */
export const CHATGPT_OAUTH_ISSUER_DEFAULT = 'https://auth.openai.com'
/** All models available to a ChatGPT Plus / Pro subscriber (vault model list). */
export const CHATGPT_PLUS_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
] as const
/** Default model when ChatGPT Plus is the active OpenAI credential. */
export const CHATGPT_DEFAULT_MODEL = 'gpt-5.6-sol'
export const CHATGPT_OAUTH_SCOPE_DEFAULT =
  'openid profile email offline_access model.request'

const SETTING = {
  access: 'chatgpt_oauth_access_token',
  refresh: 'chatgpt_oauth_refresh_token',
  expires: 'chatgpt_oauth_expires_at',
  type: 'chatgpt_oauth_token_type',
  pending: 'chatgpt_oauth_pending',
} as const

const SKEW_MS = 60_000

export interface ChatgptDeviceStart {
  userCode: string
  verificationUri: string
  verificationUriComplete: string | null
  expiresIn: number
  interval: number
}

export interface ChatgptStatus {
  connected: boolean
  pending: boolean
  expiresAt: number | null
  userCode: string | null
  verificationUri: string | null
  verificationUriComplete: string | null
  interval: number | null
  model: string
  models: string[]
  clientConfigured: boolean
}

export interface ChatgptAccess {
  accessToken: string
  expiresAt: number
  authMode: 'chatgpt-plus'
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

export function chatgptOAuthClientId(): string {
  return (
    process.env.CHATGPT_OAUTH_CLIENT_ID?.trim() ||
    CHATGPT_OAUTH_CLIENT_ID_DEFAULT
  )
}

export function chatgptOAuthIssuer(): string {
  return (
    process.env.CHATGPT_OAUTH_ISSUER?.trim() ||
    CHATGPT_OAUTH_ISSUER_DEFAULT
  ).replace(/\/+$/, '')
}

export function chatgptOAuthScope(): string {
  return process.env.CHATGPT_OAUTH_SCOPE?.trim() || CHATGPT_OAUTH_SCOPE_DEFAULT
}

/** Token endpoint — defaults to `${issuer}/oauth/token`; override with
 *  CHATGPT_OAUTH_TOKEN_URL if OpenAI remaps token issuance. */
export function chatgptOAuthTokenUrl(): string {
  return (
    process.env.CHATGPT_OAUTH_TOKEN_URL?.trim() ||
    `${chatgptOAuthIssuer()}/oauth/token`
  )
}

export function isChatgptAccessTokenFresh(expiresAt: number, now = Date.now()): boolean {
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
      'User-Agent': 'YouSafe-ContentStudio/1.0 (ChatGPT OAuth)',
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

export function parseChatgptPendingSetting(raw: string | null | undefined): PendingDevice | null {
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
    throw new Error(asString(json.error_description) || asString(json.error) || 'OpenAI OAuth returned no access token')
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

export async function getChatgptStatus(): Promise<ChatgptStatus> {
  const settings = await getAiSettings(true)
  const pending = parseChatgptPendingSetting(settings.chatgpt_oauth_pending)
  const expiresAt = Number(settings.chatgpt_oauth_expires_at || 0) || null
  const connected = Boolean(
    settings.chatgpt_oauth_access_token?.trim() || settings.chatgpt_oauth_refresh_token?.trim(),
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
    model: settings.default_model?.trim() || process.env.OPENAI_MODEL?.trim() || CHATGPT_DEFAULT_MODEL,
    models: [...CHATGPT_PLUS_MODELS],
    clientConfigured: Boolean(chatgptOAuthClientId()),
  }
}

export async function startChatgptDeviceLogin(updatedBy = 'admin'): Promise<ChatgptDeviceStart> {
  const { status, json, text } = await postForm(`${chatgptOAuthIssuer()}/oauth/device/code`, {
    client_id: chatgptOAuthClientId(),
    scope: chatgptOAuthScope(),
  })
  if (status >= 400) {
    throw new Error(
      `ChatGPT login could not start (${status}): ${asString(json.error_description) || asString(json.error) || text.slice(0, 240)}`,
    )
  }
  const userCode = asString(json.user_code)
  const deviceCode = asString(json.device_code)
  const verificationUri =
    asString(json.verification_uri) ||
    asString(json.verification_uri_complete) ||
    'https://chatgpt.com/login'
  if (!userCode || !deviceCode) {
    throw new Error('OpenAI device-code response was missing user_code or device_code')
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

export async function pollChatgptDeviceLogin(updatedBy = 'admin'): Promise<{
  connected: boolean
  pending: boolean
  error?: string
}> {
  const settings = await getAiSettings(true)
  const pending = parseChatgptPendingSetting(settings.chatgpt_oauth_pending)
  if (!pending) {
    const connected = Boolean(settings.chatgpt_oauth_access_token?.trim())
    return { connected, pending: false, error: connected ? undefined : 'No ChatGPT login in progress' }
  }
  if (pending.expires_at <= Date.now()) {
    await deleteAiSetting(SETTING.pending)
    return { connected: false, pending: false, error: 'ChatGPT login timed out — start again' }
  }

  const { status, json } = await postForm(chatgptOAuthTokenUrl(), {
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: pending.device_code,
    client_id: chatgptOAuthClientId(),
  })
  const err = asString(json.error)
  if (err === 'authorization_pending' || status === 428) {
    return { connected: false, pending: true }
  }
  if (err === 'slow_down') {
    return { connected: false, pending: true, error: 'OpenAI asked us to poll more slowly' }
  }
  if (err === 'expired_token' || err === 'access_denied') {
    await deleteAiSetting(SETTING.pending)
    return {
      connected: false,
      pending: false,
      error: err === 'access_denied' ? 'ChatGPT login was denied' : 'ChatGPT login expired — start again',
    }
  }
  if (status >= 400) {
    return {
      connected: false,
      pending: true,
      error: asString(json.error_description) || err || `OpenAI token poll failed (${status})`,
    }
  }

  const tokens = tokensFromResponse(json)
  await persistTokens(tokens, updatedBy)
  return { connected: true, pending: false }
}

export async function refreshChatgptToken(refreshToken: string): Promise<TokenSet> {
  const { status, json, text } = await postForm(chatgptOAuthTokenUrl(), {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: chatgptOAuthClientId(),
  })
  if (status >= 400) {
    const message = asString(json.error_description) || asString(json.error) || text.slice(0, 240)
    throw new Error(`ChatGPT token refresh failed (${status}): ${message}`)
  }
  return tokensFromResponse({ ...json, refresh_token: asString(json.refresh_token) || refreshToken })
}

export async function ensureChatgptAccessToken(): Promise<ChatgptAccess | null> {
  const settings = await getAiSettings(true)
  const access = settings.chatgpt_oauth_access_token?.trim() || ''
  const refresh = settings.chatgpt_oauth_refresh_token?.trim() || ''
  const expiresAt = Number(settings.chatgpt_oauth_expires_at || 0)
  if (!access && !refresh) return null
  if (access && isChatgptAccessTokenFresh(expiresAt)) {
    return { accessToken: access, expiresAt, authMode: 'chatgpt-plus' }
  }
  if (!refresh) {
    if (!access) return null
    return { accessToken: access, expiresAt: expiresAt || Date.now() + 5 * 60_000, authMode: 'chatgpt-plus' }
  }
  try {
    const tokens = await refreshChatgptToken(refresh)
    await persistTokens(tokens, 'oauth-refresh')
    return { accessToken: tokens.access_token, expiresAt: tokens.expires_at, authMode: 'chatgpt-plus' }
  } catch (err) {
    console.warn(
      '[chatgpt] refresh failed — using existing access token if present',
      err instanceof Error ? err.message : err,
    )
    if (access) {
      return { accessToken: access, expiresAt: expiresAt || Date.now() + 30_000, authMode: 'chatgpt-plus' }
    }
    return null
  }
}

export async function disconnectChatgpt(): Promise<void> {
  await Promise.all([
    deleteAiSetting(SETTING.access),
    deleteAiSetting(SETTING.refresh),
    deleteAiSetting(SETTING.expires),
    deleteAiSetting(SETTING.type),
    deleteAiSetting(SETTING.pending),
  ])
}

export function isChatgptConnectedFromSettings(settings: {
  chatgpt_oauth_access_token?: string | null
  chatgpt_oauth_refresh_token?: string | null
}): boolean {
  return Boolean(settings.chatgpt_oauth_access_token?.trim() || settings.chatgpt_oauth_refresh_token?.trim())
}