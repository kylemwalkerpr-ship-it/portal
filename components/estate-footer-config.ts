export interface FooterLink { label: string; href: string }
export interface FooterColumn { heading: string; links: FooterLink[] }

export const ESTATE_FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: 'Study & Migrate',
    links: [
      { label: 'USA — F-1 student visas', href: 'https://usa.yousafeconsultancy.com/' },
      { label: 'Canada — study permits', href: 'https://ca.yousafeconsultancy.com/' },
      { label: 'UK — Student Route', href: 'https://uk.yousafeconsultancy.com/' },
      { label: 'Country guides', href: 'https://usa.yousafeconsultancy.com/from/' },
      { label: 'University guides', href: 'https://usa.yousafeconsultancy.com/universities/' },
    ],
  },
  {
    heading: 'Legal & Tenancy',
    links: [
      { label: 'Legal article library', href: 'https://legal.yousafeconsultancy.com/' },
      { label: 'US immigration & status', href: 'https://legal.yousafeconsultancy.com/us/' },
      { label: 'UK immigration & tenancy', href: 'https://legal.yousafeconsultancy.com/uk/' },
      { label: 'Canada study & PR', href: 'https://legal.yousafeconsultancy.com/ca/' },
    ],
  },
  {
    heading: 'Marketplace',
    links: [
      { label: 'Browse the marketplace', href: 'https://market.yousafeconsultancy.com' },
      { label: 'Find a consultant', href: 'https://market.yousafeconsultancy.com' },
      { label: 'Find an attorney', href: 'https://market.yousafeconsultancy.com' },
      { label: 'Open the portal', href: 'https://portal.yousafeconsultancy.com/' },
      { label: 'For attorneys & consultants', href: 'https://legal.yousafeconsultancy.com/attorneys/' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About YouSafe', href: 'https://yousafeconsultancy.com/' },
      { label: 'Contact', href: 'https://usa.yousafeconsultancy.com/contact/' },
      { label: 'Support centre', href: 'https://support.yousafeconsultancy.com/' },
      { label: 'Help & FAQ', href: 'https://usa.yousafeconsultancy.com/faqs/' },
    ],
  },
]

export const ESTATE_FOOTER_LEGAL: FooterLink[] = [
  { label: 'Privacy', href: 'https://usa.yousafeconsultancy.com/privacy-policy/' },
  { label: 'Terms', href: 'https://usa.yousafeconsultancy.com/terms-of-service/' },
  { label: 'Refund policy', href: 'https://usa.yousafeconsultancy.com/refund-policy/' },
  { label: 'Disclaimer', href: 'https://legal.yousafeconsultancy.com/disclaimer/' },
]

export const ESTATE_FOOTER_SOCIAL: FooterLink[] = [
  { label: 'LinkedIn', href: 'https://linkedin.com/company/yousafe-consultancy' },
  { label: 'X / Twitter', href: 'https://x.com/yousafeconsult' },
  { label: 'Facebook', href: 'https://facebook.com/yousafeconsultancy' },
  { label: 'Instagram', href: 'https://instagram.com/yousafeconsultancy' },
]
