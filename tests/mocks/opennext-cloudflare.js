/** Jest stub for @opennextjs/cloudflare (ESM package). */
function getCloudflareContext() {
  return { env: {}, ctx: { waitUntil(p) { return p } } }
}
module.exports = { getCloudflareContext }
