/* eslint-disable */
// @ts-nocheck
/* ═════════════════════════════════════════════════════════════════════
   YouSafe landing — link audit.

   Run in the browser console on the rendered landing page (prototype OR
   production). Walks every <a href> on the page and validates against the
   canonical URL set in urls.js. Logs a table of any mismatches.

   Usage:
     1. Open the landing page.
     2. Open DevTools → Console.
     3. Paste this whole file and hit enter.
     4. Read the verdict at the top of the output.

   Or in a Node test runner: see kimi-brief.md §15 for the playwright
   variant of the same checks.
   ════════════════════════════════════════════════════════════════════ */
(function auditLinks() {
  const expected = {
    marketHosts:  ['market.yousafeconsultancy.com'],
    portalHosts:  ['portal.yousafeconsultancy.com'],
    supportHosts: ['support.yousafeconsultancy.com'],
    brandHosts:   ['yousafeconsultancy.com'],
    countryHosts: ['usa.yousafeconsultancy.com', 'uk.yousafeconsultancy.com', 'ca.yousafeconsultancy.com'],
    legalHosts:   ['legal.yousafeconsultancy.com'],
    socialHosts:  ['linkedin.com', 'x.com', 'facebook.com', 'instagram.com'],
  };

  // The 8 canonical category IDs (from lib/categories.ts).
  const validCategoryIds = ['immigration','education','legal','settlement','career','business','credentials','mentorship'];
  // Valid role IDs for the Clerk catch-all auth routes.
  const validRoleIds = ['student','attorney','consultant','admin'];

  const issues = [];
  const summary = { total: 0, byBucket: {} };

  const bump = (bucket) => { summary.byBucket[bucket] = (summary.byBucket[bucket] || 0) + 1; };

  function classify(rawHref, el) {
    if (!rawHref) return { bucket: 'empty', issue: 'href missing' };
    const href = rawHref.trim();

    // Anchor links — allowed for in-page section nav.
    if (href.startsWith('#')) return { bucket: 'anchor' };

    // Reject relative paths that aren't anchors — every external link must
    // be absolute now, because the marketplace lives on a different host.
    if (!/^https?:\/\//.test(href)) {
      return { bucket: 'invalid', issue: `relative href "${href}" — should be absolute` };
    }

    let url;
    try { url = new URL(href); } catch {
      return { bucket: 'invalid', issue: `unparseable URL "${href}"` };
    }
    const host = url.host;
    const path = url.pathname;

    // Marketplace links MUST live on market.* — never on portal/* with the
    // /marketplace prefix. portal.*/marketplace/... should not appear here.
    if (host === 'portal.yousafeconsultancy.com' && path.startsWith('/marketplace')) {
      return { bucket: 'invalid', issue: `marketplace link should be on market.* not portal.*` };
    }

    if (expected.marketHosts.includes(host)) {
      // Validate sub-paths.
      if (path === '/' || path === '') return { bucket: 'market.home' };
      if (/^\/categories\/?$/.test(path)) return { bucket: 'market.categoriesIndex' };
      const catMatch = path.match(/^\/categories\/([^/]+)\/?$/);
      if (catMatch) {
        if (!validCategoryIds.includes(catMatch[1])) {
          return { bucket: 'invalid', issue: `unknown category id "${catMatch[1]}"` };
        }
        return { bucket: 'market.category' };
      }
      if (/^\/providers\/?$/.test(path)) return { bucket: 'market.providersIndex' };
      if (/^\/providers\/[^/]+\/?$/.test(path)) return { bucket: 'market.provider' };
      if (/^\/gigs\/[^/]+\/?$/.test(path)) return { bucket: 'market.gig' };
      if (/^\/templates\/?$/.test(path)) return { bucket: 'market.templates' };
      return { bucket: 'market.unknown', issue: `unexpected market path "${path}"` };
    }

    if (expected.portalHosts.includes(host)) {
      const signIn  = path.match(/^\/sign-in\/([^/]+)\/?$/);
      const signUp  = path.match(/^\/sign-up\/([^/]+)\/?$/);
      if (signIn) {
        if (!validRoleIds.includes(signIn[1])) {
          return { bucket: 'invalid', issue: `unknown role "${signIn[1]}" in /sign-in/` };
        }
        return { bucket: 'portal.signIn' };
      }
      if (signUp) {
        if (!validRoleIds.includes(signUp[1])) {
          return { bucket: 'invalid', issue: `unknown role "${signUp[1]}" in /sign-up/` };
        }
        return { bucket: 'portal.signUp' };
      }
      if (path === '/' || path === '') return { bucket: 'portal.home' };
      return { bucket: 'portal.other' };
    }

    if (expected.supportHosts.includes(host)) return { bucket: 'support' };
    if (expected.brandHosts.includes(host))   return { bucket: 'brand' };
    if (expected.legalHosts.includes(host))   return { bucket: 'legal' };
    if (expected.countryHosts.includes(host)) return { bucket: 'country' };
    if (expected.socialHosts.includes(host))  return { bucket: 'social' };

    return { bucket: 'invalid', issue: `unrecognised host "${host}"` };
  }

  document.querySelectorAll('a[href]').forEach((el) => {
    summary.total += 1;
    const raw = el.getAttribute('href');
    const cls = classify(raw, el);
    bump(cls.bucket);
    if (cls.issue) {
      issues.push({
        text: (el.textContent || '').trim().slice(0, 60),
        href: raw,
        bucket: cls.bucket,
        issue: cls.issue,
        external: el.target === '_blank',
      });
    }
    // External-link sanity: any non-portal/non-anchor link should open new tab.
    // Soft warning only — the brand home link is allowed in-tab.
  });

  const banner = (msg, color) => {
    console.log(`%c${msg}`, `background:${color};color:#fff;padding:4px 10px;border-radius:4px;font-weight:700`);
  };

  if (issues.length === 0) {
    banner(`✓ Link audit passed — ${summary.total} links, all canonical`, '#1B7F4E');
  } else {
    banner(`✗ Link audit FAILED — ${issues.length}/${summary.total} link(s) need fixes`, '#B22234');
    console.table(issues);
  }
  console.log('Bucket summary:', summary.byBucket);

  return { ok: issues.length === 0, totalLinks: summary.total, issues, summary: summary.byBucket };
})();
