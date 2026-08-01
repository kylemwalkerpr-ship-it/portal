import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LogoDropdown } from "@/components/LogoDropdown";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Copy,
  FileText,
  Github,
  Globe,
  Loader2,
  Newspaper,
  Plus,
  Search,
  Sparkles,
  Target,
  TrendingUp,
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
type JobFilter = "all" | "active" | "ready" | "merged" | "failed";

const TONE_OPTIONS: { value: Tone; label: string; helper: string }[] = [
  { value: "professional", label: "Professional", helper: "Polished, business-friendly" },
  { value: "casual", label: "Casual", helper: "Friendly and conversational" },
  { value: "educational", label: "Educational", helper: "Explainer style" },
  { value: "persuasive", label: "Persuasive", helper: "Opinionated, drives a point" },
  { value: "authoritative", label: "Authoritative", helper: "Confident, expert voice" },
];

interface Template {
  id: string;
  label: string;
  emoji: string;
  contentType: ContentType;
  tone: Tone;
  title: string;
  topic: string;
  audience: string;
  keywords: string;
}

const TEMPLATES: Template[] = [
  {
    id: "explainer",
    label: "Explainer",
    emoji: "📘",
    contentType: "blog_post",
    tone: "educational",
    title: "How the process works: a plain-language guide",
    topic: "Explain how the process works from start to finish, including timelines, costs, and common mistakes to avoid.",
    audience: "people considering this service for the first time",
    keywords: "how it works, guide, steps",
  },
  {
    id: "news",
    label: "News update",
    emoji: "📰",
    contentType: "blog_post",
    tone: "professional",
    title: "What the latest update means for you",
    topic: "Summarize the latest policy or industry update and explain what it changes for clients, with a short FAQ.",
    audience: "clients and prospective clients",
    keywords: "update, changes, faq",
  },
  {
    id: "thought",
    label: "Thought piece",
    emoji: "💡",
    contentType: "article",
    tone: "authoritative",
    title: "Why this matters more than you think",
    topic: "A longer-form opinion piece exploring the deeper trends behind this topic, backed by reasoning and practical takeaways.",
    audience: "professionals and decision-makers",
    keywords: "analysis, trends, insights",
  },
  {
    id: "faq",
    label: "FAQ roundup",
    emoji: "❓",
    contentType: "blog_post",
    tone: "casual",
    title: "Your most common questions, answered",
    topic: "Answer the most frequently asked questions on this topic in a clear, scannable Q&A format.",
    audience: "people with quick questions",
    keywords: "faq, answers, common questions",
  },
];

const FILTERS: { value: JobFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "In progress" },
  { value: "ready", label: "PR ready" },
  { value: "merged", label: "Merged" },
  { value: "failed", label: "Failed" },
];

