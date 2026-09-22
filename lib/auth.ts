import { auth, getAuth } from '@clerk/nextjs/server'
import type { NextRequest } from 'next/server'

/**
 * Resolve the authenticated Clerk user from Clerk's verified request context.
 *
 * Do not decode Clerk cookies manually here: cookie names and session formats
 * can change between Clerk releases, and an incomplete decoder makes every
 * role look like a new client when the dashboard cannot find clerk_user_id.
 */
export async function getClerkUserId(request?: NextRequest): Promise<string | null> {
  try {
    if (request) return getAuth(request).userId ?? null
    const { userId } = await auth()
    return userId ?? null
  } catch (error) {
    // Keep the failure explicit in server logs while preserving the normal
    // unauthenticated contract for API callers. Never manufacture a user ID
    // from an unverified cookie payload.
    console.error('[auth] Clerk session resolution failed:', error)
    return null
  }
}
