/**
 * Streaming SEO Factory pipeline — emits progress + content deltas for SSE.
 * Same logic as runSeoFactoryPipeline but progressive.
 */

import { createClient } from '@supabase/supabase-js'
import { resolveOwner, assertPlanRepoConsistency, type OwnerPlan } from './ownership'
import { stripDuplicateArticleCopy } from './editorialScaffold'
import { auditContent, canAutodeploy, type SeoFactoryAudit } from './audit'
import { shipContent, type ShipMode, type ShipResult } from './ship'
import { buildGscContentBrief, formatGscBriefForPrompt } from '@/lib/gscContentBrief'
import { generateContentText, generateContentTextStream } from '@/lib/contentAiProvider'
import { formatStrategyForPrompt } from '@/lib/seoDataLoaders'
import {
  auditToRefineNotes,
  buildDepthAppendPrompt,
  buildDepthExpandPrompt,
  buildFactorySystemPrompt,
  buildFactoryUserPrompt,
  buildSegmentWritePrompt,
  extractH2Titles,
  mergeAppendedSections,
  mergeSegmentParts,
  minWordsForType,
  planWriteSegments,
} from './prompts'
import { countBodyWords, targetWordsForType, maxWordsForType, trimMarkdownProseToWordBudget } from './contentDepth'
import { meetsDepthFloor, meetsShipQuality } from './audit'
import { runDepthRescue, type DepthRescueStats } from './depthRescue'
import { topicPathMismatch } from './topicPathGuard'
import { evaluateContentQuality, qualityToRefineNotes } from './contentQualityGate'
import type { PipelineInput, PipelineResult, RequestedShipMode } from './pipeline'
import { isJunkTopic } from './queryNoise'
import { applyDeterministicRepairs } from './editorialScaffold'
import { collapseDuplicatedTitle } from './formatContract'
import { stripNoIndex } from './siteHealthFixes'
import { partitionKeywords } from '@/lib/seoEngine/planner'
import { resolveContentSpecForJob, type ContentSpec } from './contentSpec'
import { normalizeJobContentType } from './jobContentType'

export type PipelineStreamEvent =
  | { type: 'progress'; stage: string; message: string }
  | { type: 'provider'; provider: string; model: string }
  | { type: 'job'; jobId: string }
  | { type: 'delta'; text: string; attempt: number; draft?: string }
  | { type: 'attempt'; attempt: number; score: number; wordCount: number; goodEnough: boolean; draft?: string }
  | { type: 'rescue'; stats: DepthRescueStats }
  | { type: 'ship'; ship: ShipResult | null; shipError: string | null; shipMode: string }
  | { type: 'final'; result: PipelineResult }
  | { type: 'error'; error: string }

function resolveShipMode(
  requested: RequestedShipMode,
  audit: SeoFactoryAudit,
  plan: OwnerPlan,
): ShipMode | 'none' {
  if (requested === 'none') return 'none'
  if (requested === 'pr') return 'pr'
  if (requested === 'merge') {
    return plan.blockers.length === 0 ? 'merge' : 'pr'
  }
  if (requested === 'autodeploy') {
    return canAutodeploy(audit, plan.ymy) && plan.blockers.length === 0 ? 'autodeploy' : 'merge'
  }
  if (canAutodeploy(audit, plan.ymy) && plan.blockers.length === 0) return 'merge'
  return 'pr'
}

