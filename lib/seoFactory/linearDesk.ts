import type { KeywordTerm } from '@/lib/seoEngine/keywordTerms'
import { currentContentStudioExecution } from './contentStudioExecutionContext'
import {
  assemblyFromPipelineInput as coreAssemblyFromPipelineInput,
} from './linearDeskCore'

export * from './linearDeskCore'

type AssemblyInput = Parameters<typeof coreAssemblyFromPipelineInput>[0]

/**
 * Public desk assembly door. Strict Content Studio executions take keyword
 * coverage and provenance from the immutable writing contract, never from
 * mutable request fields or regenerated discovery state.
 */
export function assemblyFromPipelineInput(input: AssemblyInput): ReturnType<typeof coreAssemblyFromPipelineInput> {
  const execution = currentContentStudioExecution()
  const coverage = execution?.strict ? execution.contractQueryCoverage : null
  if (!coverage) return coreAssemblyFromPipelineInput(input)

  return coreAssemblyFromPipelineInput({
    ...input,
    requiredShortKeywords: [...coverage.requiredShortKeywords],
    requiredLongTailKeywords: [...coverage.requiredLongTailKeywords],
    shortKeywordTerms: coverage.shortKeywordTerms.map((term: KeywordTerm) => ({ ...term })),
    longTailKeywordTerms: coverage.longTailKeywordTerms.map((term: KeywordTerm) => ({ ...term })),
  })
}
