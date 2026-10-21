import type { Metadata } from 'next'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'
import { EmailOptIn } from '@/components/marketplace/EmailOptIn'
import { MostRequestedRail } from '@/components/marketplace/MarketHomeOffers'
import type { MostRequestedCard } from '@/lib/marketHomeMostRequested'
import { loadLandingData } from '../PublicMarketplaceLanding'
import '../marketplace-landing.css'

const canonicalUrl = getMarketplaceCanonicalUrl('/zh')
const englishUrl = getMarketplaceCanonicalUrl('/')

const title = 'YouSafe 留学生英文修改与文件审核服务'
const description =
  '英语不是母语？我们帮你把想法改成地道、清晰的学术英语，不代写，只修改。服务美国、英国、加拿大和澳大利亚的学生。'

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: canonicalUrl,
    languages: {
      en: englishUrl,
      'zh-Hans': canonicalUrl,
      'x-default': englishUrl,
    },
  },
  robots: { index: true, follow: true },
  openGraph: {
    url: canonicalUrl,
    title,
    description,
    type: 'website',
    locale: 'zh_CN',
  },
}

const cardCopy: MostRequestedCard[] = [
  {
    key: 'sop',
    kind: 'gig',
    href: '/gigs/edit-thesis-admissions-essay-us-university-applications',
    kicker: '文书',
    title: 'SOP / PS 文书修改',
    outcome: '不代写，只修改',
    priceLabel: '$79 起',
    deliveryLabel: '',
    rushLabel: null,
    imageUrl: null,
  },
  {
    key: 'dissertation',
    kind: 'gig',
    href: '/gigs/edit-dissertation-research-paper-us-graduate-school',
    kicker: '论文',
    title: '硕博论文（Dissertation）编辑',
    outcome: '不代写，只修改',
    priceLabel: '$39 起',
    deliveryLabel: '',
    rushLabel: null,
    imageUrl: null,
  },
  {
    key: 'proof',
    kind: 'gig',
    href: '/gigs/proofread-thesis-dissertation-grammar-consistency',
    kicker: '校对',
    title: '论文校对（Thesis proofreading）',
    outcome: '不代写，只修改',
    priceLabel: '$35 起',
    deliveryLabel: '',
    rushLabel: null,
    imageUrl: null,
  },
  {
    key: 'opt',
    kind: 'gig',
    href: '/gigs/review-i765-opt-application-before-filing',
    kicker: 'OPT',
    title: '毕业后 OPT（I-765）材料审核',
    outcome: '仅涉及美国法律',
    priceLabel: '$249',
    deliveryLabel: '',
    rushLabel: null,
    imageUrl: null,
  },
  {
    key: 'reinstate',
    kind: 'gig',
    href: '/gigs/provide-immigration-expert-lawyer-services',
    kicker: 'F-1',
    title: 'F-1 恢复身份（Reinstatement）材料审核',
    outcome: '仅涉及美国法律',
    priceLabel: '$395',
    deliveryLabel: '',
    rushLabel: null,
    imageUrl: null,
  },
]

export default async function ZhLandingPage() {
  const { coverBySlug } = await loadLandingData()
  const cards = cardCopy.map((card) => {
    const slug = card.href.replace(/^\/gigs\//, '')
    return { ...card, imageUrl: coverBySlug[slug] ?? null }
  })
  return (
    <section lang="zh-Hans">
      <script
        dangerouslySetInnerHTML={{
          __html: "document.documentElement.lang='zh-Hans'",
        }}
      />
      <div className="wrap">
        <h1 className="serif">{title}</h1>
        <p>英语不是母语？我们帮你把想法改成地道、清晰的学术英语，不代写，只修改。</p>
        <p>服务美国、英国、加拿大和澳大利亚的学生。可用中文提交需求，修改稿为英文。</p>
        <p>F-1/OPT 材料审核由美国执业律师 Kyle Walker 提供，仅涉及美国法律。</p>
      </div>
      <MostRequestedRail cards={cards} heading="服务" headingId="zh-services-heading" />
      <div className="wrap">
        <EmailOptIn locale="zh" source="https://market.yousafeconsultancy.com/zh" />
      </div>
    </section>
  )
}