export async function* runSeoFactoryPipelineStream(
  input: PipelineInput,
): AsyncGenerator<PipelineStreamEvent> {
  try {
    const topic = (input.topic || '').trim()
    let primaryKeyword = (input.primaryKeyword || topic).trim()
    // Safety: if primaryKeyword shares no significant words with the topic,
    // it's likely a stale keyword from a prior job — derive from topic.
    if (topic && primaryKeyword && primaryKeyword !== topic) {
      const topicWords = new Set(topic.toLowerCase().split(/\s+/).filter(w => w.length > 3))
      const kwWords = primaryKeyword.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      const overlap = kwWords.filter(w => topicWords.has(w)).length
      if (overlap === 0 && kwWords.length > 0) {
        primaryKeyword = topic
      }
    }
    // Partition the user-supplied keywords + primary keyword into ≥5 short / ≥4 long-tail.
    const briefPartition = partitionKeywords(
      Array.isArray(input.keywords) ? input.keywords : [],
      primaryKeyword,
    )
    const requiredShortKeywords = briefPartition.short
    const requiredLongTailKeywords = briefPartition.longTail
    // Per-term provenance: synthesized filler terms warn instead of blocking.
    const shortKeywordTerms = briefPartition.shortTerms
    const longTailKeywordTerms = briefPartition.longTailTerms
    const title = collapseDuplicatedTitle((input.title || topic || primaryKeyword).trim())
    const region = (input.region || 'US').toUpperCase()
    let contentType = input.contentType || 'legal_guide'
    const tone = input.tone || 'educational'
    const indexable = input.indexable !== false
    const requestedMode = (input.shipMode || 'pr') as RequestedShipMode
    const minAudit = Math.min(95, Math.max(50, Number(input.minAuditScore) || 65))
    // Keep streaming generation within the Worker subrequest budget.
    // Further remediation remains available from the job modal.
    // Keep streaming generation within the Worker subrequest budget, but allow
    // enough refine passes that a second draft is always attempted before ship.
    const maxRefine = Math.min(3, Math.max(1, Number(input.maxRefine ?? 2)))

    if (!topic) {
      yield { type: 'error', error: 'topic required' }
      return
    }

    // Refuse junk-query jobs before they generate — same guard as the
    // non-streaming pipeline entry. Long-tail topics stay allowed.
    if (isJunkTopic(topic) || isJunkTopic(primaryKeyword)) {
      yield {
        type: 'error',
        error: `Rejected junk keyword: "${primaryKeyword || topic}" is not a valid search topic`,
      }
      return
    }

    // Keyword cluster: merge the whole cluster into the brief so ONE page answers
    // every related query (anti-cannibalization). Resolve to an existing page
    // when the cluster says so.
    const clusterKeywords = Array.isArray(input.cluster?.keywords) ? input.cluster!.keywords! : []
    const mergedKeywords = Array.isArray(input.keywords)
      ? [...new Set([...input.keywords, primaryKeyword, ...clusterKeywords])].slice(0, 24)
      : [...new Set([primaryKeyword, ...clusterKeywords])].slice(0, 24)
    const ownerUrlHint =
      input.cluster?.mode === 'expand' && input.cluster?.targetUrl
        ? String(input.cluster.targetUrl)
        : undefined

    yield { type: 'progress', stage: 'plan', message: 'Resolving ownership & content type…' }
    const plan = await resolveOwner({
      primaryKeyword,
      contentType,
      region,
      indexable,
      slug: input.slug,
      ownerUrlHint,
    })
    // Trust path/host-reconciled type from ownership (never legal_guide on universities)
    contentType = plan.contentType || contentType
    if (plan.intentClass === 'geo_modifier') contentType = 'regional_from'
    else if (plan.intentClass === 'university_modifier') contentType = 'regional_university'
    // Transactional intent is downgraded by standingRulesHost to a blog_summary on
    // legal or the best-fit regional host — the studio never creates marketplace gigs.
    else if (plan.intentClass === 'transactional' && !input.contentType) contentType = 'blog_summary'
    else if (plan.intentClass === 'news_summary' && !input.contentType) contentType = 'blog_summary'
    else if (plan.host === 'legal' && (contentType === 'regional_page' || !input.contentType)) {
      contentType = 'legal_guide'
    }
    if (/content\/universities\//.test(plan.filePath)) contentType = 'regional_university'
    else if (/content\/from\//.test(plan.filePath)) contentType = 'regional_from'
    else if (
      (plan.host === 'usa' || plan.host === 'uk' || plan.host === 'ca' || plan.host === 'au' || plan.host === 'apex') &&
      (contentType === 'legal_guide' || contentType === 'article')
    ) {
      contentType = 'regional_page'
    }
    assertPlanRepoConsistency(plan)
    const minWords = input.minWords ?? minWordsForType(contentType)
    const targetWords = targetWordsForType(contentType)
    const maxWords = input.maxWords ?? maxWordsForType(contentType)
    // SINGLE-PASS WRITING — the drafter receives ONE brief and writes the
    // whole article in ONE response (front matter → outline → FAQ → Sources →
    // JSON-LD → disclaimer). Two-part runs were what produced echo copies
    // (part 2 re-emitting front matter/H1, or the "saved draft + revision"
    // concatenation that stripDuplicateArticleCopy has to unduplicate), so
    // segmenting is now an EXPLICIT admin opt-in (writeSegments > 1) for
    // constrained models only — never the default. The single-pass prompt
    // carries its own one-go contract (buildFactoryUserPrompt) and cut-off
    // drafts are recovered by the append-only depth rescue, not by a
    // second brief with a copy of the first part.
    const segmentCount =
      input.writeSegments != null && Number(input.writeSegments) > 1
        ? Math.min(4, Math.floor(Number(input.writeSegments)))
        : 1

    yield {
      type: 'progress',
      stage: 'plan',
      message: `Owner ${plan.host} · ${plan.repo} · ${plan.filePath} · depth ≥${minWords} words`,
    }
    if (input.cluster?.mode === 'expand') {
      yield {
        type: 'progress',
        stage: 'plan',
        message: `Cluster resolves to existing page ${input.cluster.targetUrl || '—'} — expanding, no sibling created`,
      }
    } else if (input.cluster?.keywords?.length) {
      yield {
        type: 'progress',
        stage: 'plan',
        message: `New unique page owns a ${input.cluster.keywords.length}-keyword cluster`,
      }
    }

    // Realtime queue row — create the content_jobs record NOW (status 'drafting')
    // so the Draft queue + Review stage reflect live progress while the AI writes.
    // The row is finalized (content/audit/ship) at the end of the stream.
    let earlyJobId: string | null = String(input.existingJobId || '').trim() || null
    try {
      const earlySb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const earlyRow: Record<string, unknown> = {
        user_id: input.userId || 'admin',
        source_job_id: input.sourceJobId || null,
        lineage: {
          modelVersion: 'seo-intelligence-v1',
          sourceJobId: input.sourceJobId || null,
          regenerationMode: input.regenerationMode || null,
        },
        regeneration_reason: input.regenerationReason || null,
        regeneration_mode: input.regenerationMode || null,
        title,
        topic,
        content_type: normalizeJobContentType(contentType),
        tone,
        region,
        target_repo: plan.repo,
        status: 'drafting',
        slug: plan.filePath.split('/').filter(Boolean).slice(-2, -1)[0] || null,
        content_path: plan.filePath,
        ai_provider: input.aiProvider || null,
        ship_mode: input.shipMode === 'autodeploy' || input.shipMode === 'merge' ? 'autodeploy' : 'pr',
        indexable: plan.indexable,
        canonical_url: plan.canonicalUrl,
        owner_host: plan.host,
        primary_keyword: primaryKeyword,
        event_log: [
          {
            id: `pipe-start-${Date.now()}`,
            ts: Date.now(),
            level: 'info',
            source: 'pipeline',
            message: 'Drafting started — queue row created for live progress tracking',
          },
        ],
      }
      if (earlyJobId) {
        const { error: earlyUp } = await earlySb.from('content_jobs').update(earlyRow).eq('id', earlyJobId)
        if (earlyUp && /event_log|lineage|regeneration_reason|regeneration_mode|column/i.test(earlyUp.message || '')) {
          const { lineage: _l, regeneration_reason: _r, regeneration_mode: _m, event_log: _e, ...minimalRow } = earlyRow
          await earlySb.from('content_jobs').update(minimalRow).eq('id', earlyJobId)
        }
        yield { type: 'job', jobId: earlyJobId }
      } else {
      const early = await earlySb.from('content_jobs').insert(earlyRow).select('id').single()
      if (early.data?.id) {
        earlyJobId = early.data.id
        yield { type: 'job', jobId: earlyJobId }
      } else if (early.error && /event_log|lineage|regeneration_reason|regeneration_mode|column/i.test(early.error.message || '')) {
        // Schema without the newer columns — retry minimal
        const { lineage: _l, regeneration_reason: _r, regeneration_mode: _m, event_log: _e, ...minimalRow } = earlyRow
        const retry = await earlySb.from('content_jobs').insert(minimalRow).select('id').single()
        if (retry.data?.id) {
          earlyJobId = retry.data.id
          yield { type: 'job', jobId: earlyJobId }
        } else if (retry.error) {
          console.warn('[seoFactory/pipelineStream] early job row insert failed:', retry.error.message)
        }
      } else if (early.error) {
        console.warn('[seoFactory/pipelineStream] early job row insert failed:', early.error.message)
      }
      }
    } catch (e) {
      console.warn('[seoFactory/pipelineStream] early job row skipped', e)
    }

    yield { type: 'progress', stage: 'gsc', message: 'Building GSC content brief…' }
    const gscBrief = await buildGscContentBrief({
      topic,
      region,
      keywords: mergedKeywords,
    })
    const gscBlock = formatGscBriefForPrompt(gscBrief)
    let strategyBlock = await formatStrategyForPrompt({
      topic: `${topic} ${primaryKeyword}`,
      maxChars: 4200,
    })

    // ── Opportunity Radar autopilot brief (transparency into the draft) ──
    const opp = input.opportunity
    const radarInterlinks = Array.isArray(input.interlinks) ? input.interlinks : []
    const autopilotBlock = [
      radarInterlinks.length
        ? `### Internal linking strategy (from Opportunity Radar)\nLink naturally to these high-value targets with descriptive anchors where relevant:\n${radarInterlinks
            .map((l) => `- ${l.label || l.url} (${l.url})${l.matchedOn?.length ? ` — matches: ${l.matchedOn.join(', ')}` : ''}`)
            .join('\n')}`
        : '',
      opp
        ? `### Opportunity brief\nPrimary keyword: ${opp.primaryKeyword || ''}\nPlay: ${opp.play || ''} · Intent: ${opp.intent || ''} · Opportunity score: ${opp.opportunityScore ?? ''}\nSignals: ${(opp.signals || []).join(' | ')}`
        : '',
      input.cluster?.keywords?.length
        ? `### Keyword cluster (anti-cannibalization)\nThis article is the CANONICAL page for this keyword cluster. Cover ALL of these queries — do not split them across sibling pages:\n${input.cluster.keywords.join('\n')}\nMode: ${input.cluster.mode === 'expand' ? `EXPAND existing page ${input.cluster.targetUrl || ''}` : 'NEW unique page'}${input.cluster.reason ? `\nWhy: ${input.cluster.reason}` : ''}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    if (autopilotBlock) strategyBlock = `${strategyBlock}\n\n${autopilotBlock}`

    const { assembleDraftSourceAllowlist, sanitizeDraftLinksLive, urlsFromAllowlistLines } = await import('./linkAudit')
    const citationCtx = { region, topic, keywords: mergedKeywords }
    const verifiedSources = await assembleDraftSourceAllowlist(region, input.sources as string[] | undefined, citationCtx)
    const verifiedSourceUrls = urlsFromAllowlistLines(verifiedSources)
    yield { type: 'progress', stage: 'brief', message: `Verified ${verifiedSourceUrls.length} live official citation URL${verifiedSourceUrls.length === 1 ? '' : 's'}` }

    // ── Canonical ContentSpec (implementation brief §3.2) ────────────────────
    // Resolved ONCE at planning/brief start, validated, passed unchanged to
    // briefing + writer prompts and persisted in the job audit payload. Fails
    // closed and safe: an invalid/unresolvable spec keeps the pre-spec
    // behavior (null spec) instead of weakening the run.
    let contentSpec: ContentSpec | null = null
    try {
      const specResolution = resolveContentSpecForJob({
        jobId: earlyJobId || input.sourceJobId || `plan-${Date.now()}`,
        contentType,
        region,
        indexable: plan.indexable,
        canonicalUrl: plan.canonicalUrl,
        primaryKeyword,
        requiredShortKeywords,
        requiredLongTailKeywords,
        verifiedSourceUrls,
        outline: input.h2Outline as string[] | undefined,
        audience: input.audience,
        topic,
        minWords,
        targetWords,
        maxWords,
        plannerRunId: input.sourceJobId || undefined,
      })
      contentSpec = specResolution.spec
      if (!contentSpec) {
        console.warn(
          '[seoFactory/pipelineStream] ContentSpec not persisted (pre-spec behavior kept):',
          specResolution.reason,
          specResolution.issues?.slice(0, 5),
        )
      }
    } catch (specErr) {
      console.warn('[seoFactory/pipelineStream] ContentSpec resolution skipped', specErr)
      contentSpec = null
    }

    const system = buildFactorySystemPrompt({
      plan,
      contentType,
      minWords,
      maxWords,
      strategyBlock,
      requiredShortKeywords,
      requiredLongTailKeywords,
      h2Outline: input.h2Outline as string[] | undefined,
      sources: verifiedSources,
      interlinkAllowlist: radarInterlinks as Array<{ label?: string; url?: string }>,
      targetSlug: input.targetSlug as string | undefined,
      kwH2Map: input.kwH2Map as Record<string, string> | undefined,
      spec: contentSpec ?? undefined,
    })

    let content = input.resumeContent?.trim() || ''
    // Safety net: a previously-echoed generation can already contain two full
    // article copies (saved draft + revised). Feed the model ONE copy.
    content = stripDuplicateArticleCopy(content).content
    const resumeMode = Boolean(content)
    let lastDraftSent = 0
    let provider = 'unknown'
    let model = 'unknown'
    let audit: SeoFactoryAudit = auditContent({
      content,
      contentType,
      primaryKeyword,
      indexable: plan.indexable,
      ownershipBlockers: plan.blockers,
    })
    let attempts = 0
    let refineNotes: string | undefined
    let expandPasses = 0
    let stalledCount = 0
    const maxStalled = 2
    // Depth-rescue stats (PASS 2) — surfaced to the Draft queue and persisted on
    // the job so the admin always sees how many expansion rounds a draft needed.
    let rescueStallCount = 0
    let rescueTimeMs = 0
    let rescueBudgetMs = 0

    // ── PASS 1: Main refine loop (depth + quality) ───────────────────────
    for (let i = 0; i <= maxRefine; i++) {
      attempts = i + 1
      // Client went away — stop refining instead of starting a new generation
      // that nobody will read (the single biggest stream-memory leak).
      if (input.signal?.aborted) {
        yield { type: 'error', error: 'Generation cancelled (client disconnected)' }
        return
      }
      const underDepth = Boolean(content) && countBodyWords(content) < minWords

      // Capture pre-generate state for progress tracking (state from previous iteration)
      const prevBlockers = audit.blockers.length
      const prevScore = audit.score

      yield {
        type: 'progress',
        stage: 'generate',
        message:
          i === 0
            ? `Generating draft (attempt ${attempts})…`
            : underDepth
              ? `Depth expand (attempt ${attempts}) · ${countBodyWords(content)}/${minWords} words…`
              : `Refining draft (attempt ${attempts})…`,
      }

      const prompt = underDepth
        ? buildDepthExpandPrompt({
            title,
            topic,
            primaryKeyword,
            region,
            contentType,
            minWords,
            targetWords,
            maxWords,
            currentWords: countBodyWords(content),
            draft: content,
            h2Outline: input.h2Outline as string[] | undefined,
          })
        : buildFactoryUserPrompt({
            title,
            topic,
            primaryKeyword,
            region,
            contentType,
            tone,
            audience: input.audience,
            gscBlock,
            opportunityAction: input.opportunityAction,
            writeHint: input.writeHint,
            modelGuidance: input.modelGuidance || undefined,
            masterEngineBlock: input.masterEngineBlock || undefined,
            refineNotes,
            marketplaceCta: input.marketplaceCta,
            titleCandidate: input.titleCandidate,
            // REVISE THE EXISTING DRAFT, don't regenerate from scratch — fixes
            // must accumulate across iterations or the same blockers (AI slop,
            // repetitive sentence starts, missing disclaimer) reappear every pass.
            draft: content || undefined,
          })

      const generationPrompt =
        resumeMode && i === 0 && !underDepth
          ? `${prompt}\n\nCONTINUE FROM THIS SAVED PARTIAL DRAFT. Do NOT echo, quote, or repeat the saved draft back — write the COMPLETE REVISED article only (one H1, the full outline below it). Every token you emit is appended to it.\n\nSAVED DRAFT (read-only reference):\n${content.slice(0, 60000)}`
          : prompt
      const prevWords = content ? countBodyWords(content) : 0
      let attemptText = ''

      // ── Segmented first draft ────────────────────────────────────────────
      // Thinking mode stays ON (better reasoning) but long documents are written
      // in sequential bounded parts, each a fresh provider run targeting a slice
      // of the outline. That way thinking + content always fit the token budget
      // and we never hit finish_reason:'length'. On any segment failure we fall
      // back to the single-pass write below instead of failing the whole run.
      const segments =
        i === 0 && !resumeMode && !underDepth && segmentCount > 1
          ? planWriteSegments({
              h2Outline: input.h2Outline as string[] | undefined,
              minWords,
              targetWords,
              maxWords,
              segmentCount,
            })
          : null
      if (segments) {
        const parts: string[] = []
        // Continuity for generic splits (no h2Outline): every completed part
        // contributes its extracted H2s to the next part's priorSections so
        // continuation runs never repeat what was already written.
        let writtenH2s: string[] = []
        let segmentFailed: string | null = null
        for (const seg of segments) {
          const segPrompt = buildSegmentWritePrompt({
            title,
            topic,
            primaryKeyword,
            region,
            contentType,
            tone,
            segment: {
              ...seg,
              priorSections: [...new Set([...(seg.priorSections || []), ...writtenH2s])],
            },
            minWords,
            targetWords,
            gscBlock,
            writeHint: input.writeHint,
            opportunityAction: input.opportunityAction,
          })
          yield {
            type: 'progress',
            stage: 'generate',
            message: `Writing part ${seg.index}/${seg.total}${seg.sections.length ? ` · ${seg.sections.length} section(s)` : ''} (${seg.wordFloor}–${seg.wordCeiling} words)…`,
          }
          let segText = ''
          try {
            for await (const ev of generateContentTextStream({
              system,
              prompt: segPrompt,
              maxTokens: 16384,
              temperature: 0.5,
              aiProvider: input.aiProvider,
              signal: input.signal,
            })) {
              if (ev.type === 'provider') {
                provider = ev.provider
                model = ev.model
                yield { type: 'provider', provider, model }
              } else if (ev.type === 'delta') {
                segText += ev.text
                // Stream deltas live; checkpoints happen at part boundaries so
                // the queue shows content growing part by part, not per token.
                yield { type: 'delta', text: ev.text, attempt: attempts, draft: undefined }
              } else if (ev.type === 'done') {
                segText = ev.text
                provider = ev.provider
                model = ev.model
              }
            }
          } catch (err) {
            segmentFailed = err instanceof Error ? err.message : String(err)
            break
          }
          if (!segText.trim()) {
            segmentFailed = 'segment returned empty content'
            break
          }
          parts.push(segText)
          writtenH2s = [...writtenH2s, ...extractH2Titles(segText)]
          // Realtime queue: checkpoint the running merged draft at every part
          // boundary so the Draft queue grows while later parts are writing.
          if (parts.length < segments.length) {
            const running = mergeSegmentParts(parts)
            if (running.length >= lastDraftSent + 2000) {
              lastDraftSent = running.length
              yield { type: 'delta', text: '', attempt: attempts, draft: running }
            }
          }
          yield {
            type: 'progress',
            stage: 'generate',
            message: `Part ${seg.index}/${seg.total} complete (~${countBodyWords(segText)} words)`,
          }
        }
        if (segmentFailed) {
          yield {
            type: 'progress',
            stage: 'generate',
            message: `Segmented write paused at part ${parts.length + 1}/${segments.length} (${segmentFailed.slice(0, 120)}) — preserving completed parts for append-only continuation`,
          }
          // Never discard completed sections and ask the model to regenerate
          // the whole article. Preserve the checkpoint; depth rescue appends
          // only the missing sections on the next pass/resume.
          if (parts.length > 0) attemptText = mergeSegmentParts(parts)
        } else if (parts.length > 0) {
          attemptText = mergeSegmentParts(parts)
        }
      }

      // Client went away — do NOT fall back to single-pass generation for a
      // dead consumer (would stream the whole article into memory).
      if (input.signal?.aborted) {
        yield { type: 'error', error: 'Generation cancelled (client disconnected)' }
        return
      }
      if (!attemptText) {
        try {
          for await (const ev of generateContentTextStream({
            system,
            prompt: generationPrompt,
            maxTokens: contentType === 'marketplace_gig' ? 4000 : underDepth ? 16384 : 16384,
            temperature: i === 0 ? 0.5 : underDepth ? 0.45 : 0.35,
            aiProvider: input.aiProvider,
            signal: input.signal,
          })) {
            if (ev.type === 'provider') {
              provider = ev.provider
              model = ev.model
              yield { type: 'provider', provider, model }
            } else if (ev.type === 'delta') {
              attemptText += ev.text
              const grewEnough = attemptText.length - lastDraftSent >= 2000
              if (grewEnough) lastDraftSent = attemptText.length
              const checkpointDraft =
                grewEnough && attemptText.length >= content.length ? attemptText : undefined
              yield { type: 'delta', text: ev.text, attempt: attempts, draft: checkpointDraft }
            } else if (ev.type === 'done') {
              attemptText = ev.text
              provider = ev.provider
              model = ev.model
            }
          }
        } catch (streamErr) {
          const msg = streamErr instanceof Error ? streamErr.message : String(streamErr)
          // Do NOT let an unhandled provider cascade error freeze the UI.
          // Yield an error event so the SSE stream terminates with a visible
          // message instead of hanging indefinitely.
          yield { type: 'error', error: msg }
          return
        }
      }

      if (!(underDepth && countBodyWords(attemptText) < prevWords)) {
        content = attemptText
      }

      // ── Auto-trim: enforce hard maxWords ceiling ──────────────────────
      // Models can overshoot the hard ceiling. Trim only ordinary prose
      // paragraphs; never flatten headings/lists/tables into one line.
      const overMaxBy = countBodyWords(content) - maxWords
      if (overMaxBy > 0 && !underDepth) {
        const trimmed = trimMarkdownProseToWordBudget(content, maxWords, minWords)
        if (trimmed.removedWords > 0) {
          const trimmedWc = countBodyWords(trimmed.content)
          yield {
            type: 'attempt',
            attempt: attempts,
            score: 0,
            wordCount: trimmedWc,
            goodEnough: false,
            draft: trimmed.content,
          }
          content = trimmed.content
        }
      }

      audit = auditContent({
        content,
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        ownershipBlockers: plan.blockers,
      })

      const goodEnough =
        audit.score >= minAudit &&
        meetsShipQuality(audit) &&
        audit.blockers.filter((b) => b.code !== 'ownership').length === 0

      yield {
        type: 'attempt',
        attempt: attempts,
        score: audit.score,
        wordCount: audit.wordCount,
        goodEnough,
        draft: content,
      }

      if (goodEnough) break

      // Progress check: compare current post-gen state against pre-gen state
      const improved = audit.score > prevScore || audit.blockers.length < prevBlockers
      if (improved) {
        stalledCount = 0
      } else {
        stalledCount++
        if (stalledCount >= maxStalled) {
          yield {
            type: 'progress',
            stage: 'refine',
            message: `Refine stalled after ${attempts} attempts (score ${audit.score}, ${audit.blockers.length} blockers) — moving to depth rescue`,
          }
          break
        }
      }

      if (i === maxRefine) break
      const q = evaluateContentQuality({
        content,
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        requiredShortKeywords,
        requiredLongTailKeywords,
        shortKeywordTerms,
        longTailKeywordTerms,
        region,
      })
      refineNotes = [
        auditToRefineNotes({ ...audit, minWords, targetWords, maxWords }),
        !q.ok || q.humanScore < 75 ? qualityToRefineNotes(q) : '',
      ]
        .filter(Boolean)
        .join('\n\n')
      yield {
        type: 'progress',
        stage: 'refine',
        message: !meetsDepthFloor(audit)
          ? `Depth ${audit.wordCount}/${minWords} words — expanding…`
          : !meetsShipQuality(audit)
            ? `Quality gate · human ${audit.humanScore ?? q.humanScore}/100 — rewriting voice…`
            : `Audit ${audit.score} < ${minAudit} — refining…`,
      }
    }

    // ── PASS 2: Depth rescue (expand/append until floor met) ──────────────
    // Extracted to lib/seoFactory/depthRescue.ts so the expand → append →
    // focus-rotation → stall behavior is regression-tested with mocked
    // providers. The generator emits the same progress/delta/attempt events
    // and a final `done` event carries the updated state back to the pipeline.
    // Critically-thin drafts (<200 words) are handled inside runDepthRescue
    // with an immediate skip + progress message — no pipeline guard needed.
    for await (const ev of runDepthRescue({
      content,
      audit,
      title,
      topic,
      primaryKeyword,
      region,
      contentType,
      minWords,
      targetWords,
      maxWords,
      minAudit,
      indexable: plan.indexable,
      ownershipBlockers: plan.blockers,
      h2Outline: input.h2Outline as string[] | undefined,
      aiProvider: input.aiProvider,
      system,
      generateText: async (g) =>
        generateContentText({
          system: g.system || system,
          prompt: g.prompt,
          maxTokens: g.maxTokens,
          temperature: g.temperature,
          aiProvider: g.aiProvider,
        }),
    })) {
      if (ev.type === 'done') {
        content = ev.content
        audit = ev.audit
        provider = ev.provider
        model = ev.model
        expandPasses = ev.expandPasses
        attempts = ev.attempts
        rescueStallCount = ev.stallCount
        rescueTimeMs = ev.timeMs
        rescueBudgetMs = ev.budgetMs
        // Structured stats event so the Draft stage can surface expansion rounds,
        // stall count, and the time budget without parsing log lines.
        yield {
          type: 'rescue',
          stats: {
            expandPasses: ev.expandPasses,
            attempts: ev.attempts,
            stallCount: ev.stallCount,
            timeMs: ev.timeMs,
            budgetMs: ev.budgetMs,
          },
        }
        break
      }
      yield ev
    }

    // ── PASS 3: Quality refine after depth rescue ────────────────────────
    // Depth rescue can introduce new quality issues (AI slop from appended
    // sections), and a thin draft still carries voice/schema/disclaimer
    // blockers. Run the quality pass whenever content is substantial, EVEN IF
    // depth is still short — otherwise the non-depth blockers that dragged a
    // score to 33 are never fixed (the old gate skipped the whole pass below
    // the word floor).
    if (!meetsShipQuality(audit) && countBodyWords(content) >= Math.max(400, Math.floor(minWords * 0.4))) {
      stalledCount = 0
      for (let j = 0; j <= Math.min(1, maxRefine); j++) {
        attempts++
        const prevBlockers = audit.blockers.length
        const prevScore = audit.score
        const prevWords = countBodyWords(content)

        const q = evaluateContentQuality({
          content,
          contentType,
          primaryKeyword,
          indexable: plan.indexable,
          region,
        })
        refineNotes = [
          auditToRefineNotes({ ...audit, minWords, targetWords, maxWords }),
          !q.ok || q.humanScore < 75 ? qualityToRefineNotes(q) : '',
        ]
          .filter(Boolean)
          .join('\n\n')

        if (!refineNotes.trim()) break

        yield {
          type: 'progress',
          stage: 'refine',
          message: `Post-depth quality refine ${j + 1}/4 · score ${audit.score} …`,
        }

        try {
          const ai = await generateContentText({
            system,
            prompt: buildFactoryUserPrompt({
              title,
              topic,
              primaryKeyword,
              region,
              contentType,
              tone,
              audience: input.audience,
              gscBlock,
              opportunityAction: input.opportunityAction,
              writeHint: input.writeHint,
              modelGuidance: input.modelGuidance || undefined,
              masterEngineBlock: input.masterEngineBlock || undefined,
              refineNotes,
              marketplaceCta: input.marketplaceCta,
              titleCandidate: input.titleCandidate,
              // Revise the existing draft — fixes must accumulate, not restart.
              draft: content || undefined,
            }),
            // A full 2200+ word legal guide needs room: 6000 truncated the
            // revision and the discarded result made quality fixes never land.
            maxTokens: contentType === 'marketplace_gig' ? 4000 : 12000,
            temperature: 0.35,
            aiProvider: input.aiProvider,
          })
          const aiWords = countBodyWords(ai.text)
          // Accept when the revision clears the floor, OR when it materially
          // improves the blockers (voice/schema/disclaimer) without shrinking
          // the draft below where it started. Depth can still be topped up by
          // the post-refine expand below.
          const fixedBlockers = auditContent({
            content: ai.text,
            contentType,
            primaryKeyword,
            indexable: plan.indexable,
            ownershipBlockers: plan.blockers,
            // Apples-to-apples with the refineNotes the model was told to fix:
            // keyword coverage must count toward the blocker comparison too.
            requiredShortKeywords,
            requiredLongTailKeywords,
            shortKeywordTerms,
            longTailKeywordTerms,
          })
          const blockerReduced = fixedBlockers.blockers.length < prevBlockers
          const stillUnderFloor = aiWords < minWords
          // When still under the floor, never accept a shrink (depth is the
          // binding constraint); the −200 tolerance only applies once the
          // revision already clears the floor, so we can't spiral into a
          // single huge expand from a shrunken base.
          const notShrunk = stillUnderFloor ? aiWords >= prevWords : aiWords >= prevWords - 200
          if (aiWords >= minWords || (blockerReduced && notShrunk)) {
            content = ai.text
            provider = ai.provider
            model = ai.model
          }
        } catch (e) {
          yield {
            type: 'progress',
            stage: 'refine',
            message: `Post-depth quality refine failed: ${e instanceof Error ? e.message : 'error'}`,
          }
          break
        }

        audit = auditContent({
          content,
          contentType,
          primaryKeyword,
          indexable: plan.indexable,
          ownershipBlockers: plan.blockers,
        })

        yield {
          type: 'attempt',
          attempt: attempts,
          score: audit.score,
          wordCount: audit.wordCount,
          goodEnough: meetsShipQuality(audit) && audit.score >= minAudit,
          draft: content,
        }

        if (meetsShipQuality(audit) && audit.score >= minAudit) break

        const improved = audit.score > prevScore || audit.blockers.length < prevBlockers
        if (!improved) {
          stalledCount++
          if (stalledCount >= maxStalled) break
        } else {
          stalledCount = Math.max(0, stalledCount - 1)
        }
      }
    }

    // ── PASS 3b: Final depth top-up on the quality-fixed draft ───────────
    // The quality pass above fixes voice/schema/disclaimer on the current
    // draft. If depth is STILL short, expand exactly that fixed draft (one
    // more measured pass) so the non-depth fixes aren't thrown away by the
    // depth gate — the old flow ran depth first and skipped quality entirely
    // when the floor wasn't met, which is how a 33-score draft could ship.
    if (!meetsDepthFloor(audit) && countBodyWords(content) >= Math.max(200, Math.floor(minWords * 0.2))) {
      const before = countBodyWords(content)
      try {
        const expand = await generateContentText({
          system,
          prompt: buildDepthExpandPrompt({
            title,
            topic,
            primaryKeyword,
            region,
            contentType,
            minWords,
            targetWords,
            maxWords,
            currentWords: countBodyWords(content),
            draft: content,
            h2Outline: input.h2Outline as string[] | undefined,
          }),
          maxTokens: contentType === 'marketplace_gig' ? 4000 : 12000,
          temperature: 0.4,
          aiProvider: input.aiProvider,
        })
        if (countBodyWords(expand.text) > before) {
          content = expand.text
          provider = expand.provider
          model = expand.model
          yield {
            type: 'progress',
            stage: 'refine',
            message: `Final depth top-up: ${before} → ${countBodyWords(content)} words`,
          }
        }
      } catch (e) {
        yield {
          type: 'progress',
          stage: 'refine',
          message: `Final depth top-up skipped: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}`,
        }
      }
      audit = auditContent({
        content,
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        ownershipBlockers: plan.blockers,
      })
      attempts++
      yield {
        type: 'attempt',
        attempt: attempts,
        score: audit.score,
        wordCount: audit.wordCount,
        goodEnough: meetsShipQuality(audit) && audit.score >= minAudit,
        draft: content,
      }
    }

    // ── PASS 4: Scaffold + final quality lock ────────────────────────────
    const { ensureEditorialScaffold } = await import('./editorialScaffold')
    content = ensureEditorialScaffold({
      content,
      title: title || primaryKeyword,
      primaryKeyword,
      region,
    })

    audit = auditContent({
      content,
      contentType,
      primaryKeyword,
      indexable: plan.indexable,
      ownershipBlockers: plan.blockers,
    })

    // After scaffold, if blockers remain, do one final targeted refine
    if (!meetsShipQuality(audit) && audit.blockers.length > 0 && attempts < 8) {
      const q = evaluateContentQuality({
        content,
        contentType,
        primaryKeyword,
        indexable: plan.indexable,
        requiredShortKeywords,
        requiredLongTailKeywords,
        shortKeywordTerms,
        longTailKeywordTerms,
        region,
      })
      refineNotes = [
        auditToRefineNotes({ ...audit, minWords, targetWords, maxWords }),
        !q.ok || q.humanScore < 75 ? qualityToRefineNotes(q) : '',
      ]
        .filter(Boolean)
        .join('\n\n')

      if (refineNotes.trim()) {
        attempts++
        yield {
          type: 'progress',
          stage: 'refine',
          message: 'Final quality pass after scaffold — fixing remaining blockers…',
        }
        try {
          const ai = await generateContentText({
            system,
            prompt: buildFactoryUserPrompt({
              title,
              topic,
              primaryKeyword,
              region,
              contentType,
              tone,
              audience: input.audience,
              gscBlock,
              opportunityAction: input.opportunityAction,
              writeHint: input.writeHint,
              modelGuidance: input.modelGuidance || undefined,
              masterEngineBlock: input.masterEngineBlock || undefined,
              refineNotes,
              // Revise the scaffolded draft — never regenerate from scratch.
              draft: content || undefined,
            }),
            maxTokens: contentType === 'marketplace_gig' ? 4000 : 12000,
            temperature: 0.3,
            aiProvider: input.aiProvider,
          })
          const aiWords = countBodyWords(ai.text)
          const fixedBlockers = auditContent({
            content: ai.text,
            contentType,
            primaryKeyword,
            indexable: plan.indexable,
            ownershipBlockers: plan.blockers,
            requiredShortKeywords,
            requiredLongTailKeywords,
            shortKeywordTerms,
            longTailKeywordTerms,
          })
          const blockerReduced = fixedBlockers.blockers.length < audit.blockers.length
          const stillUnderFloor = aiWords < minWords
          const notShrunk = stillUnderFloor
            ? aiWords >= countBodyWords(content)
            : aiWords >= countBodyWords(content) - 200
          if (aiWords >= minWords || (blockerReduced && notShrunk)) {
            content = ai.text
            provider = ai.provider
            model = ai.model
          }
        } catch (e) {
          yield {
            type: 'progress',
            stage: 'refine',
            message: `Post-scaffold refine failed: ${e instanceof Error ? e.message : 'error'}`,
          }
        }
        // Re-scaffold and re-audit
        content = ensureEditorialScaffold({
          content,
          title: title || primaryKeyword,
          primaryKeyword,
          region,
        })
        audit = auditContent({
          content,
          contentType,
          primaryKeyword,
          indexable: plan.indexable,
          ownershipBlockers: plan.blockers,
        })
      }
    }

    // ── PASS 5: Resolve mechanical blockers before push ────────────────────
    // Deterministic repairs for blockers the model repeatedly misses, so a
    // small em-dash or disclaimer miss never blocks the daily ship.
    {
      let repaired = content
      const dashes = (repaired.match(/[\u2014\u2013]/g) || []).length
      if (dashes > 0) {
        repaired = repaired
          .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2')
          .replace(/\s+[\u2014\u2013]\s+/g, ', ')
          .replace(/[\u2014\u2013]/g, ', ')
      }
      if (!/not legal advice|educational only|consult (an? )?(attorney|lawyer|solicitor|regulated)/i.test(repaired)) {
        repaired = `${repaired.trimEnd()}\n\n---\n\n*This guide is for general information and educational purposes only. It is not legal advice. For your specific situation, consult a licensed attorney or immigration professional.*\n`
      }
      if (repaired !== content) {
        content = repaired
        yield { type: 'progress', stage: 'refine', message: 'Applied deterministic compliance repair (dashes, disclaimer)…' }
      }
      const sanitized = await sanitizeDraftLinksLive(content, {
        region,
        topic,
        keywords: mergedKeywords,
        externalAllowlist: verifiedSourceUrls,
      })
      if (sanitized.stripped || sanitized.injected) {
        content = sanitized.content
        yield {
          type: 'progress',
          stage: 'refine',
          message: `Live-checked citations — stripped ${sanitized.stripped} dead/untrusted link${sanitized.stripped === 1 ? '' : 's'}${sanitized.injected ? `, injected ${sanitized.injected} official source${sanitized.injected === 1 ? '' : 's'}` : ''}`,
        }
      }
      if (repaired !== content || sanitized.stripped || sanitized.injected) {
        audit = auditContent({
          content,
          contentType,
          primaryKeyword,
          indexable: plan.indexable,
          ownershipBlockers: plan.blockers,
        })
        yield { type: 'attempt', attempt: attempts + 1, score: audit.score, wordCount: audit.wordCount, goodEnough: meetsShipQuality(audit) && audit.score >= minAudit, draft: content }
      }
    }

    // ── PASS 5b: Full deterministic repair before the ship decision ─────
    // PASS 5 only fixes dashes/disclaimer/links. The FULL repair set (schema,
    // TOC, FAQ formatting, internal links, keyword slots) previously ran only
    // inside shipContent — AFTER the withhold decision — so a draft that
    // scores 100 once repaired was withheld at its raw score and never
    // reached the gates (2026-08-28 live run: AU regen withheld at 55,
    // repaired to 100 offline). Repair + re-audit HERE so the withhold check
    // sees the same content the ship gate stack would see.
    {
      const repairedFull = applyDeterministicRepairs({
        content,
        title: title || primaryKeyword,
        primaryKeyword,
        region,
        indexable: plan.indexable,
        contentType,
        requiredShortKeywords,
        requiredLongTailKeywords,
        maxWords: undefined,
      })
      if (repairedFull.applied.length) {
        content = repairedFull.content
        audit = auditContent({
          content,
          contentType,
          primaryKeyword,
          indexable: plan.indexable,
          ownershipBlockers: plan.blockers,
        })
        yield {
          type: 'progress',
          stage: 'refine',
          message: `Deterministic repair before ship decision: ${repairedFull.applied.slice(0, 6).join(', ')}${repairedFull.applied.length > 6 ? ` +${repairedFull.applied.length - 6} more` : ''}`,
        }
        yield {
          type: 'attempt',
          attempt: attempts + 1,
          score: audit.score,
          wordCount: audit.wordCount,
          goodEnough: meetsShipQuality(audit) && audit.score >= minAudit,
          draft: content,
        }
      }
    }

    let effectiveRequested = requestedMode
    if (input.dryRun && effectiveRequested === 'none') effectiveRequested = 'merge'

    let shipMode = resolveShipMode(effectiveRequested, audit, plan)
    let gateHold: string | null = null
    if (!meetsShipQuality(audit) && shipMode !== 'none' && shipMode !== 'pr') {
      gateHold = `Ship withheld (quality/depth) · audit ${audit.score} · words ${audit.wordCount}`
      shipMode = 'none'
    }
    if (
      input.skipShipIfBelowScore !== false &&
      shipMode !== 'none' &&
      (audit.score < minAudit || !meetsShipQuality(audit)) &&
      effectiveRequested !== 'pr'
    ) {
      if (!meetsShipQuality(audit)) {
        if (meetsDepthFloor(audit) && audit.score >= 40 && plan.blockers.length === 0) {
          shipMode = 'pr'
          gateHold = null
        } else {
          gateHold = `Ship withheld (quality/depth) · audit ${audit.score} · words ${audit.wordCount}`
          shipMode = 'none'
        }
      } else if (
        effectiveRequested === 'auto' ||
        effectiveRequested === 'autodeploy' ||
        effectiveRequested === 'merge'
      ) {
        shipMode = audit.score >= 50 ? 'pr' : 'none'
        if (shipMode === 'none') {
          gateHold = `Ship withheld (audit ${audit.score} < 50)`
        }
      }
    }

    // Auto index: once every check has passed, strip any stale noindex so the
    // stored draft and shipped page are indexable by default.
    if (plan.indexable) {
      const stripped = stripNoIndex(content)
      if (stripped !== content) {
        content = stripped
        audit = auditContent({
          content,
          contentType,
          primaryKeyword,
          indexable: plan.indexable,
          ownershipBlockers: plan.blockers,
        })
        yield {
          type: 'progress',
          stage: 'ship',
          message: 'All checks passed — noindex removed, article is now indexable',
        }
      }
    }

    let shipResult: ShipResult | null = null
    let shipError: string | null = null

    // ── Content-topic validation ────────────────────────────────────────
    {
      const primaryKwLower = (primaryKeyword || '').toLowerCase()
      const topicLower = (topic || '').toLowerCase()
      const contentLower = content.toLowerCase()
      const h1Match = content.match(/^#\s+(.+)/m)
      const h1Lower = (h1Match?.[1] || '').toLowerCase()

      const kwWords = primaryKwLower.split(/\s+/).filter(w => w.length > 3)
      const kwHits = kwWords.filter(w => contentLower.includes(w)).length
      const kwMissing = kwWords.length > 0 && kwHits === 0

      const topicWords = topicLower.split(/\s+/).filter(w => w.length > 4)
      const topicHits = topicWords.filter(w => contentLower.includes(w)).length
      const topicMissing = topicWords.length >= 3 && topicHits < topicWords.length * 0.3

      if (kwMissing || topicMissing) {
        const detail = [
          kwMissing ? `primary keyword "${primaryKeyword}" not found in content` : '',
          topicMissing ? `topic words from "${topic}" barely appear (${topicHits}/${topicWords.length})` : '',
        ].filter(Boolean).join('; ')
        shipError = `Content-topic mismatch: ${detail}`
        console.error(`[pipelineStream] REFUSED ship — ${shipError}`)
      }
    }

    // ── Topic vs path-slug validation ────────────────────────────────────
    // Same ship-refuse guard as the non-streaming pipeline: asylum content
    // must never land on an OPT slug. No Git write on mismatch.
    if (!shipError) {
      const pathMismatch = topicPathMismatch(
        topic,
        primaryKeyword,
        (plan as { filePath?: string; canonicalPath?: string }).filePath ||
          (plan as { canonicalPath?: string }).canonicalPath ||
          '',
      )
      if (pathMismatch) {
        shipError = pathMismatch
        shipMode = 'none'
        console.error(`[pipelineStream] REFUSED ship — ${shipError}`)
      }
    }

    if (shipMode !== 'none' && !shipError) {
      yield {
        type: 'progress',
        stage: 'ship',
        message: `Shipping via ${shipMode}${input.dryRun ? ' (dry run)' : ''}…`,
      }
      try {
        shipResult = await shipContent({
          mode: shipMode,
          plan,
          content,
          title: title || primaryKeyword,
          region,
          contentType,
          primaryKeyword,
          audit,
          dryRun: Boolean(input.dryRun),
          requiredShortKeywords,
          requiredLongTailKeywords,
          shortKeywordTerms,
          longTailKeywordTerms,
        })
      } catch (e) {
        shipError = e instanceof Error ? e.message : 'Ship failed'
      }
    } else {
      shipError =
        gateHold ||
        `Ship withheld · audit ${audit.score} · words ${audit.wordCount}`
      yield {
        type: 'progress',
        stage: 'ship',
        message: shipError,
      }
    }

    yield { type: 'ship', ship: shipResult, shipError, shipMode }

    let jobId: string | null = null
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      // Jobs refused by quality gate stay 'drafting' so the editor can fix them.
      // Only set 'failed' when there is no content (pipeline crashed before writing).
      const status =
        shipResult?.status === 'deployed' || shipResult?.status === 'merged'
          ? 'merged'
          : shipResult?.status === 'pr_created'
            ? 'pr_created'
            : shipError
              ? (content && content.length > 100 ? 'drafting' : 'failed')
              : 'drafting'

      const seedLog = [
        {
          id: `pipe-${Date.now()}`,
          ts: Date.now(),
          level: shipError ? 'warn' : 'success',
          source: 'pipeline',
          message: shipResult
            ? `Shipped ${shipResult.status} · audit ${audit.score}`
            : `Generated · audit ${audit.score} · ${provider}`,
          detail: shipError || shipResult?.prUrl || undefined,
        },
      ]

      const baseRow: Record<string, unknown> = {
        user_id: input.userId || 'admin',
        source_job_id: input.sourceJobId || null,
        lineage: {
          modelVersion: 'seo-intelligence-v1',
          sourceJobId: input.sourceJobId || null,
          regenerationMode: input.regenerationMode || null,
          evidence: input.intelligenceLineage || null,
        },
        regeneration_reason: input.regenerationReason || null,
        regeneration_mode: input.regenerationMode || null,
        title,
        topic,
        content_type: normalizeJobContentType(contentType),
        tone,
        region,
        target_repo: plan.repo,
        status,
        slug: plan.filePath.split('/').filter(Boolean).slice(-2, -1)[0] || null,
        content,
        branch_name: shipResult?.branch || null,
        content_path: shipResult?.path || plan.filePath,
        pr_url: shipResult?.prUrl || null,
        pr_number: shipResult?.prNumber || null,
        ai_provider: provider,
        word_count: audit.wordCount,
        seo_score: audit.score,
        ship_mode:
          shipMode === 'none' || shipMode === 'pr' ? 'pr' : 'autodeploy',
        indexable: plan.indexable,
        canonical_url: plan.canonicalUrl,
        owner_host: plan.host,
        primary_keyword: primaryKeyword,
        audit_json: {
          ...audit,
          attempts,
          model,
          minAudit,
          // Immutable ContentSpec snapshot (brief §3.2) — briefing, writer,
          // reviewer, re-audit, and ship all read this same JSON snapshot.
          ...(contentSpec ? { contentSpec } : {}),
          rescue: expandPasses > 0
            ? {
                expandPasses,
                stallCount: rescueStallCount,
                timeMs: rescueTimeMs,
                budgetMs: rescueBudgetMs,
              }
            : undefined,
        },
        gsc_json: {
          source: gscBrief.source,
          mode: gscBrief.mode,
          primaryKeywords: gscBrief.primaryKeywords.slice(0, 8),
          opportunityAction: input.opportunityAction,
          cluster: input.cluster
            ? {
                clusterId: input.cluster.clusterId || null,
                canonicalTerm: input.cluster.canonicalTerm || null,
                keywords: (input.cluster.keywords || []).slice(0, 24),
                mode: input.cluster.mode || 'new',
                targetUrl: input.cluster.targetUrl || null,
                existingJobId: input.cluster.existingJobId || null,
              }
            : null,
        },
        required_short_keywords: requiredShortKeywords,
        required_long_tail_keywords: requiredLongTailKeywords,
        // Persist provenance so a later re-audit / approve does not downgrade
        // synthesized backfill into enforceable demand blockers.
        short_keyword_terms: shortKeywordTerms,
        long_tail_keyword_terms: longTailKeywordTerms,
        keyword_partition_source: 'word_count_v1',
        deploy_sha: shipResult?.mergeCommitSha || shipResult?.commitSha || null,
        deployed_at:
          shipResult?.status === 'deployed' || shipResult?.status === 'merged'
            ? new Date().toISOString()
            : null,
        merged_at:
          shipResult?.status === 'deployed' || shipResult?.status === 'merged'
            ? new Date().toISOString()
            : null,
        llms_included: audit.llmsRecommended,
        error_message: shipError,
      }

      // Prefer updating the early-created realtime row; fall back to a fresh insert.
      let job: { id: string } | null = earlyJobId ? { id: earlyJobId } : null
      if (job) {
        const { error: updateErr } = await supabase.from('content_jobs').update({ ...baseRow, event_log: seedLog }).eq('id', job.id)
        if (updateErr && /event_log|lineage|regeneration_reason|regeneration_mode|column/i.test(updateErr.message || '')) {
          const { source_job_id: _sourceJobId, lineage: _lineage, regeneration_reason: _reason, regeneration_mode: _mode, ...legacyPatch } = baseRow
          const legacyUpdate = await supabase.from('content_jobs').update(legacyPatch).eq('id', job.id)
          if (legacyUpdate.error) console.warn('[seoFactory/pipelineStream] legacy job update', legacyUpdate.error.message)
        }
        jobId = job.id
      } else {
        const withLog = await supabase
          .from('content_jobs')
          .insert({ ...baseRow, event_log: seedLog })
          .select('id')
          .single()
        if (withLog.data?.id) {
          job = withLog.data
        } else if (withLog.error && /event_log|lineage|regeneration_reason|regeneration_mode|column/i.test(withLog.error.message || '')) {
          const { source_job_id: _sourceJobId, lineage: _lineage, regeneration_reason: _reason, regeneration_mode: _mode, ...legacyRow } = baseRow
          const without = await supabase.from('content_jobs').insert(legacyRow).select('id').single()
          job = without.data
          if (without.error) console.warn('[seoFactory/pipelineStream] legacy job insert', without.error.message)
        } else if (withLog.error) {
          console.warn('[seoFactory/pipelineStream] job insert', withLog.error.message)
        }
        jobId = job?.id ?? null
      }
      if (jobId && plan.canonicalUrl) {
        await supabase
          .from('content_jobs')
          .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
            error_message: `Superseded by in-place repair of ${jobId}`,
          })
          .eq('canonical_url', plan.canonicalUrl)
          .in('status', ['drafting', 'pending', 'failed'])
          .neq('id', jobId)
      }
    } catch (e) {
      console.warn('[seoFactory/pipelineStream] job persist skipped', e)
    }

    const result: PipelineResult = {
      ok: !shipError,
      content,
      plan,
      audit,
      ship: shipResult,
      shipError,
      shipMode,
      provider,
      model,
      attempts,
      gsc: {
        source: gscBrief.source,
        mode: gscBrief.mode,
        primaryKeywords: gscBrief.primaryKeywords.slice(0, 8),
        opportunityKeywords: gscBrief.opportunityKeywords.slice(0, 6),
        warnings: gscBrief.warnings,
      },
      jobId,
      error: shipError || undefined,
    }

    yield { type: 'final', result }
  } catch (e) {
    yield { type: 'error', error: e instanceof Error ? e.message : 'Pipeline failed' }
  }
}
