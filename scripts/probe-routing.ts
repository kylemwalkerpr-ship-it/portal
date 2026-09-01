import { resolveOwner } from '../lib/seoFactory/ownership'

async function main() {
  const cases = [
    { name: '982dc0c1 Australia (corrected)', kw: 'australia student visa restrictions', region: 'AU', slug: 'australia-student-visa-restrictions', ct: 'article' },
    { name: '1305ef5e K State (corrected)', kw: 'k state off campus housing', region: 'US', slug: 'k-state-off-campus-housing', ct: 'article' },
    { name: 'dafd16df Resume Grad (corrected)', kw: 'resume for grad school application', region: 'US', slug: 'resume-for-grad-school-application', ct: 'article' },
  ]
  for (const c of cases) {
    const plan = await resolveOwner({ primaryKeyword: c.kw, contentType: c.ct, region: c.region, slug: c.slug })
    console.log(`\n=== ${c.name} ===`)
    console.log('  host:', plan.host, '| repo:', plan.repo, '| action:', plan.action, '| routingSource:', plan.routingSource, '| score:', plan.matchScore)
    console.log('  filePath:', plan.filePath)
    console.log('  canonicalUrl:', plan.canonicalUrl)
    console.log('  warnings:', plan.warnings.slice(0, 2))
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
