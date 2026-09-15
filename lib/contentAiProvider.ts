import {
  assertContractProviderSelection,
  assertIsolatedAuthoringAllowed,
} from '@/lib/seoFactory/contentStudioExecutionContext'
import {
  generateContentText as generateContentTextCore,
  generateContentTextStream as generateContentTextStreamCore,
} from './contentAiProviderCore'

export * from './contentAiProviderCore'

/**
 * The only public content-authoring door. The core file owns provider/cascade
 * implementation; strict Content Studio executions add the contract-stage
 * permission and provider-pin checks here so no alternate exported provider
 * path can bypass the immutable writing contract.
 */
export function generateContentText(
  ...args: Parameters<typeof generateContentTextCore>
): ReturnType<typeof generateContentTextCore> {
  assertIsolatedAuthoringAllowed()
  assertContractProviderSelection(args[0] || {})
  return generateContentTextCore(...args)
}

export function generateContentTextStream(
  ...args: Parameters<typeof generateContentTextStreamCore>
): ReturnType<typeof generateContentTextStreamCore> {
  assertIsolatedAuthoringAllowed()
  assertContractProviderSelection(args[0] || {})
  return generateContentTextStreamCore(...args)
}
