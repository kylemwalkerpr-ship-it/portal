import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { handle as githubWebhook } from "./githubWebhook";

const http = httpRouter();

auth.addHttpRoutes(http);

// POST /github-webhook — receives GitHub pull_request events and updates
// matching contentJobs to merged/closed. The endpoint requires a matching
// GITHUB_WEBHOOK_SECRET env var; otherwise it returns 401.
http.route({
  path: "/github-webhook",
  method: "POST",
  handler: githubWebhook,
});

export default http;
