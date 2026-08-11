/**
 * Streaming SEO Factory pipeline — emits progress + content deltas for SSE.
 * Same logic as runSeoFactoryPipeline but progressive.
 */

import { createClient } from '@supabase/supabase-js'
import { resolveOwner, assertPlanRepoConsistency, type OwnerPlan } from './ownership'
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
  extractH2Titles,
  mergeAppendedSections,
  minWordsForType,
} from './prompts'
import { countBodyWords, targetWordsForType, maxWordsForType } from './contentDepth'
import { meetsDepthFloor, meetsShipQuality } from './audit'
import { evaluateContentQuality, qualityToRefineNotes } from './contentQualityGate'
import type { PipelineInput, PipelineResult, RequestedShipMode } from './pipeline'
import { stripNoIndex } from './siteHealthFixes'
import { partitionKeywords } from '@/lib/seoEngine/planner'

export type PipelineStreamEvent =
  | { type: 'progress'; stage: string; message: string }
  | { type: 'provider'; provider: string; model: string }
  | { type: 'job'; jobId: string }
  | { type: 'delta'; text: string; attempt: number; draft?: string }
  | { type: 'attempt'; attempt: number; score: number; wordCount: number; goodEnough: boolean; draft?: string }
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
    const primaryKeyword = (input.primaryKeyword || topic).trim()
    // Partition the user-supplied keywords + primary keyword into ≥5 short / ≥4 long-tail.
    const briefPartition = partitionKeywords(
      Array.isArray(input.keywords) ? input.keywords : [],
      primaryKeyword,
    )
    const requiredShortKeywords = briefPartition.short
    const requiredLongTailKeywords = briefPartition.longTail
    const title = (input.title || topic || primaryKeyword).trim()
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

    // Keyword cluster: merge the whole cluster into the brief so ONE page answers
    // every related query (anti-cannibalization). Resolve to an existing page
    // when the cluster says so.
    const clusterKeywords = Array.isArray(input.cluster?.keywords) ? input.cluster!.keywords! : []
    const mergedKeywords = Array.isArray(input.keywords)
      ? [...new Set([...input.keywords, primaryKeyword, ...clusterKeywords])].slice(0, 10)
      : [...new Set([primaryKeyword, ...clusterKeywords])].slice(0, 10)
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
    else if (plan.intentClass === 'transactional') contentType = 'blog_summary'
    else if (plan.intentClass === 'news_summary') contentType = 'blog_summary'
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
    let earlyJobId: string | null = null
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
        content_type: contentType === 'legal_guide' ? 'article' : contentType,
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

    const system = buildFactorySystemPrompt({
      plan,
      contentType,
      minWords,
      maxWords,
      strategyBlock,
      requiredShortKeywords,
      requiredLongTailKeywords,
      h2Outline: input.h2Outline as string[] | undefined,
      sources: input.sources as string[] | undefined,
      targetSlug: input.targetSlug as string | undefined,
      kwH2Map: input.kwH2Map as Record<string, string> | undefined,
    })

    let content = input.resumeContent?.trim() || ''
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

    // ── PASS 1: Main refine loop (depth + quality) ───────────────────────
    for (let i = 0; i <= maxRefine; i++) {
      attempts = i + 1
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
            currentWords: countBodyWords(content),
            draft: content,
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
            refineNotes,
          })

      const generationPrompt =
        resumeMode && i === 0 && !underDepth
          ? `${prompt}\n\nCONTINUE FROM THIS SAVED PARTIAL DRAFT. Preserve useful sections, improve the remaining quality issues, and output the complete revised piece.\n\nSAVED DRAFT:\n${content.slice(0, 60000)}`
          : prompt
      const prevWords = content ? countBodyWords(content) : 0
      let attemptText = ''
      for await (const ev of generateContentTextStream({
        system,
        prompt: generationPrompt,
        maxTokens: contentType === 'marketplace_gig' ? 4000 : underDepth ? 16384 : 16384,
        temperature: i === 0 ? 0.5 : underDepth ? 0.45 : 0.35,
        aiProvider: input.aiProvider,
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

      if (!(underDepth && countBodyWords(attemptText) < prevWords)) {
        content = attemptText
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
      })
      refineNotes = [
        auditToRefineNotes({ ...audit, minWords, targetWords }),
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
    const maxExpand = contentType === 'marketplace_gig' ? 1 : 5
    while (countBodyWords(content) < minWords && expandPasses < maxExpand) {
      expandPasses++
      attempts++
      const currentWords = countBodyWords(content)
      yield {
        type: 'progress',
        stage: 'refine',
        message: `Depth rescue ${expandPasses}/${maxExpand} · ${currentWords}/${minWords} words…`,
      }
      try {
        if (expandPasses === 1) {
          const ai = await generateContentText({
            system,
            prompt: buildDepthExpandPrompt({
              title,
              topic,
              primaryKeyword,
              region,
              contentType,
              minWords,
              targetWords,
              currentWords,
              draft: content,
            }),
            maxTokens: contentType === 'marketplace_gig' ? 4000 : 16384,
            temperature: 0.42,
            aiProvider: input.aiProvider,
          })
          if (countBodyWords(ai.text) > currentWords) {
            content = ai.text
            provider = ai.provider
            model = ai.model
            yield { type: 'delta', text: '\n\n<!-- depth expand applied -->\n\n', attempt: attempts }
            yield { type: 'delta', text: content.slice(0, 500), attempt: attempts }
          }
        } else {
          const ai = await generateContentText({
            system:
              'You expand immigration educational guides with concrete practitioner sections. No front matter. No JSON-LD. No AI clichés. No outcome guarantees.',
            prompt: buildDepthAppendPrompt({
              primaryKeyword,
              region,
              minWords,
              currentWords,
              existingH2s: extractH2Titles(content),
              draftExcerpt: content,
            }),
            maxTokens: 6000,
            temperature: 0.45,
            aiProvider: input.aiProvider,
          })
          const merged = mergeAppendedSections(content, ai.text)
          if (countBodyWords(merged) > currentWords) {
            content = merged
            provider = ai.provider
            model = ai.model
          } else {
            break
          }
        }
      } catch (e) {
        yield {
          type: 'progress',
          stage: 'refine',
          message: `Depth rescue failed: ${e instanceof Error ? e.message : 'error'}`,
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
      if (meetsDepthFloor(audit) && meetsShipQuality(audit) && audit.score >= minAudit) break
    }

    // ── PASS 3: Quality refine after depth rescue ────────────────────────
    // Depth rescue can introduce new quality issues (AI slop from appended sections).
    if (!meetsShipQuality(audit) && countBodyWords(content) >= minWords) {
      stalledCount = 0
      for (let j = 0; j <= Math.min(1, maxRefine); j++) {
        attempts++
        const prevBlockers = audit.blockers.length
        const prevScore = audit.score

        const q = evaluateContentQuality({
          content,
          contentType,
          primaryKeyword,
          indexable: plan.indexable,
        })
        refineNotes = [
          auditToRefineNotes({ ...audit, minWords, targetWords }),
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
              refineNotes,
            }),
            maxTokens: contentType === 'marketplace_gig' ? 4000 : 6000,
            temperature: 0.35,
            aiProvider: input.aiProvider,
          })
          if (countBodyWords(ai.text) >= minWords) {
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
      })
      refineNotes = [
        auditToRefineNotes({ ...audit, minWords, targetWords }),
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
              refineNotes,
            }),
            maxTokens: contentType === 'marketplace_gig' ? 4000 : 6000,
            temperature: 0.3,
            aiProvider: input.aiProvider,
          })
          if (countBodyWords(ai.text) >= minWords) {
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
        audit = auditContent({
          content,
          contentType,
          primaryKeyword,
          indexable: plan.indexable,
          ownershipBlockers: plan.blockers,
        })
        yield { type: 'progress', stage: 'refine', message: 'Applied deterministic compliance repair (dashes, disclaimer)…' }
        yield { type: 'attempt', attempt: attempts + 1, score: audit.score, wordCount: audit.wordCount, goodEnough: meetsShipQuality(audit) && audit.score >= minAudit, draft: content }
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

    if (shipMode !== 'none') {
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
      const status =
        shipResult?.status === 'deployed' || shipResult?.status === 'merged'
          ? 'merged'
          : shipResult?.status === 'pr_created'
            ? 'pr_created'
            : shipError
              ? 'failed'
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
        content_type: contentType === 'legal_guide' ? 'article' : contentType,
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
        audit_json: { ...audit, attempts, model, minAudit },
        gsc_json: {
          source: gscBrief.source,
          mode: gscBrief.mode,
          primaryKeywords: gscBrief.primaryKeywords.slice(0, 8),
          opportunityAction: input.opportunityAction,
          cluster: input.cluster
            ? {
                clusterId: input.cluster.clusterId || null,
                canonicalTerm: input.cluster.canonicalTerm || null,
                keywords: (input.cluster.keywords || []).slice(0, 10),
                mode: input.cluster.mode || 'new',
                targetUrl: input.cluster.targetUrl || null,
                existingJobId: input.cluster.existingJobId || null,
              }
            : null,
        },
        required_short_keywords: requiredShortKeywords,
        required_long_tail_keywords: requiredLongTailKeywords,
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
