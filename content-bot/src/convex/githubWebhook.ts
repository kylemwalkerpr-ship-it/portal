import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyGithubSignature } from "../lib/githubSignature";

// Why /github-webhook:
// - GitHub sends pull_request events throughout a PR's lifecycle.
// - We only act on action === "closed" with pulled.merged indicating whether
//   it was merged or just closed.
// - All other actions (opened, edited, synchronize, ready_for_review, ...) are
//   ack'd with 200 OK to keep GitHub from retrying.
//
// HMAC verification uses the Web Crypto API so this HTTP action remains
// compatible with Convex's standard runtime.

type VerifiedEvent = "ping" | "pull_request" | "ignored";

type HandlerResponse = {
  status: 200 | 400 | 401 | 404 | 500;
  body: unknown;
};

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const handle = httpAction(async (ctx, request) => {
  const respond = ({ status, body }: HandlerResponse) =>
    jsonResponse(body, status);

  // 1. Read raw body once (Convex gives us a standard Web Request).
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return respond({ status: 400, body: { ok: false, reason: "no body" } });
  }

  // 2. Inspect headers.
  const event = request.headers.get("x-github-event") ?? "";
  const delivery = request.headers.get("x-github-delivery") ?? "";
  const signature = request.headers.get("x-hub-signature-256");

  // 3. Handle the security/ping case first (the ping event is unsigned —
  //    GitHub uses it purely to confirm the endpoint is reachable).
  let payload: Record<string, unknown> | null = null;
  if (event === "ping") {
    let pingBody: { zen?: string } = {};
    try {
      pingBody = JSON.parse(rawBody);
    } catch {
      /* ignore malformed ping */
    }
    return respond({
      status: 200,
      body: { ok: true, event: "ping", zen: pingBody.zen ?? null },
    });
  }

  if (event !== "pull_request") {
    return respond({
      status: 200,
      body: { ok: true, event, ignored: true as const },
    });
  }

  // 4. Verify signature.
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return respond({
      status: 500,
      body: { ok: false, reason: "GITHUB_WEBHOOK_SECRET not configured" },
    });
  }
  if (!(await verifyGithubSignature(rawBody, signature, secret))) {
    return respond({
      status: 401,
      body: { ok: false, reason: "invalid signature", delivery },
    });
  }

  // 5. Parse JSON.
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return respond({ status: 400, body: { ok: false, reason: "invalid json" } });
  }

  // 6. Only act on closed PRs.
  const action = String(payload.action ?? "");
  if (action !== "closed") {
    return respond({
      status: 200,
      body: { ok: true, event, action, ignored: true as const },
    });
  }

  const repo = payload.repository as
    | { full_name?: string }
    | undefined;
  const pr = payload.pull_request as
    | { number?: number; html_url?: string; merged?: boolean }
    | undefined;
  const fullName = repo?.full_name ?? "";
  const [repoOwner, repoName] = fullName.split("/");
  const prNumber = Number(pr?.number);

  // type-verified event access at end of pipe
  const _eVerified: VerifiedEvent = "ignored";
  void _eVerified;

  if (!repoOwner || !repoName || !Number.isFinite(prNumber)) {
    return respond({
      status: 400,
      body: { ok: false, reason: "missing repo/pr fields" },
    });
  }

  // 7. Look up the matching job.
  const job = await ctx.runQuery(internal.contentJobs._findByPrNumber, {
    repoOwner,
    repoName,
    prNumber,
  });

  // 7a. Race handling: webhook may arrive before _setPrCreated finished
  //     writing to the DB (humans can squash-merge a PR the instant after
  //     it's opened). Returning 404 makes GitHub retry the delivery on its
  //     backoff (up to ~24h), by which point the row will exist.
  if (job === null) {
    return respond({
      status: 404,
      body: {
        ok: false,
        reason: "no matching content job",
        repo: fullName,
        prNumber,
      },
    });
  }

  // 7b. Idempotency: any terminal state is final.
  if (job.status === "merged" || job.status === "closed" || job.status === "failed") {
    return respond({
      status: 200,
      body: { ok: true, jobId: job._id, currentStatus: job.status },
    });
  }

  // 8. Transition to merged or closed.
  const now = Date.now();
  if (pr?.merged === true) {
    await ctx.runMutation(internal.contentJobs._setMerged, {
      id: job._id,
      mergedAt: now,
      prUrl: pr?.html_url ?? job.prUrl,
    });
    return respond({
      status: 200,
      body: { ok: true, jobId: job._id, newStatus: "merged", delivery },
    });
  }

  await ctx.runMutation(internal.contentJobs._setClosed, {
    id: job._id,
    closedAt: now,
  });
  return respond({
    status: 200,
    body: { ok: true, jobId: job._id, newStatus: "closed", delivery },
  });
});

export default handle;
