import { assertIsolatedAuthoringAllowed } from '@/lib/seoFactory/contentStudioExecutionContext'
import {
  generateContentText as generateContentTextCore,
  generateContentTextStream as generateContentTextStreamCore,
} from './contentAiProviderCore'

export * from './contentAiProviderCore'

/**
 * The only public content-authoring door. The core file owns provider/cascade
 * implementation; strict Content Studio executions add the contract-stage
 * permission check here so no alternate exported provider path can bypass it.
 */
export function generateContentText(
  ...args: Parameters<typeof generateContentTextCore>
): ReturnType<typeof generateContentTextCore> {
  assertIsolatedAuthoringAllowed()
  return generateContentTextCore(...args)
}

export function generateContentTextStream(
  ...args: Parameters<typeof generateContentTextStreamCore>
): ReturnType<typeof generateContentTextStreamCore> {
  assertIsolatedAuthoringAllowed()
  return generateContentTextStreamCore(...args)
}
