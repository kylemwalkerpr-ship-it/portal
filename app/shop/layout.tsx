import type { ReactNode } from 'react'

/**
 * File shop lives on market.yousafeconsultancy.com/shop (middleware pass-through).
 * Isolated from MarketplaceShell so the paper/navy catalog is not wrapped in
 * marketplace indigo chrome.
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return children
}
