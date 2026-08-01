import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { LogoDropdown } from "@/components/LogoDropdown";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Copy,
  FileText,
  Github,
  Loader2,
  Newspaper,
  Plus,
  Sparkles,
  Webhook,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import type { Doc } from "@/convex/_generated/dataModel";
import { useNavigate } from "react-router";

type ContentJob = Doc<"contentJobs">;
type ContentType = "blog_post" | "article";
type Tone =
  | "professional"
  | "casual"
  | "educational"
  | "persuasive"
  | "authoritative";

const TONE_OPTIONS: { value: Tone; label: string; helper: string }[] = [
  {
    value: "professional",
    label: "Professional",
    helper: "Polished, business-friendly voice.",
  },
  {
    value: "casual",
    label: "Casual",
    helper: "Friendly, conversational, approachable.",
  },
  {
    value: "educational",
    label: "Educational",
    helper: "Explainer, walks readers through a topic.",
  },
  {
    value: "persuasive",
    label: "Persuasive",
    helper: "Opinionated, drives a point of view.",
  },
  {
    value: "authoritative",
    label: "Authoritative",
    helper: "Deep expertise, confident and direct.",
  },
];

function jobStatusBadge(job: ContentJob) {
  const map: Record<
    ContentJob["status"],
    { label: string; className: string; icon: React.ReactNode }
  > = {
    pending: {
      label: "Queued",
      className:
        "bg-muted text-muted-foreground border-border/60 animate-pulse",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    drafting: {
      label: "Drafting",
      className:
        "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
      icon: <Sparkles className="h-3 w-3" />,
    },
    publishing: {
      label: "Opening PR",
      className:
        "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
      icon: <Github className="h-3 w-3" />,
    },
    pr_created: {
      label: "PR Ready",
      className:
        "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    merged: {
      label: "Merged",
      className:
        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    closed: {
      label: "Closed",
      className:
        "bg-muted text-muted-foreground border-border/60",
      icon: <XCircle className="h-3 w-3" />,
    },
    failed: {
      label: "Failed",
      className:
        "bg-destructive/10 text-destructive border-destructive/30",
      icon: <CircleAlert className="h-3 w-3" />,
    },
  };
  const entry = map[job.status];
  return (
    <Badge variant="outline" className={entry.className}>
      {entry.icon}
      <span className="ml-1.5">{entry.label}</span>
    </Badge>
  );
}

function contentTypeBadge(type: ContentType) {
  if (type === "article") {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <FileText className="h-3 w-3" />
        Article (MDX)
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1.5">
      <Newspaper className="h-3 w-3" />
      Blog Post (MD)
    </Badge>
  );
}

function JobCard({ job }: { job: ContentJob }) {
  const [expanded, setExpanded] = useState(false);
  const preview = useMemo(() => {
    if (!job.content) return "";
    const stripped = job.content.replace(/^---[\s\S]*?---\s*/m, "");
    return stripped.length > 320 ? `${stripped.slice(0, 320)}…` : stripped;
  }, [job.content]);

  return (
    <Card className="overflow-hidden hover:border-border/80 transition-colors">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="block w-full text-left"
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-semibold leading-tight truncate">
                {job.title || job.topic}
              </CardTitle>
              <CardDescription className="mt-1 truncate">
                {job.topic}
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {jobStatusBadge(job)}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {contentTypeBadge(job.contentType)}
            <span className="text-xs text-muted-foreground">
              {format(new Date(job.createdAt), "MMM d, yyyy · HH:mm")}
            </span>
            {job.aiProvider && (
              <span className="text-xs text-muted-foreground/70">
                · {job.aiProvider}
              </span>
            )}
          </div>
        </CardHeader>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <CardContent className="pt-0 space-y-3">
              {job.prUrl && (
                <a
                  href={job.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Github className="h-4 w-4" />
                  Open pull request
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}

              {(job.branchName || job.contentPath) && (
                <div className="grid gap-1.5 text-xs">
                  {job.branchName && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="font-mono">branch:</span>
                      <code className="font-mono text-foreground/80 bg-muted px-1.5 py-0.5 rounded">
                        {job.branchName}
                      </code>
                    </div>
                  )}
                  {job.contentPath && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="font-mono">file:</span>
                      <code className="font-mono text-foreground/80 bg-muted px-1.5 py-0.5 rounded">
                        {job.contentPath}
                      </code>
                    </div>
                  )}
                </div>
              )}

              {job.errorMessage && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  {job.errorMessage}
                </div>
              )}

              {job.content && (
                <pre className="max-h-72 w-full overflow-auto rounded-md border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap font-mono">
                  {expanded ? job.content : preview}
                </pre>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function JobsEmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center text-center py-12 gap-3">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Newspaper className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">No content generated yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Fill out the form on the left and hit <em>Generate</em>. Your
            first pull request is one click away.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Derive the public webhook URL from the runtime Convex URL. HTTP actions
// live at <deployment>.convex.site; the runtime URL is .convex.cloud.
function deriveWebhookUrl(): string {
  const convexUrl =
    (import.meta.env.VITE_CONVEX_URL as string | undefined) ?? "";
  if (!convexUrl) return "";
  const httpActionsUrl = convexUrl
    .replace(/^http:\/\//, "https://")
    .replace(/\.convex\.cloud(?=\/|$)/, ".convex.site")
    .replace(/\/$/, "");
  return `${httpActionsUrl}/github-webhook`;
}

function WebhookSetupCard() {
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => deriveWebhookUrl(), []);

  const onCopy = async () => {
    if (!url) {
      toast.error("Webhook URL not available — VITE_CONVEX_URL is missing.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Webhook URL copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this URL:", url);
    }
  };

  if (!url) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Webhook className="h-4 w-4" />
          GitHub webhook setup
        </CardTitle>
        <CardDescription>
          Once configured, jobs auto-update to{" "}
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            Merged
          </span>{" "}
          or{" "}
          <span className="font-medium text-muted-foreground">Closed</span>{" "}
          when you act on the pull request.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-stretch gap-2">
          <code className="flex-1 min-w-0 truncate rounded-md border border-border/60 bg-muted/60 px-3 py-2 font-mono text-xs flex items-center">
            {url}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCopy}
            className="shrink-0"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-1.5 text-emerald-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1.5" />
                Copy
              </>
            )}
          </Button>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>
            · In GitHub, add it to{" "}
            <strong>Repository settings → Webhooks → Add webhook</strong>.
          </li>
          <li>
            · Content type:{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-foreground/80">
              application/json
            </code>
            . Events: <strong>Pull requests</strong> only.
          </li>
          <li>
            · Set the secret to{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-foreground/80">
              GITHUB_WEBHOOK_SECRET
            </code>{" "}
            from your project's API keys.
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const jobs = useQuery(
    api.contentJobs.listMine,
    isAuthenticated ? {} : "skip",
  );
  const createJob = useMutation(api.contentJobs.create);
  const generateAndPublish = useAction(
    api.generateAndPublish.generateAndPublish,
  );

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [contentType, setContentType] = useState<ContentType>("blog_post");
  const [tone, setTone] = useState<Tone>("professional");
  const [audience, setAudience] = useState("");
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/auth", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTopic = topic.trim();
    if (!trimmedTopic || isGenerating) return;

    const keywords = keywordsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setIsGenerating(true);
    const t = toast.loading("Drafting content with AI…");

    try {
      const jobId = await createJob({
        title: title.trim(),
        topic: trimmedTopic,
        contentType,
        tone,
        audience: audience.trim() || undefined,
        keywords: keywords.length > 0 ? keywords : undefined,
      });

      toast.loading("Draft generated — opening pull request…", { id: t });
      await generateAndPublish({ jobId });
      toast.success("Pull request opened.", { id: t });

      // Light reset: keep tone/type choices, clear text fields for the next run.
      setTopic("");
      setKeywordsRaw("");
      setTitle("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg, { id: t });
    } finally {
      setIsGenerating(false);
    }
  };

  const canSubmit = topic.trim().length > 0 && !isGenerating;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background relative overflow-x-hidden">
      {/* Subtle background grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,theme(colors.border/40)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.border/40)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)] bg-[size:24px_24px] opacity-40"
      />

      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-background/70 border-b border-border/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoDropdown />
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium tracking-tight">
                Content Studio
              </span>
              <span className="hidden sm:inline text-xs text-muted-foreground">
                ·
              </span>
              <span className="hidden sm:inline text-xs text-muted-foreground">
                Dashboard
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="text-muted-foreground"
          >
            <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />
            View site
          </Button>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-8 sm:mb-10">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
              Draft. Generate. Ship.
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Describe what you want to write. We'll generate it with your
              configured AI provider and open a pull request in your repo.
            </p>
          </motion.div>
        </div>

        <div className="mb-6">
          <WebhookSetupCard />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
          >
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  New content job
                </CardTitle>
                <CardDescription>
                  Anything you leave blank is filled in by the AI.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleGenerate} className="grid gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="job-content-type">Content type</Label>
                    <div
                      id="job-content-type"
                      className="grid grid-cols-2 gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => setContentType("blog_post")}
                        className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                          contentType === "blog_post"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-border/80"
                        }`}
                      >
                        <Newspaper
                          className={`h-4 w-4 mt-0.5 shrink-0 ${
                            contentType === "blog_post"
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            Blog Post
                          </div>
                          <div className="text-xs text-muted-foreground">
                            .md · 700–1100 words
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setContentType("article")}
                        className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                          contentType === "article"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-border/80"
                        }`}
                      >
                        <FileText
                          className={`h-4 w-4 mt-0.5 shrink-0 ${
                            contentType === "article"
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium">Article</div>
                          <div className="text-xs text-muted-foreground">
                            .mdx · 1200–1800 words
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="job-title">Title (optional)</Label>
                    <Input
                      id="job-title"
                      placeholder="e.g. Why we switched to Convex"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={120}
                      disabled={isGenerating}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="job-topic">
                      Topic{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="job-topic"
                      placeholder="Describe what the piece should cover. The more specific, the better."
                      rows={5}
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      disabled={isGenerating}
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="job-tone">Tone</Label>
                    <select
                      id="job-tone"
                      value={tone}
                      onChange={(e) => setTone(e.target.value as Tone)}
                      disabled={isGenerating}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {TONE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} — {opt.helper}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="job-audience">
                        Audience (optional)
                      </Label>
                      <Input
                        id="job-audience"
                        placeholder="frontend devs, founders…"
                        value={audience}
                        onChange={(e) => setAudience(e.target.value)}
                        maxLength={80}
                        disabled={isGenerating}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="job-keywords">
                        Keywords (optional, comma-separated)
                      </Label>
                      <Input
                        id="job-keywords"
                        placeholder="convex, realtime, typescript"
                        value={keywordsRaw}
                        onChange={(e) => setKeywordsRaw(e.target.value)}
                        disabled={isGenerating}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full sm:w-auto sm:self-start"
                    size="lg"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate and open PR
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          {/* Job history */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="grid gap-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">
                  Recent jobs
                </h2>
                <p className="text-xs text-muted-foreground/80 mt-0.5">
                  Updates live while a job is in progress.
                </p>
              </div>
              {jobs && jobs.length > 0 && (
                <Badge variant="secondary">
                  {jobs.length}{" "}
                  {jobs.length === 1 ? "job" : "jobs"}
                </Badge>
              )}
            </div>

            {jobs === undefined ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Spinner className="h-5 w-5" />
              </div>
            ) : jobs.length === 0 ? (
              <JobsEmptyState />
            ) : (
              jobs.map((job: ContentJob) => <JobCard key={job._id} job={job} />)
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
