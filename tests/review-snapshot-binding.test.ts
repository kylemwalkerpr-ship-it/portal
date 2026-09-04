/**
 * Title/body cross-contamination guard (2026-09-04).
 *
 * Live evidence: a Green Card draft job was CLAIMED with the Green Card title
 * (content_path/slug/canonical_url/source_job_id all null, event_log empty —
 * the claim-row signature), yet its `content` + `word_count` became the exact
 * previous merged H-1B article (1056 words, identical to the H-1B job row).
 * The write door that carried the mis-assigned body is
 * `persistReviewSnapshot` (editor autosave / DraftWorkspace flush → POST
 * /api/content-studio/drafts), which wrote content_jobs.content + word_count
 * for a client-supplied jobId. `reviewSnapshotContentMatchesJob` is the pure
 * guard that refuses to attach one job's body to another job's row.
 */
import { reviewSnapshotContentMatchesJob } from '@/lib/seoFactory/reviewSnapshots'

const H1B_BODY = `# H-1B Cap-Exempt Employers: Checklist Before You Apply (2026)

Discover whether your employer is cap-exempt and how to submit the H-1B petition without the regular annual lottery. Universities, non-profits affiliated with higher education, and government research organizations can file year-round petitions for their staff.

## What makes an employer cap-exempt

An employer is H-1B cap-exempt when it is an institution of higher education, a nonprofit organization related to or affiliated with such an institution, or a government research organization. The exemption applies to the 65,000-regular and 20,000-advanced-degree caps, so the annual registration lottery is not required.

## The checklist before you apply

Before the petition is filed, confirm the cap-exempt status, the worksite itinerary, and the Form I-129 filing fee. We review every requirement in order so the application is complete on the first attempt.

## Official sources

- USCIS H-1B Cap-Exempt Employers guidance
- Department of Homeland Security regulations`

const GREEN_CARD_BODY = `# How to Apply for a Green Card: 2026 Requirements & Documents

A green card grants lawful permanent residence in the United States. Use this guide to understand the family, employment, and diversity lottery pathways, and to collect the documents you need before filing Form I-485.

## The main green card pathways

Immediate relatives of U.S. citizens, employment-based preferences, and the diversity visa lottery cover most applicants. Your category determines how long the wait is and what documents you must submit.

## Required documents

Your birth certificate, passport, I-94 record, police certificates, and evidence of the qualifying relationship form the core package for a green card application.

## Official sources

- USCIS Green Card eligibility
- USCIS Form I-485 instructions`

describe('reviewSnapshotContentMatchesJob — title/body cross-contamination guard', () => {
  const greenCardJob = {
    title: 'How to Apply for a Green Card: 2026 Requirements & Documents',
    topic: 'how to apply for a green card',
    primary_keyword: 'how to apply for a green card',
  }

  it('rejects a different job\'s body (the live H-1B-into-GreenCard failure mode)', () => {
    expect(reviewSnapshotContentMatchesJob(H1B_BODY, greenCardJob)).toBe(false)
  })

  it('allows the matching job body (draft carries the job title in H1)', () => {
    expect(reviewSnapshotContentMatchesJob(GREEN_CARD_BODY, greenCardJob)).toBe(true)
  })

  it('allows a body whose topic words appear even when the H1 was re-titled', () => {
    const retitled = `# The Green Card Application Guide for 2026\n\nEverything about applying for a green card and the documents required.`
    expect(reviewSnapshotContentMatchesJob(retitled, greenCardJob)).toBe(true)
  })

  it('falls back across identities — a fresh keyword with zero overlap still binds via topic', () => {
    const job = { ...greenCardJob, primary_keyword: 'permanent residency usa' }
    expect(reviewSnapshotContentMatchesJob(GREEN_CARD_BODY, job)).toBe(true)
  })

  it('rejects a body that shares no identity words anywhere (radar-style stale buffer)', () => {
    const f1Body = `# F-1 Student Visa Guide\n\nSteps to maintain F-1 status through the I-20 program.`
    expect(reviewSnapshotContentMatchesJob(f1Body, greenCardJob)).toBe(false)
  })

  it('is permissive when the job has no identity to verify against', () => {
    expect(reviewSnapshotContentMatchesJob(H1B_BODY, null)).toBe(true)
    expect(reviewSnapshotContentMatchesJob(H1B_BODY, {})).toBe(true)
    expect(reviewSnapshotContentMatchesJob(H1B_BODY, { title: '', topic: '', primary_keyword: '' })).toBe(true)
  })

  it('rejects an empty body regardless of identity', () => {
    expect(reviewSnapshotContentMatchesJob('', greenCardJob)).toBe(false)
    expect(reviewSnapshotContentMatchesJob('   ', greenCardJob)).toBe(false)
  })

  it('ignores stop-word-only identities (no significant words -> cannot verify -> permissive)', () => {
    expect(reviewSnapshotContentMatchesJob(H1B_BODY, { title: 'for the a', topic: 'for the a' })).toBe(true)
  })
})