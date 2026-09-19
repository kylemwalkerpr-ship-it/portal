import { defineCloudflareConfig } from '@opennextjs/cloudflare'
// Official OpenNext Cloudflare adapter read-only incremental cache for
// prerendered/SSG routes. Its `populateCache` is a purely local
// `fs.cpSync(.open-next/cache -> .open-next/assets/cdn-cgi/_next_cache)`, so
// the prerender output ships inside the Worker's static assets instead of a
// KV/R2/D1/queue binding. `scripts/populate-static-incremental-cache.mjs`
// performs that same local copy because this repo deploys through raw
// `wrangler deploy` (see scripts/deploy-production.mjs) rather than
// `opennextjs-cloudflare deploy`.
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache'

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  // Serve prerendered pages straight from the static-assets cache without
  // re-invoking the Next.js server (no tag cache / queue involved).
  enableCacheInterception: true,
})
