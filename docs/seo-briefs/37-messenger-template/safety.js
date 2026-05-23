/* ─────────────────────────────────────────────────────────────────────────
   Safety filter — guards against off-platform contact exfiltration.

   Detects in user-typed text:
     ▸ Phone numbers (US/INT, with separators or spaces)
     ▸ Email addresses
     ▸ External URLs (anything that isn't an explicit allow-listed host)
     ▸ Social/messenger handles (@user, t.me/, wa.me/, instagram.com/u/…)
     ▸ Payment-app names + tags ($cashtag, venmo.com/u, paypal.me/…)
     ▸ Obfuscation attempts (e.g. "a t" instead of "at", "d o t" instead of ".",
       "[at]", "(at)", "<at>", letters spaced out: "g m a i l . c o m",
       digits with separators like "5 5 5 - 1 2 3 - 4 5 6 7")

   Two functions:
     ▸ scanMessage(text)  → { violations: Violation[], cleanText: string,
                              redactedText: string }
       — used by the composer BEFORE send (hard block + show what was caught)
       — used by the bubble AT RENDER TIME for defense-in-depth (redacts
         anything that slipped through a legacy send-site)

     ▸ scanAttachmentName(name) → { violations, cleanName, redactedName }
       — block uploading files whose name contains contact info, e.g.
         "phone-numbers-555-1234.txt"

   IMPORTANT: this filter runs CLIENT-SIDE in the prototype. In production
   the same logic MUST run server-side (see HANDOFF.md §8). Client checks
   are UX; server checks are policy.
   ───────────────────────────────────────────────────────────────────── */

/* Hosts we DO allow links to. Everything else triggers a violation. */
const ALLOWED_HOSTS = [
  'mycaseworks.com',
  'yousafe.com',
  'yousafe.app',
  'localhost',
];

const REDACTION_LABEL = '[contact info hidden — keep all communication on Yousafe]';

/* Convert obfuscation tricks to canonical form BEFORE running detectors.
   This catches "j o h n  d o e  a t  g m a i l  d o t  c o m". */
function unobfuscate(t) {
  let s = t;
  /* Collapse single-character-then-space runs: "g m a i l" → "gmail" */
  s = s.replace(/\b(?:[A-Za-z0-9]\s){2,}[A-Za-z0-9]\b/g, m => m.replace(/\s+/g, ''));
  /* Spaced digits: "5 5 5   1 2 3   4 5 6 7" → "5551234567"  */
  s = s.replace(/(?:\d[\s\-_.]){4,}\d/g, m => m.replace(/[\s\-_.]+/g, ''));
  /* Common "at"/"dot" stand-ins */
  s = s
    .replace(/\s*\(\s*at\s*\)\s*/gi,  '@')
    .replace(/\s*\[\s*at\s*\]\s*/gi,  '@')
    .replace(/\s*\{\s*at\s*\}\s*/gi,  '@')
    .replace(/\s+at\s+/gi,            '@')
    .replace(/\s*\(\s*dot\s*\)\s*/gi, '.')
    .replace(/\s*\[\s*dot\s*\]\s*/gi, '.')
    .replace(/\s*\{\s*dot\s*\}\s*/gi, '.')
    .replace(/\s+dot\s+/gi,           '.');
  return s;
}

/* Regex bank — each detector returns { type, label, raw, spanCanonical }
   where spanCanonical is the index range INSIDE the unobfuscated string.
   We later map back to highlight in the original. */