const STATUS_STAGES: {
  key: ContentJob["status"];
  label: string;
  icon: ReactNode;
  className: string;
}[] = [
  {
    key: "pending",
    label: "Queued",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    className: "bg-muted text-muted-foreground border-border/60",
  },
  {
    key: "drafting",
    label: "Drafting",
    icon: <Sparkles className="h-3 w-3" />,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  {
    key: "publishing",
    label: "Opening PR",
    icon: <Github className="h-3 w-3" />,
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  {
    key: "pr_created",
    label: "PR Ready",
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  {
    key: "merged",
    label: "Merged",
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  },
  {
    key: "closed",
    label: "Closed",
    icon: <XCircle className="h-3 w-3" />,
    className: "bg-muted text-muted-foreground border-border/60",
  },
  {
    key: "failed",
    label: "Failed",
    icon: <CircleAlert className="h-3 w-3" />,
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
];

const STATUS_ORDER: ContentJob["status"][] = [
  "pending",
  "drafting",
  "publishing",
  "pr_created",
  "merged",
  "closed",
  "failed",
];

function statusStage(status: ContentJob["status"]) {
  return STATUS_STAGES.find((s) => s.key === status) ?? STATUS_STAGES[0];
}

/** Index of the furthest stage reached (for the pipeline stepper). */
function stageIndex(status: ContentJob["status"]): number {
  if (status === "failed" || status === "closed") return 3;
  const idx = STATUS_ORDER.indexOf(status);
  if (idx === -1) return 0;
  if (idx >= 3) return 3;
  return idx;
}

function jobStatusBadge(job: ContentJob) {
  const stage = statusStage(job.status);
  return (
    <Badge variant="outline" className={stage.className}>
      {stage.icon}
      <span className="ml-1.5">{stage.label}</span>
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

/** Visual pipeline: Queued → Drafting → PR → Merged, with failure state. */
function StatusPipeline({ status }: { status: ContentJob["status"] }) {
  const stages = [
    { label: "Queued", icon: <Loader2 className="h-3.5 w-3.5" /> },
    { label: "Drafting", icon: <Sparkles className="h-3.5 w-3.5" /> },
    { label: "PR", icon: <Github className="h-3.5 w-3.5" /> },
    { label: "Merged", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  ];
  const reached = stageIndex(status);
  const failed = status === "failed";

  return (
    <div className="flex items-center gap-1.5" aria-label={`Status: ${status}`}>
      {stages.map((s, i) => {
        const isDone = !failed && i < reached;
        const isCurrent = !failed && i === reached && status !== "merged";
        const isMerged = status === "merged" && i === 3;
        return (
          <div key={s.label} className="flex items-center gap-1.5">
            <div
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                isDone || isMerged
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : isCurrent
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : failed && i === 0
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-border/60 bg-muted/40 text-muted-foreground"
              }`}
            >
              {s.icon}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < stages.length - 1 && (
              <div
                className={`h-px w-3 ${
                  i < reached - 1 && !failed
                    ? "bg-emerald-500/50"
                    : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
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
    <Card className="overflow-hidden hover:border-primary/30 transition-all duration-200 hover:shadow-md">
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
            <StatusPipeline status={job.status} />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2.5">
            {contentTypeBadge(job.contentType)}
            <span className="text-xs text-muted-foreground">
              {format(new Date(job.createdAt), "MMM d, yyyy · HH:mm")}
            </span>
            {job.aiProvider && (
              <span className="text-xs text-muted-foreground/70">
                · {job.aiProvider}
              </span>
            )}
            <span className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground/70">
              {expanded ? "Hide details" : "View details"}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </span>
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

function JobsEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center text-center py-12 gap-3">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          {filtered ? (
            <Search className="h-6 w-6 text-muted-foreground" />
          ) : (
            <Newspaper className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="font-medium">
            {filtered ? "No jobs in this view" : "No content generated yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            {filtered
              ? "Try a different filter, or start a new job on the left."
              : "Pick a template on the left or describe your own topic — your first pull request is one click away."}
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
  const [open, setOpen] = useState(false);
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left"
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              GitHub webhook setup
            </CardTitle>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          </div>
          <CardDescription>
            Jobs auto-update to{" "}
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              Merged
            </span>{" "}
            or{" "}
            <span className="font-medium text-muted-foreground">Closed</span>{" "}
            when you act on the pull request.
          </CardDescription>
        </CardHeader>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function GscPanel() {
  const gscStatus = useQuery(api.gscConfig.getGscStatus);
  const connectGsc = useAction(api.gsActions.connectGsc);
  const fetchGscData = useAction(api.gsActions.fetchGscData);

  const [siteUrl, setSiteUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [rows, setRows] = useState<
    | Array<{
        keys: string[];
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
      }>
    | null
  >(null);

  const connected = gscStatus?.connected === true;

  const handleConnect = async (e: FormEvent) => {
    e.preventDefault();
    const url = siteUrl.trim();
    if (!url || connecting) return;
    setConnecting(true);
    try {
      await connectGsc({ siteUrl: url });
      toast.success("Google Search Console connected");
      setSiteUrl("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleLoad = async () => {
    if (!connected || !gscStatus?.siteUrl || loadingData) return;
    setLoadingData(true);
    try {
      const data = await fetchGscData({
        siteUrl: gscStatus.siteUrl,
        rowLimit: 10,
      });
      setRows(data.rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingData(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Google Search Console
        </CardTitle>
        <CardDescription>
          {connected
            ? `Connected to ${gscStatus.siteUrl}`
            : "Link your site to see search performance."}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {!connected ? (
          <form onSubmit={handleConnect} className="flex items-center gap-2">
            <Input
              placeholder="https://example.com/"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              disabled={connecting}
              className="flex-1"
            />
            <Button type="submit" disabled={connecting || !siteUrl.trim()}>
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Globe className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">Connect</span>
            </Button>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <Globe className="h-3 w-3" />
                {gscStatus.siteUrl}
              </Badge>
              {gscStatus.email && (
                <span className="text-xs text-muted-foreground">
                  {gscStatus.email}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Top queries from the last 30 days.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLoad}
                disabled={loadingData}
              >
                {loadingData ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TrendingUp className="h-4 w-4" />
                )}
                <span className="ml-2">{rows ? "Refresh" : "Load data"}</span>
              </Button>
            </div>

            {rows && rows.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-8 text-xs">Query</TableHead>
                      <TableHead className="h-8 text-xs text-right">
                        Clicks
                      </TableHead>
                      <TableHead className="h-8 text-xs text-right hidden sm:table-cell">
                        Impr.
                      </TableHead>
                      <TableHead className="h-8 text-xs text-right">
                        CTR
                      </TableHead>
                      <TableHead className="h-8 text-xs text-right hidden sm:table-cell">
                        Pos.
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow key={i} className="hover:bg-muted/50">
                        <TableCell className="py-1.5 text-xs font-medium">
                          {row.keys[0]}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-right">
                          {row.clicks}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-right hidden sm:table-cell">
                          {row.impressions}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-right">
                          {row.ctr}%
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-right hidden sm:table-cell">
                          {row.position}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {rows && rows.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No query data returned for this period.
              </p>
            )}
          </>
        )}
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
  const [filter, setFilter] = useState<JobFilter>("all");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/auth", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  const stats = useMemo(() => {
    const list = jobs ?? [];
    return {
      total: list.length,
      active: list.filter((j) =>
        ["pending", "drafting", "publishing"].includes(j.status),
      ).length,
      ready: list.filter((j) => j.status === "pr_created").length,
      merged: list.filter((j) => j.status === "merged").length,
      failed: list.filter((j) => j.status === "failed").length,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const list = jobs ?? [];
    switch (filter) {
      case "active":
        return list.filter((j) =>
          ["pending", "drafting", "publishing"].includes(j.status),
        );
      case "ready":
        return list.filter((j) => j.status === "pr_created");
      case "merged":
        return list.filter((j) => j.status === "merged");
      case "failed":
        return list.filter((j) => j.status === "failed");
      default:
        return list;
    }
  }, [jobs, filter]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const applyTemplate = (t: Template) => {
    setContentType(t.contentType);
    setTone(t.tone);
    setTitle(t.title);
    setTopic(t.topic);
    setAudience(t.audience);
    setKeywordsRaw(t.keywords);
    toast.success(`Template “${t.label}” applied — tweak and generate`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleGenerate = async (e: FormEvent) => {
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

  const statCards = [
    {
      label: "Total jobs",
      value: stats.total,
      icon: <Newspaper className="h-4 w-4" />,
      className: "text-primary bg-primary/10",
    },
    {
      label: "In progress",
      value: stats.active,
      icon: <Loader2 className="h-4 w-4" />,
      className: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    },
    {
      label: "PR ready",
      value: stats.ready,
      icon: <Github className="h-4 w-4" />,
      className: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
    },
    {
      label: "Merged",
      value: stats.merged,
      icon: <CheckCircle2 className="h-4 w-4" />,
      className: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    },
    {
      label: "Failed",
      value: stats.failed,
      icon: <CircleAlert className="h-4 w-4" />,
      className: "text-destructive bg-destructive/10",
    },
  ];

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
          <div className="flex items-center gap-2">
            {jobs !== undefined && (
              <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Live
              </span>
            )}
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
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Create content that ships itself.
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Pick a template or describe your own topic. The AI drafts it, opens
            a pull request in your repo, and tracks it until it's merged.
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8"
        >
          {statCards.map((s) => (
            <Card key={s.label} className="hover:border-primary/30 transition-colors">
              <CardContent className="flex items-center gap-3 p-4">
                <div
                  className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${s.className}`}
                >
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-2xl font-semibold leading-none">
                    {s.value}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    {s.label}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
          {/* Create panel */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="lg:sticky lg:top-20 self-start"
          >
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  New content job
                </CardTitle>
                <CardDescription>
                  Start from a template or describe your own. Everything
                  optional is filled in by the AI.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Templates */}
                <div className="grid gap-2">
                  <Label>Start from a template</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => applyTemplate(t)}
                        className="group flex items-center gap-2.5 rounded-md border border-border/70 p-3 text-left transition-all hover:border-primary/50 hover:bg-primary/5"
                      >
                        <span className="text-lg leading-none">{t.emoji}</span>
                        <span className="text-xs font-medium group-hover:text-primary transition-colors">
                          {t.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleGenerate} className="grid gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="job-content-type">Content type</Label>
                    <div id="job-content-type" className="grid grid-cols-2 gap-2">
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
                          <div className="text-sm font-medium">Blog Post</div>
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
                    <Label htmlFor="job-title">
                      Title{" "}
                      <span className="text-xs text-muted-foreground font-normal">
                        (optional)
                      </span>
                    </Label>
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
                      Topic <span className="text-destructive">*</span>
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
                      <Label htmlFor="job-audience">Audience (optional)</Label>
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
                    className="w-full"
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
                  <p className="text-xs text-muted-foreground text-center -mt-2">
                    Leave anything blank and the AI will fill it in.
                  </p>
                </form>
              </CardContent>
            </Card>

            <div className="mt-6">
              <WebhookSetupCard />
            </div>

            <div className="mt-6">
              <GscPanel />
            </div>
          </motion.div>

          {/* Activity feed */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="grid gap-4 content-start"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">
                  Activity
                </h2>
                <p className="text-xs text-muted-foreground/80 mt-0.5">
                  Updates live while a job is in progress.
                </p>
              </div>
              {jobs !== undefined && jobs.length > 0 && (
                <Badge variant="secondary">
                  {stats.total} {stats.total === 1 ? "job" : "jobs"}
                </Badge>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => {
                const count =
                  f.value === "all"
                    ? stats.total
                    : f.value === "active"
                      ? stats.active
                      : f.value === "ready"
                        ? stats.ready
                        : f.value === "merged"
                          ? stats.merged
                          : stats.failed;
                const active = filter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFilter(f.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    {f.label}
                    {count > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                          active
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {jobs === undefined ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Spinner className="h-5 w-5" />
              </div>
            ) : filteredJobs.length === 0 ? (
              <JobsEmptyState filtered={filter !== "all"} />
            ) : (
              <div className="grid gap-4">
                <AnimatePresence initial={false}>
                  {filteredJobs.map((job: ContentJob) => (
                    <motion.div
                      key={job._id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                    >
                      <JobCard job={job} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
