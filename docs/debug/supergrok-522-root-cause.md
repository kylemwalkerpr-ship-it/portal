# SuperGrok 522 root cause

The Portal runs as a Cloudflare Worker on `portal.yousafeconsultancy.com`. SuperGrok OAuth inference was routed through `https://portal.yousafeconsultancy.com/api/internal/xai-grok`, which causes the Worker to fetch its own custom-domain hostname before forwarding to xAI. Cloudflare can return 522 for this same-Worker custom-domain self-fetch pattern.

The repair must remove that self-fetch from the server-side inference path, keep the HTTP route only as an external compatibility surface, classify 522 as a transient transport failure, and distinguish stored OAuth connection state from live inference health in the configurator.
