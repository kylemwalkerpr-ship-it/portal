import manifest from '@/contracts/yousafe-acquisition-offers.v1.json'

export const GROWTH_OWNER_MANIFEST = manifest
export type GrowthOwnerOffer = (typeof manifest.offers)[number]

export function offerForPolicy(policyRef: string): GrowthOwnerOffer | null {
  return GROWTH_OWNER_MANIFEST.offers.find((offer) => offer.policy_ref === policyRef) ?? null
}

export function offerForMapping(policyRef: string, campaignId: string, gigId: string): GrowthOwnerOffer | null {
  const offer = offerForPolicy(policyRef)
  return offer?.campaign_id === campaignId && offer.gig_id === gigId ? offer : null
}
