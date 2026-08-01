const encoder = new TextEncoder();

async function computeSignature(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Verify a GitHub webhook (or any HMAC-SHA256) signature on a raw request
 * body.
 *
 * @param rawBody        The exact raw body bytes GitHub sent, as a string.
 * @param signatureHeader The value of `X-Hub-Signature-256`, e.g.
 *                        `"sha256=abc123..."`. May be null.
 * @param secret         The shared webhook secret configured in the
 *                        repository's webhook settings (matches
 *                        `GITHUB_WEBHOOK_SECRET` env var on our side).
 * @returns `true` only if the signature is well-formed AND matches a fresh
 *          HMAC-SHA256 of the body. Constant-time comparison avoids timing
 *          side channels.
 *
 * This is a pure function with no Convex / framework imports so it can be
 * unit-tested without a Convex runtime.
 */
export async function verifyGithubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const provided = signatureHeader.slice("sha256=".length).toLowerCase();
  const computed = await computeSignature(rawBody, secret);
  return constantTimeEqual(provided, computed);
}

/**
 * Compute the GitHub-formatted signature header value for a given body and
 * secret. Exported primarily so tests can sign fixture payloads.
 */
export async function signGithubPayload(
  rawBody: string,
  secret: string,
): Promise<string> {
  return `sha256=${await computeSignature(rawBody, secret)}`;
}
