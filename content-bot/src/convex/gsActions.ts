"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSign } from "node:crypto";

// ---------- GSC Service Account JWT helpers ----------

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function parseServiceAccountKey(raw: string): ServiceAccountKey {
  const key = JSON.parse(raw) as {
    client_email?: string;
    private_key?: string;
    token_uri?: string;
  };
  if (!key.client_email || !key.private_key) {
    throw new Error(
      "Invalid GSC service account key: missing client_email or private_key",
    );
  }
  return {
    client_email: key.client_email,
    private_key: key.private_key,
    token_uri: key.token_uri ?? "https://oauth2.googleapis.com/token",
  };
}

function base64urlEncode(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createJwt(sa: ServiceAccountKey): string {
  const header = base64urlEncode(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  );

  const now = Math.floor(Date.now() / 1000);
  const claimSet = base64urlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: sa.token_uri,
      exp: now + 3600,
      iat: now,
    }),
  );

  const signingInput = `${header}.${claimSet}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign
    .sign(sa.private_key, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${signingInput}.${signature}`;
}

async function getGscAccessToken(serviceAccountKeyJson: string): Promise<string> {
  const sa = parseServiceAccountKey(serviceAccountKeyJson);
  const jwt = createJwt(sa);

  const res = await fetch(sa.token_uri!, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GSC auth failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("GSC auth response missing access_token");
  }
  return data.access_token;
}

// ---------- GSC Search Analytics query ----------

interface GscDataArgs {
  siteUrl: string;
  startDate?: string;
  endDate?: string;
  dimensions?: string[];
  rowLimit?: number;
}

interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscDataResult {
  siteUrl: string;
  dateRange: { startDate: string; endDate: string };
  totalRows: number;
  rows: GscRow[];
}

async function queryGscApi(
  accessToken: string,
  args: Required<GscDataArgs>,
): Promise<GscDataResult> {
  const encodedSite = encodeURIComponent(args.siteUrl);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: args.startDate,
      endDate: args.endDate,
      dimensions: args.dimensions,
      rowLimit: args.rowLimit,
      aggregationType: "auto",
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    let message = `GSC API error (${res.status}): ${err.slice(0, 200)}`;

    if (err.includes("403") || err.includes("forbidden")) {
      message = `Access denied. Add gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com as a user in Search Console → Settings → Users for "${args.siteUrl}".`;
    } else if (err.includes("404") || err.includes("not found")) {
      message = `Site "${args.siteUrl}" not found in Search Console. Register it first.`;
    }

    throw new Error(message);
  }

  const data = (await res.json()) as {
    rows?: Array<{
      keys: string[];
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
  };

  const rows = (data.rows ?? []).map((row) => ({
    keys: row.keys,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 10) / 10,
  }));

  return {
    siteUrl: args.siteUrl,
    dateRange: { startDate: args.startDate, endDate: args.endDate },
    totalRows: rows.length,
    rows,
  };
}

// ---------- Convex Actions & Queries ----------

/**
 * Fetch GSC search analytics data.
 * Called from the Dashboard to pull keyword/click/impression data.
 */
export const fetchGscData = action({
  args: {
    siteUrl: v.string(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    dimensions: v.optional(v.array(v.string())),
    rowLimit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<GscDataResult> => {
    const serviceAccountKey = process.env.GSC_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      throw new Error(
        "GSC not configured. Set GSC_SERVICE_ACCOUNT_KEY in API keys.",
      );
    }

    const accessToken = await getGscAccessToken(serviceAccountKey);

    return await queryGscApi(accessToken, {
      siteUrl: args.siteUrl,
      startDate: args.startDate ?? "30daysAgo",
      endDate: args.endDate ?? "today",
      dimensions: args.dimensions ?? ["query"],
      rowLimit: args.rowLimit ?? 100,
    });
  },
});

/**
 * Connect GSC: verify the service account can access a site and store config.
 */
export const connectGsc = action({
  args: {
    siteUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const serviceAccountKey = process.env.GSC_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      throw new Error(
        "GSC_SERVICE_ACCOUNT_KEY not configured in API keys.",
      );
    }

    const accessToken = await getGscAccessToken(serviceAccountKey);

    // Test query to verify access
    await queryGscApi(accessToken, {
      siteUrl: args.siteUrl,
      startDate: "7daysAgo",
      endDate: "today",
      dimensions: ["query"],
      rowLimit: 1,
    });

    // Parse email from service account key
    let serviceAccountEmail = "";
    try {
      const key = JSON.parse(serviceAccountKey) as { client_email?: string };
      serviceAccountEmail = key.client_email ?? "";
    } catch {
      // key parsing failed — continue anyway
    }

    // Store config in Convex
    const existing = await ctx.runQuery(internal.gscConfig._getConfig, {});
    if (existing) {
      await ctx.runMutation(internal.gscConfig._upsertConfig, {
        siteUrl: args.siteUrl,
        serviceAccountEmail,
      });
    } else {
      await ctx.runMutation(internal.gscConfig._upsertConfig, {
        siteUrl: args.siteUrl,
        serviceAccountEmail,
      });
    }

    return {
      connected: true,
      siteUrl: args.siteUrl,
      email: serviceAccountEmail,
    };
  },
});



/**
 * Internal action: refresh GSC data. Called by cron on a schedule.
 * Stores results for dashboard consumption.
 */
export const refreshGscData = internalAction({
  args: {},
  handler: async (ctx) => {
    const serviceAccountKey = process.env.GSC_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) return; // silently skip if not configured

    const config = await ctx.runQuery(internal.gscConfig._getConfig, {});
    if (!config || !config.siteUrl) return; // silently skip if not connected

    const accessToken = await getGscAccessToken(serviceAccountKey);

    // Fetch top queries for last 30 days
    const data = await queryGscApi(accessToken, {
      siteUrl: config.siteUrl,
      startDate: "30daysAgo",
      endDate: "today",
      dimensions: ["query"],
      rowLimit: 100,
    });

    // Store the snapshot
    await ctx.runMutation(internal.gscConfig._storeSnapshot, {
      data: JSON.stringify(data),
    });

    console.log(
      `[gsc/refresh] Fetched ${data.totalRows} query rows for ${config.siteUrl}`,
    );
  },
});
