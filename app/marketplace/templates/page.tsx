import { permanentRedirect } from 'next/navigation'

/**
 * Template packs moved to the canonical File Shop. Preserve historical links
 * with one permanent hop instead of returning a hard 404.
 */
export default function LegacyTemplatesIndexPage() {
  permanentRedirect('https://market.yousafeconsultancy.com/shop')
}
