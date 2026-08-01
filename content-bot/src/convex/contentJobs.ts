import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

// Status flow for a content generation job:
// pending -> drafting -> publishing -> pr_created | failed

/**
 * Public query: list all content jobs belonging to the signed-in user,
 * newest first. Returns null if the user is not signed in.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("contentJobs")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});

/**
 * Public query: get a single content job by id, only if it belongs to the
 * signed-in user.
 */
export const get = query({
  args: { id: v.id("contentJobs") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const job = await ctx.db.get(args.id);
    if (job === null || job.userId !== userId) return null;
    return job;
  },
});

/**
 * Public mutation: create a pending job and return its id. The action
 * runs in the background and updates the job through the stages.
 */
export const create = mutation({
  args: {
    title: v.string(),
    topic: v.string(),
    contentType: v.union(v.literal("blog_post"), v.literal("article")),
    tone: v.optional(v.string()),
    audience: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const repoOwner = process.env.GITHUB_REPO_OWNER ?? "";
    const repoName = process.env.GITHUB_REPO_NAME ?? "";
    const defaultBranch = process.env.GITHUB_DEFAULT_BRANCH ?? "main";
    const aiProvider = process.env.AI_PROVIDER ?? "openai";

    if (!repoOwner || !repoName) {
      throw new Error(
        "GitHub repo not configured. Set GITHUB_REPO_OWNER and GITHUB_REPO_NAME in the project's API keys.",
      );
    }

    const now = Date.now();
    return await ctx.db.insert("contentJobs", {
      userId,
      title: args.title,
      topic: args.topic,
      contentType: args.contentType,
      tone: args.tone,
      audience: args.audience,
      keywords: args.keywords,
      status: "pending",
      repoOwner,
      repoName,
      defaultBranch,
      aiProvider,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ---------- internal helpers (called by the action) ----------

export const _setDrafting = internalMutation({
  args: { id: v.id("contentJobs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "drafting",
      updatedAt: Date.now(),
    });
  },
});

export const _setPublishingWithContent = internalMutation({
  args: {
    id: v.id("contentJobs"),
    content: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "publishing",
      content: args.content,
      slug: args.slug,
      updatedAt: Date.now(),
    });
  },
});

export const _setPrCreated = internalMutation({
  args: {
    id: v.id("contentJobs"),
    branchName: v.string(),
    contentPath: v.string(),
    prUrl: v.string(),
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "pr_created",
      branchName: args.branchName,
      contentPath: args.contentPath,
      prUrl: args.prUrl,
      prNumber: args.prNumber,
      updatedAt: Date.now(),
    });
  },
});

export const _setFailed = internalMutation({
  args: {
    id: v.id("contentJobs"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "failed",
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Used by the GitHub webhook to look up the originating job for a
 * pull_request event. Returns null if no match (then webhook handler
 * returns 404 so GitHub retries the delivery).
 */
export const _findByPrNumber = internalQuery({
  args: {
    repoOwner: v.string(),
    repoName: v.string(),
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentJobs")
      .withIndex("by_pr_number", (q) =>
        q
          .eq("repoOwner", args.repoOwner)
          .eq("repoName", args.repoName)
          .eq("prNumber", args.prNumber),
      )
      .unique();
  },
});

/**
 * Mark a job as merged. Called from the GitHub webhook when a
 * pull_request with action="closed" and merged=true arrives.
 */
export const _setMerged = internalMutation({
  args: {
    id: v.id("contentJobs"),
    mergedAt: v.number(),
    prUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (job === null) return;
    // Idempotency: don't downgrade from one terminal state to another.
    if (job.status === "merged" || job.status === "closed") return;
    await ctx.db.patch(args.id, {
      status: "merged",
      mergedAt: args.mergedAt,
      // Refresh the PR url in case GitHub normalized it (slash flip, etc).
      ...(args.prUrl ? { prUrl: args.prUrl } : {}),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Mark a job as closed (without merging). Called from the GitHub webhook
 * when a pull_request with action="closed" and merged=false arrives.
 */
export const _setClosed = internalMutation({
  args: {
    id: v.id("contentJobs"),
    closedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (job === null) return;
    if (job.status === "merged" || job.status === "closed") return;
    await ctx.db.patch(args.id, {
      status: "closed",
      closedAt: args.closedAt,
      updatedAt: Date.now(),
    });
  },
});

export const _getJob = internalQuery({
  args: { id: v.id("contentJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