const PATTERNS = [
  { type: 'email',     label: 'email address',
    re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },

  { type: 'phone',     label: 'phone number',
    re: /(?:\+?\d{1,3}[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g },

  { type: 'phone_intl', label: 'phone number',
    /* 7–15 consecutive digits, allows leading + */
    re: /(?<!\d)\+?\d{7,15}(?!\d)/g },

  { type: 'url',        label: 'external link',
    re: /\b((?:https?:\/\/|www\.)[A-Z0-9.-]+\.[A-Z]{2,}[^\s]*)/gi },

  { type: 'bare_domain', label: 'external link',
    /* e.g. "gmail.com", "venmo.com/u/foo" — but only if it has a known TLD-ish suffix */
    re: /\b[A-Z0-9-]+\.(?:com|net|org|io|app|me|co|info|biz|us|uk|ca|in|de|tg|gg|ly|sh|xyz|email|chat|page)(?:\/\S*)?/gi },

  { type: 'handle',     label: 'off-platform handle',
    /* "@username" not followed by valid platform-internal use */
    re: /(?<!\S)@[A-Z0-9_.]{3,30}\b/gi },

  { type: 'tg_handle',  label: 'Telegram link',
    re: /\b(?:t\.me|telegram\.me|telegram\.dog)\/\S+/gi },

  { type: 'wa_handle',  label: 'WhatsApp link',
    re: /\b(?:wa\.me|chat\.whatsapp\.com|api\.whatsapp\.com)\/\S+/gi },

  { type: 'cashtag',    label: 'payment-app tag',
    re: /(?<!\S)\$[A-Z][A-Z0-9_]{2,29}\b/gi },

  { type: 'pay_app',    label: 'off-platform payment',
    re: /\b(?:venmo|paypal|paypal\.me|cash\s?app|cash\.app|zelle|wise|revolut|western\s?union|moneygram|payoneer|bitcoin|btc|ethereum|eth|usdc|usdt|wire\s?transfer)\b/gi },
];

/* Words that, taken alone, look like noise but in a sentence imply a request
   to take things off-platform. We don't auto-block on these, but they raise
   a soft warning. */
const SOFT_PATTERNS = [
  { type: 'offplatform_intent', label: 'requests off-platform contact',
    re: /\b(?:text\s+me|call\s+me|email\s+me|whatsapp\s+me|dm\s+me|message\s+me\s+on|let'?s\s+take\s+this\s+(?:off|outside)|outside\s+the\s+platform|reach\s+me\s+at|my\s+number\s+is|my\s+email\s+is|here'?s\s+my)\b/gi },
];

function isAllowedUrl(s) {
  try {
    let url = s;
    if (/^www\./i.test(url)) url = 'http://' + url;
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return ALLOWED_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch { return false; }
}

/* Run all detectors on a single string. Returns a deduped list of unique
   match spans. */
function detect(text) {
  const violations = [];
  const seen = new Set();
  const add = (m, type, label, hard) => {
    const key = type + ':' + m.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ type, label, raw: m, hard });
  };

  for (const p of PATTERNS) {
    let m;
    p.re.lastIndex = 0;
    while ((m = p.re.exec(text)) !== null) {
      const raw = m[0];
      /* URLs / bare domains: skip the allow-list */
      if (p.type === 'url' || p.type === 'bare_domain') {
        if (isAllowedUrl(raw)) continue;
      }
      /* Handle filter: skip @everyone / @here-like (in case of group features) */
      if (p.type === 'handle' && /^@(everyone|here|all|team|admins?|me)$/i.test(raw)) continue;
      add(raw, p.type, p.label, true);
    }
  }
  for (const p of SOFT_PATTERNS) {
    let m;
    p.re.lastIndex = 0;
    while ((m = p.re.exec(text)) !== null) {
      add(m[0], p.type, p.label, false);
    }
  }
  return violations;
}

/* Replace all detected spans in the ORIGINAL text with a redaction marker.
   We rerun the same detectors against the canonical (unobfuscated) text,
   then also against the original so spaced obfuscations get scrubbed. */
function redact(text) {
  let out = text;
  /* First pass — original text */
  for (const p of PATTERNS) {
    out = out.replace(p.re, raw => {
      if ((p.type === 'url' || p.type === 'bare_domain') && isAllowedUrl(raw)) return raw;
      if (p.type === 'handle' && /^@(everyone|here|all|team|admins?|me)$/i.test(raw)) return raw;
      return '⛔';
    });
  }
  /* Second pass — collapse spaced obfuscations */
  const collapsed = unobfuscate(out);
  for (const p of PATTERNS) {
    let mm; p.re.lastIndex = 0;
    while ((mm = p.re.exec(collapsed)) !== null) {
      /* If the canonical form still has a hit, replace any matching loose
         pattern in `out`. Cheap heuristic: replace the digits/letters as
         a regex of the obfuscated form. */
      const escapedLoose = mm[0].split('').map(ch => ch.match(/[A-Z0-9]/i) ? `[\\s\\-_.]*${ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
      try {
        out = out.replace(new RegExp(escapedLoose, 'i'), '⛔');
      } catch { /* bad regex from very weird input — skip */ }
    }
  }
  return out;
}

/* PUBLIC API */
window.Safety = {
  /* Check a message before sending. Returns { ok, violations, hardViolations, softViolations } */
  scanMessage(text) {
    if (!text || typeof text !== 'string') return { ok: true, violations: [], hardViolations: [], softViolations: [] };
    const canonical = unobfuscate(text);
    /* Run detectors against both forms so spaced obfuscations are caught. */
    const a = detect(text);
    const b = detect(canonical);
    const merged = [];
    const seen = new Set();
    [...a, ...b].forEach(v => {
      const k = v.type + ':' + v.raw.toLowerCase().trim();
      if (seen.has(k)) return;
      seen.add(k);
      merged.push(v);
    });
    const hardViolations = merged.filter(v => v.hard);
    const softViolations = merged.filter(v => !v.hard);
    return { ok: hardViolations.length === 0, violations: merged, hardViolations, softViolations };
  },

  /* Redact text for display. Used by bubble at render time so legacy
     messages don't leak contact info even if they bypassed the composer. */
  redactForDisplay(text) {
    if (!text) return text;
    const { hardViolations } = this.scanMessage(text);
    if (hardViolations.length === 0) return text;
    return { redacted: true, body: redact(text), labels: [...new Set(hardViolations.map(v => v.label))] };
  },

  scanAttachmentName(name) {
    if (!name) return { ok: true, violations: [] };
    const { hardViolations } = this.scanMessage(name.replace(/[._-]+/g, ' '));
    return { ok: hardViolations.length === 0, violations: hardViolations };
  },

  /* The marketing banner shown in chat. */
  policyLink: '/safety',
};
