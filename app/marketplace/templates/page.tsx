import { notFound } from 'next/navigation'

/**
 * Template packs moved to the canonical /shop catalogue. Keep the old route as
 * a real 404 rather than a duplicate storefront so search engines and buyers
 * have one public product URL contract.
 */
export default function LegacyTemplatesIndexPage() {
  notFound()
}
