/**
 * portal-patch/lib/seoFactory/eeat.ts — P2-1 E-E-A-T frontmatter → JSON-LD (portal/Next)
 * Same contract as src/convex/eeat.ts — buildEeatJsonLd() + preview helper.
 */
export function buildEeatJsonLd(input:{ title:string; canonicalUrl:string; datePublished:string; dateModified?:string; authorName?:string; authorUrl?:string; reviewedBy?:string; publisherName?:string; publisherLogo?:string; aboutKeywords?:string[]; wordCount?:number }): string {
  const graph: unknown[]=[{ '@type':'Article', headline:input.title, url:input.canonicalUrl, datePublished:input.datePublished, dateModified: input.dateModified ?? input.datePublished, wordCount: input.wordCount, keywords: input.aboutKeywords?.join(', '), author:{ '@type':'Person', name: input.authorName ?? 'YouSafe Editorial Team', url: input.authorUrl }, reviewedBy: input.reviewedBy ? { '@type':'Person', name: input.reviewedBy }: undefined, publisher:{ '@type':'Organization', name: input.publisherName ?? 'YouSafe Consultancy', logo: input.publisherLogo ? { '@type':'ImageObject', url: input.publisherLogo }: undefined }, mainEntityOfPage: input.canonicalUrl }]
  return JSON.stringify({ '@context':'https://schema.org', '@graph': graph }, null, 2)
}
export function previewEeat(opts:{ title:string; slug:string; authorName?:string; reviewedBy?:string; keywords?:string[] }): string {
  const canonical=`https://portal.yousafeconsultancy.com/${opts.slug}`; const today=new Date().toISOString().slice(0,10)
  return buildEeatJsonLd({ title: opts.title, canonicalUrl: canonical, datePublished: today, authorName: opts.authorName, reviewedBy: opts.reviewedBy, aboutKeywords: opts.keywords })
}
