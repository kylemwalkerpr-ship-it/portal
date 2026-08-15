// Live backlinks check — verifies the DataForSEO provider end-to-end for one URL.
// Reads credentials from the environment (never hardcoded). Usage:
//   DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=... npx tsx scripts/_live-backlinks-check.mts [url]
//   npx tsx --env-file=.env.local scripts/_live-backlinks-check.mts https://legal.yousafeconsultancy.com/uk/graduate-route-visa/
if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
  console.error('Missing DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD env vars')
  process.exit(1)
}

const { fetchBacklinkSnapshot, backlinkSignals } = await import('../lib/seoFactory/backlinkProvider.ts')
const url =
  process.argv[2] ||
  'https://legal.yousafeconsultancy.com/uk/immigration/uk-spouse-visa-document-checklist-2026/'

const snap = await fetchBacklinkSnapshot(url)
console.log(
  JSON.stringify(
    {
      url,
      snapshot: snap && {
        totalBacklinks: snap.totalBacklinks,
        referringDomains: snap.referringDomains,
        referringMainDomains: snap.referringMainDomains,
        referringPages: snap.referringPages,
        newBacklinks: snap.newBacklinks,
        lostBacklinks: snap.lostBacklinks,
        brokenBacklinks: snap.brokenBacklinks,
        spamScore: snap.spamScore,
        domainRank: snap.domainRank,
        sampleCount: snap.samples.length,
        sample0: snap.samples[0],
      },
      signals: snap ? backlinkSignals({ snapshot: snap, brandTerms: ['yousafe', 'you safe'] }) : null,
    },
    null,
    2,
  ),
)
