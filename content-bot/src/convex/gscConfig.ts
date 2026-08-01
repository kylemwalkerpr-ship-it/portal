import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

/**
 * Internal: get the current GSC configuration (single row).
 */
export const _getConfig = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("gscConfig").first();
  },
});

/**
 * Public: get GSC connection status for the dashboard.
 */
export const getGscStatus = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("gscConfig").first();
    if (!config || !config.siteUrl) {
      return { connected: false };
    }
    return {
      connected: true,
      siteUrl: config.siteUrl,
      email: config.serviceAccountEmail,
      updatedAt: config.updatedAt,
    };
  },
});

/**
 * Internal: upsert GSC configuration.
 */
export const _upsertConfig = internalMutation({
  args: {
    siteUrl: v.string(),
    serviceAccountEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("gscConfig").first();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        siteUrl: args.siteUrl,
        serviceAccountEmail: args.serviceAccountEmail,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("gscConfig", {
        siteUrl: args.siteUrl,
        serviceAccountEmail: args.serviceAccountEmail,
        updatedAt: now,
      });
    }
  },
});

/**
 * Internal: store the latest GSC data snapshot for dashboard consumption.
 */
export const _storeSnapshot = internalMutation({
  args: {
    data: v.string(), // JSON-serialized GscDataResult
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("gscConfig").first();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSnapshot: args.data,
        snapshotAt: now,
        updatedAt: now,
      });
    }
    // If no config exists yet, silently skip — user needs to connect first.
  },
});
