import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Github,
  Sparkles,
  FileText,
  Newspaper,
  Layers,
  GitBranch,
  History,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogoDropdown } from "@/components/LogoDropdown";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router";

function NavBar() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-20 backdrop-blur-md bg-background/70 border-b border-border/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoDropdown />
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">
              Content Studio
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              document
                .getElementById("how-it-works")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="hidden sm:inline-flex text-muted-foreground"
          >
            How it works
          </Button>
          <Button
            variant={isAuthenticated ? "default" : "outline"}
            size="sm"
            onClick={() => navigate(isAuthenticated ? "/dashboard" : "/auth")}
          >
            {isAuthenticated ? (
              <>
                Open the studio
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Sign in
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}

function HeroBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,theme(colors.border/40)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.border/40)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_60%_55%_at_50%_30%,black,transparent)] opacity-50" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[520px] w-[820px] max-w-[95vw] rounded-full bg-gradient-to-tr from-indigo-500/30 via-violet-500/20 to-fuchsia-500/20 blur-3xl opacity-70" />
    </div>
  );
}

function Hero() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  return (
    <section className="relative">
      <HeroBackdrop />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 backdrop-blur px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm"
        >
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          AI-drafted, GitHub-shipped
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mt-6 text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]"
        >
          Draft blog posts and articles{" "}
          <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
            without leaving your repo.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12 }}
          className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto"
        >
          Pick a topic. Choose a tone. Content Studio generates a
          publish-ready piece with your configured AI provider, then opens a
          pull request — ready for review, ready to merge.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Button
            size="lg"
            onClick={() => navigate(isAuthenticated ? "/dashboard" : "/auth")}
            className="w-full sm:w-auto shadow-sm"
          >
            {isAuthenticated ? "Open the studio" : "Get started"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="w-full sm:w-auto text-muted-foreground"
            onClick={() =>
              document
                .getElementById("how-it-works")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            How it works
            <ChevronDown className="ml-1 h-4 w-4" />
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mt-10 inline-flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground/80"
        >
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            OpenAI · Anthropic
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Blog (.md) and Article (.mdx)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            PR-based workflow
          </span>
        </motion.div>
      </div>
    </section>
  );
}

type Step = {
  num: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  code: string[];
};

const STEPS: Step[] = [
  {
    num: "01",
    icon: <Newspaper className="h-5 w-5" />,
    title: "Describe your post",
    body: "From the dashboard, set a topic, tone, audience, and a few keywords. Pick Blog Post or Article.",
    code: [
      "topic: \"Why we moved from REST to tRPC\"",
      "tone:   \"educational\"",
      "type:   \"blog_post\"",
    ],
  },
  {
    num: "02",
    icon: <Sparkles className="h-5 w-5" />,
    title: "AI drafts the content",
    body: "We call your configured AI provider (OpenAI or Anthropic) and stream a complete Markdown piece — front matter, sections, examples, conclusion.",
    code: [
      "→ generateText({ model, prompt })",
      "→ frontmatter: { title, date, slug, tags }",
      "→ ~900 words of opinionated Markdown",
    ],
  },
  {
    num: "03",
    icon: <Github className="h-5 w-5" />,
    title: "A pull request lands",
    body: "We open a GitHub branch off your default, commit the file, and create a PR with the draft, ready for your review.",
    code: [
      "branch: content/why-we-moved-2026-07-21",
      "file:   content/blog/2026-07-21-…md",
      "PR:     https://github.com/you/repo/pull/142",
    ],
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-16 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            Workflow
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
            Three steps from idea to PR.
          </h2>
          <p className="mt-3 text-muted-foreground">
            No new CMS. No content databases to babysit. Every piece ships
            through the same review process as your code.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-5">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.45, delay: i * 0.06 }}
            >
              <Card className="h-full overflow-hidden">
                <CardContent className="p-6 flex flex-col h-full">
                  <div className="flex items-center justify-between">
                    <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                      {step.icon}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      step {step.num}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground flex-1">
                    {step.body}
                  </p>
                  <div className="mt-5 rounded-md border border-border/60 bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
                    {step.code.map((line, idx) => (
                      <div
                        key={idx}
                        className="text-foreground/80 whitespace-pre-wrap break-words"
                      >
                        <span className="text-muted-foreground/50 select-none mr-2">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        {line}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

type Feature = {
  icon: React.ReactNode;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: <Layers className="h-4 w-4" />,
    title: "Multi-format by design",
    body: "Generate a tight blog post in Markdown, or a longer in-depth article in MDX. File paths follow your repo convention.",
  },
  {
    icon: <Sparkles className="h-4 w-4" />,
    title: "Pluggable AI providers",
    body: "Use OpenAI or Anthropic. Swap providers by setting an env var — your team picks the model that fits the budget.",
  },
  {
    icon: <GitBranch className="h-4 w-4" />,
    title: "GitHub-native workflow",
    body: "Every draft is a branch, a commit, and a pull request. Review with the rest of the team. Merge when ready.",
  },
  {
    icon: <History className="h-4 w-4" />,
    title: "Live status tracking",
    body: "Queued → drafting → opening PR → ready. The dashboard reflects every stage in real time, with full content preview.",
  },
  {
    icon: <ShieldCheck className="h-4 w-4" />,
    title: "Per-user job isolation",
    body: "Every generator is scoped to the signed-in user. Authentication runs server-side on every action — no leaks.",
  },
  {
    icon: <FileText className="h-4 w-4" />,
    title: "Front matter included",
    body: "Posts ship with proper YAML front matter (title, date, slug, tags) so your static-site generator can index them on merge.",
  },
];

function Features() {
  return (
    <section className="relative py-16 sm:py-24 border-t border-border/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            Built for shipping
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
            Less CMS. More commits.
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
            >
              <Card className="h-full hover:border-border/80 transition-colors">
                <CardContent className="p-5">
                  <div className="h-8 w-8 rounded-md bg-muted text-foreground flex items-center justify-center">
                    {feature.icon}
                  </div>
                  <h3 className="mt-4 text-sm font-semibold tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    {feature.body}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  return (
    <section className="relative py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55 }}
        >
          <Card className="overflow-hidden border-border/80">
            <CardContent className="relative p-8 sm:p-12">
              <div
                aria-hidden
                className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10"
              />
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight max-w-2xl">
                Ready to ship your next post?
              </h2>
              <p className="mt-3 text-muted-foreground max-w-xl">
                Open the studio, describe your idea, and let the AI handle
                the blank page. You'll review the result in a pull request
                like everything else you ship.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <Button
                  size="lg"
                  onClick={() =>
                    navigate(isAuthenticated ? "/dashboard" : "/auth")
                  }
                >
                  {isAuthenticated ? "Open the studio" : "Sign in to start"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      "https://docs.convex.dev",
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  <Github className="mr-2 h-4 w-4" />
                  Powered by Convex
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Content Studio · Ship blog posts the way you ship code.
        </div>
        <div className="text-xs text-muted-foreground/70">
          Configure AI keys and GitHub access in your project's API keys
          panel.
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen flex flex-col"
    >
      <NavBar />
      <Hero />
      <HowItWorks />
      <Features />
      <FinalCta />
      <Footer />
    </motion.div>
  );
}
