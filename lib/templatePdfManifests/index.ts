// Manifest index. Each catalogue slug has a dedicated manifest module
// alongside this file. We keep the import map static so the bundler
// can tree-shake reliably on the Cloudflare Worker target.
import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import { TEMPLATE_PACKS } from '@/lib/template-packs'
import { includesFallbackSections } from './_shared'

import usF1Student from './us-f1-student-visa-ds160-i20-pack'
import usF1Interview from './us-f1-interview-home-ties-pack'
import usB1B2 from './us-b1b2-visitor-visa-ds160-invitation-pack'
import usOpt from './us-opt-i765-application-prep-pack'
import usStemOpt from './us-stem-opt-i765-i983-companion-pack'
import usI134 from './us-i134-financial-support-companion-pack'
import caStudyPermit from './canada-study-permit-complete-pack'
import caPof from './canada-proof-of-funds-sponsor-pack'
import caStudyPlan from './canada-study-plan-letter-of-explanation-pack'
import caTrv from './canada-trv-visitor-visa-pack'
import caWorkPermit from './canada-work-permit-outside-canada-pack'
import caPgwp from './canada-pgwp-application-pack'
import caFamily from './canada-family-information-travel-history-pack'
import refusalPack from './us-canada-refusal-reapplication-response-pack'
import intakeKit from './universal-client-intake-document-review-kit'
import megaBundle from './premium-usa-canada-study-work-mega-bundle'

const MANIFEST_MAP: Record<string, TemplatePdfManifest> = {
  [usF1Student.slug]: usF1Student,
  [usF1Interview.slug]: usF1Interview,
  [usB1B2.slug]: usB1B2,
  [usOpt.slug]: usOpt,
  [usStemOpt.slug]: usStemOpt,
  [usI134.slug]: usI134,
  [caStudyPermit.slug]: caStudyPermit,
  [caPof.slug]: caPof,
  [caStudyPlan.slug]: caStudyPlan,
  [caTrv.slug]: caTrv,
  [caWorkPermit.slug]: caWorkPermit,
  [caPgwp.slug]: caPgwp,
  [caFamily.slug]: caFamily,
  [refusalPack.slug]: refusalPack,
  [intakeKit.slug]: intakeKit,
  [megaBundle.slug]: megaBundle,
}

/**
 * Look up a manifest for a catalogue slug. Returns:
 *   - the explicit per-slug manifest if one is registered
 *   - a placeholder manifest derived from the catalogue includes[] if the
 *     slug exists in the catalogue but has no explicit manifest yet
 *   - null only if the slug is not in the catalogue at all
 *
 * Self-heal pattern — the wallet-debit hook calls this for every slug
 * the user just paid for, and must NEVER crash for an unknown slug.
 */
export function getManifest(slug: string): TemplatePdfManifest | null {
  if (MANIFEST_MAP[slug]) return MANIFEST_MAP[slug]
  const pack = TEMPLATE_PACKS.find((p) => p.slug === slug)
  if (!pack) return null
  // TODO: refine from worksheet
  return {
    slug,
    sections: includesFallbackSections(pack.includes || []),
  }
}

/** Slugs that ship an explicit manifest (not the catalogue fallback). */
export function listManifestSlugs(): string[] {
  return Object.keys(MANIFEST_MAP)
}

export { MANIFEST_MAP }
