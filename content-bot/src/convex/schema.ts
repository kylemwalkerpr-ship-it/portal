import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // content generation jobs: blog posts, articles, etc. that are drafted by
    // AI and pushed to GitHub as a pull request from a dashboard click.
    contentJobs: defineTable({
      userId: v.id("users"),
      // input the user provided
      title: v.string(),
      topic: v.string(),
      contentType: v.union(v.literal("blog_post"), v.literal("article")),
      tone: v.optional(v.string()),
      audience: v.optional(v.string()),
      keywords: v.optional(v.array(v.string())),
      // generated content + metadata
      content: v.optional(v.string()),
      slug: v.optional(v.string()),
      // status flow:
      //   pending -> drafting -> publishing -> pr_created
      //                                          -> merged   (PR merged on GitHub)
      //                                          -> closed   (PR closed without merge)
      //   any state -> failed  (terminal error)
      status: v.union(
        v.literal("pending"),
        v.literal("drafting"),
        v.literal("publishing"),
        v.literal("pr_created"),
        v.literal("merged"),
        v.literal("closed"),
        v.literal("failed"),
      ),
      errorMessage: v.optional(v.string()),
      // github details
      repoOwner: v.string(),
      repoName: v.string(),
      defaultBranch: v.string(),
      branchName: v.optional(v.string()),
      contentPath: v.optional(v.string()),
      prUrl: v.optional(v.string()),
      prNumber: v.optional(v.number()),
      // terminal-state timestamps (set by GitHub webhook)
      mergedAt: v.optional(v.number()),
      closedAt: v.optional(v.number()),
      // meta
      aiProvider: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_created", ["userId", "createdAt"])
      .index("by_pr_number", ["repoOwner", "repoName", "prNumber"]),

    // GSC (Google Search Console) configuration
    gscConfig: defineTable({
      siteUrl: v.string(),
      serviceAccountEmail: v.optional(v.string()),
      lastSnapshot: v.optional(v.string()), // JSON blob of latest GSC data
      snapshotAt: v.optional(v.number()),
      updatedAt: v.number(),
    }),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
