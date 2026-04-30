import { cookies } from 'next/headers'

export async function getClerkUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const token =
    cookieStore.get('__session')?.value ??
    cookieStore.get('__clerk_db_jwt')?.value

  if (!token) return null

  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const pad = parts[1].length % 4
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad ? 4 - pad : 0)
    const payload = JSON.parse(atob(b64))
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
