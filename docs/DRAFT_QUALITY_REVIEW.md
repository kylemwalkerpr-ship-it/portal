# Draft quality review — 2026-09-08

## Findings and implementation

The SEO Factory uses `prompts.ts` for the system, first draft, revision and segmented-writing instructions. Both `pipeline.ts` and `pipelineStream.ts` build the shared system prompt. The pipelines audit and repair drafts, with bounded revision attempts. `contentQualityPlaybook.ts` supplies spec-based constraints; `contentQualityGate.ts` checks voice, formatting and content defects.

Two concrete prompt conflicts were corrected:

- Legal destinations asked for JSX, paragraph tags and imports while saying the renderer converts Markdown. The writer now supplies Markdown/YAML; destination components and metadata exports belong to the renderer.
- A single segment is both first and last. Its first-part rule previously prohibited sources/schema/disclaimer while its last-part rule required them. A complete single-part draft now explicitly owns its closing material.

The shared quality prompt now includes an editorial pass covering regional language, tone, grammar, audience-appropriate readability, factual depth, natural keyword placement, source support and formatting consistency. It asks for a combined review after edits so fixing one dimension does not knowingly damage another. These are generation instructions, not new measured guarantees.

## What scores actually mean

`editorMetrics.ts` computes advisory Flesch, grammar and SEO feedback. `harperBrowser.ts` runs grammar checking in the browser; it can return no result if unavailable. `masterEngine.ts` also has a separate approximate readability signal and grammar/spacing proxy. These are not interchangeable measurements or evidence of human authorship.

`contentQualityGate.ts` calculates a heuristic human-voice score from detectable patterns. Passing it does not establish that a person wrote the text. Flesch 100 is not the desired universal target: clarity must preserve technical meanings and qualifications.

`jobShipGate.ts` requires an explicit `shipReady: true` verdict and zero blockers. A numerical 100 alone does not establish readiness. `ship.ts` also checks mandatory compliance evidence and holds shipping when evaluation cannot run. This change leaves those enforcement paths intact.

## Validation and limits

Regression coverage checks Markdown output instructions and a complete single-part draft's closing obligations. Existing prompt, segmented-writing, quality-gate, job-gate, mandatory-compliance and editor-metric suites are run alongside those regressions.

No live model generation, paid provider call, publication or deployment is part of this change. First-pass acceptance rate and repair-count reduction have not been measured. To assess those outcomes, run a fixed set of representative briefs across content types with the same provider/settings before and after the change; record initial blockers, revision count, final gate result and editorial review. Missing evidence and inaccurate source material still require correction, even when prose scores well.

This investigation and prompt correction are complete. Guaranteed human authorship, universal 100 scores and guaranteed first-pass shipping are not demonstrated or promised.
