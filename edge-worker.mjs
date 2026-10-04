// Production Worker entry (wrangler.toml `main`). Wraps the generated OpenNext
// handler with the edge guard: native rate limiting for sensitive mutating
// endpoints, and redaction of internal diagnostics from /api error bodies.
// See lib/edgeGuard.ts. `.open-next/worker.js` is produced by the build.
import openNextWorker from './.open-next/worker.js'
import { ensureBaselineHeaders, rateLimitRequest, redactErrorResponse } from './lib/edgeGuard.ts'

export * from './.open-next/worker.js'

export default {
  ...openNextWorker,
  async fetch(request, env, ctx) {
    const limited = await rateLimitRequest(request, env)
    if (limited) return ensureBaselineHeaders(limited)
    const response = await openNextWorker.fetch(request, env, ctx)
    try {
      return ensureBaselineHeaders(await redactErrorResponse(request, response))
    } catch {
      return response
    }
  },
}
