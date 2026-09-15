import { NextRequest } from 'next/server'
import * as core from './legacyCore'
import { currentContentStudioExecution } from '@/lib/seoFactory/contentStudioExecutionContext'
import { strictManualPublicationPATCH } from './strictManualPublication'

export const GET = core.GET
export const POST = core.POST
export const DELETE = core.DELETE

/**
 * Keep the pre-contract jobs handler byte-preserved for legacy/uncontracted
 * actions. Once the public route has entered a strict contracted execution,
 * manual publication actions must never reach those id-only writes: route them
 * to the exact owner/attempt fenced DB boundary instead.
 */
export async function PATCH(request: NextRequest) {
  const execution = currentContentStudioExecution()
  if (execution?.strict) {
    const body = await request.clone().json().catch(() => ({})) as Record<string, unknown>
    const action = String(body.action || '').trim()
    if (action === 'approve' || action === 'reship' || action === 'merge_pr') {
      return strictManualPublicationPATCH(request)
    }
  }
  return core.PATCH(request)
}
