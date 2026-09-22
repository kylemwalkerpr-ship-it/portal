/**
 * Client-safe ownership identity contract.
 *
 * Keep pure constants/types here so UI-importable SEO helpers can validate
 * estate hosts without pulling the server-only ownership registry loader into
 * client bundles. Runtime registry loading remains in ownership.ts.
 */
export type OwnerHost = 'legal' | 'usa' | 'ca' | 'uk' | 'au' | 'apex' | 'market'

export const HOST_PUBLIC: Record<OwnerHost, string> = {
  legal: 'https://legal.yousafeconsultancy.com',
  apex: 'https://yousafeconsultancy.com',
  usa: 'https://usa.yousafeconsultancy.com',
  uk: 'https://uk.yousafeconsultancy.com',
  ca: 'https://ca.yousafeconsultancy.com',
  au: 'https://au.yousafeconsultancy.com',
  market: 'https://market.yousafeconsultancy.com',
}
