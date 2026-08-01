import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Daily GSC data refresh — fetches latest Search Console analytics
 * and stores a snapshot for the dashboard.
 *
 * Runs at 3:00 AM UTC every day.
 */
crons.interval(
  "refresh gsc data",
  { hours: 24 },
  internal.gsActions.refreshGscData,
);

/**
 * Weekly content gap analysis — identifies high-impression queries
 * with low CTR (i.e. topics you rank for but need better content on)
 * and could automatically create content jobs for them.
 *
 * Runs every Monday at 4:00 AM UTC.
 */
crons.cron(
  "weekly seo gap analysis",
  "0 4 * * 1", // At 04:00 on Monday
  internal.gsActions.refreshGscData,
);

export default crons;
