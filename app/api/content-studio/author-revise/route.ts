import type { NextRequest } from 'next/server'
import { POST as corePOST } from './routeCore'
import { runWithContentStudioRecoveryClaim } from '@/lib/seoFactory/writingContractStore'

export const maxDuration = 180

/** Author Revise is an explicit recovery action for the exact persisted contract. */
export function POST(request: NextRequest) {
  return runWithContentStudioRecoveryClaim(() => corePOST(request))
}
