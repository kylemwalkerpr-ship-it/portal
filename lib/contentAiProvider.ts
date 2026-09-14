import { assertIsolatedAuthoringAllowed } from '@/lib/seoFactory/contentStudioExecutionContext'
import {
  generateContentText as generateContentTextLegacy,
  generateContentTextStream as generateContentTextStreamLegacy,
} from './contentAiProviderLegacy'

export * from './contentAiProviderLegacy'

/**
 * Contract-aware authoring door. Outside a strict persisted-contract execution
 * this is byte-for-byte delegated to the existing provider implementation.
 * Inside strict Content Studio execution, only calls made while linearDesk is
 * actively running are allowed. A desk failure cannot silently fall back to an
 * isolated draft, and a completed desk cannot be rewritten by later legacy
 * rescue passes.
 */
export function generateContentText(
  ...args: Parameters<typeof generateContentTextLegacy>
): ReturnType<typeof generateContentTextLegacy> {
  assertIsolatedAuthoringAllowed()
  return generateContentTextLegacy(...args)
}

export function generateContentTextStream(
  ...args: Parameters<typeof generateContentTextStreamLegacy>
): ReturnType<typeof generateContentTextStreamLegacy> {
  assertIsolatedAuthoringAllowed()
  return generateContentTextStreamLegacy(...args)
}
