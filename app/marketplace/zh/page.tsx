import type { Metadata } from 'next'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

const canonicalUrl = getMarketplaceCanonicalUrl('/zh')

const title = 'YouSafe 留学生英文修改与 F-1 文件审核'
const description =
  '英语不是母语？我们帮你把想法改成地道、清晰的学术英语，不代写，只修改。服务美国、英国、加拿大和澳大利亚的学生。'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: canonicalUrl },
  robots: { index: true, follow: true },
  openGraph: {
    url: canonicalUrl,
    title,
    description,
    type: 'website',
    locale: 'zh_CN',
  },
}

const listings = [
  {
    href: '/gigs/edit-thesis-admissions-essay-us-university-applications',
    label: 'SOP / PS 文书修改：$79 起',
  },
  {
    href: '/gigs/edit-dissertation-research-paper-us-graduate-school',
    label: '硕博论文（Dissertation）编辑：$39 起',
  },
  {
    href: '/gigs/proofread-thesis-dissertation-grammar-consistency',
    label: '论文校对（Thesis proofreading）：$35 起',
  },
  {
    href: '/gigs/review-i765-opt-application-before-filing',
    label: '毕业后 OPT（I-765）材料审核：$249',
  },
  {
    href: '/gigs/provide-immigration-expert-lawyer-services',
    label: 'F-1 恢复身份（Reinstatement）材料审核：$395',
  },
] as const

export default function ZhLandingPage() {
  return (
    <section className="wrap" lang="zh-Hans" style={{ padding: '48px 0 72px' }}>
      <script
        dangerouslySetInnerHTML={{
          __html: "document.documentElement.lang='zh-Hans'",
        }}
      />
      <h1 className="serif" style={{ fontSize: 'clamp(32px, 5vw, 52px)', lineHeight: 1.2, margin: '0 0 16px' }}>
        {title}
      </h1>
      <p style={{ fontSize: 18, lineHeight: 1.6, maxWidth: 720, margin: '0 0 24px' }}>
        英语不是母语？我们帮你把想法改成地道、清晰的学术英语，不代写，只修改。
      </p>
      <ul style={{ fontSize: 17, lineHeight: 1.7, paddingLeft: 20, margin: '0 0 24px' }}>
        {listings.map((item) => (
          <li key={item.href}>
            <a href={item.href}>{item.label}</a>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: 16, lineHeight: 1.6, maxWidth: 720 }}>
        服务美国、英国、加拿大和澳大利亚的学生。可用中文提交需求，修改稿为英文。
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 720, marginTop: 16 }}>
        F-1/OPT 审核由 Kyle Walker 提供。他不是律师。审核仅涉及美国规定，不构成法律建议；情况复杂时，请咨询移民律师。
      </p>
    </section>
  )
}
