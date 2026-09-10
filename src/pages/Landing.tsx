import { useTitle } from "@/hooks/use-title";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router";
import {
  Bookmark,
  Brain,
  CheckCircle2,
  Flame,
  FolderOpen,
  Play,
  Search,
  Tag,
  Terminal,
  ArrowRight,
  MousePointerClick,
} from "lucide-react";
import { useEffect, useState } from "react";

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="group flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 px-4 py-4 transition-colors hover:border-primary/40 hover:bg-accent/20">
      <div className="flex items-center gap-2.5 text-muted-foreground">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/8 text-primary transition-colors group-hover:bg-primary/15">
          <Icon className="size-4" />
        </span>
        <span className="font-semibold tracking-tight text-sm">{title}</span>
      </div>
      <p className="leading-relaxed text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

const terminalLine = (parts: React.ReactNode, delay = 0) => (
  <motion.div
    initial={{ opacity: 0, x: -8 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: 0.05 + delay * 0.08, duration: 0.35 }}
    className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground"
  >
    <span className="mt-0.5 shrink-0 text-primary">❯</span>
    <span className="font-mono-tight">{parts}</span>
  </motion.div>
);

export default function Landing() {
  useTitle("GEN AI Course Tracker");
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      className="relative min-h-screen bg-grid overflow-hidden"
      style={{ backgroundSize: "32px 32px" }}
    >
      {/* Subtle radial vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 70% -10%, oklch(0.84 0.16 165 / 0.14), transparent 60%), radial-gradient(900px 500px at 10% 110%, oklch(0.8 0.14 200 / 0.1), transparent 60%)",
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-mono-tight font-semibold tracking-tight"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Play className="size-3.5 fill-current" />
          </span>
          <span>gen-ai<span className="text-primary">/course</span></span>
        </Link>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/auth")}
          >
            <MousePointerClick className="size-3.5" />
            Sign in
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => navigate("/auth?returnTo=/dashboard")}
          >
            Get started
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center px-4 pb-16 pt-12 sm:pt-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={mounted ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full max-w-3xl"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-mono-tight text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-primary" />
            local-first · browser-only · your files stay on your laptop
          </div>

          <h1 className="font-mono-tight text-4xl font-bold tracking-tight sm:text-5xl">
            A tracker for the{" "}
            <span className="text-primary">GEN AI</span>{" "}
            courses you already downloaded
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Point it at the folder on your machine and it builds a clean,
            searchable catalog from every course folder you keep there. Play
            videos straight from your drive, pick up where you left off, tag
            lectures, and keep a daily watch streak without uploading anything.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="gap-2 text-base px-6"
              onClick={() => navigate("/auth?returnTo=/dashboard")}
            >
              <FolderOpen className="size-4" />
              Connect your course folder
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="gap-2 text-base px-6"
              onClick={() => navigate("/auth?returnTo=/dashboard")}
            >
              See the dashboard
              <ArrowRight className="size-4" />
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            No uploads. No accounts required to start. Works best in Chrome,
            Edge, or another Chromium browser.
          </p>
        </motion.div>
      </main>

      {/* Terminal block */}
      <section className="relative z-10 mx-auto max-w-3xl px-4 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={mounted ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.25, duration: 0.45 }}
          className="rounded-xl border border-primary/20 bg-card/70 px-4 py-5 sm:px-5 sm:py-6"
          style={{
            boxShadow:
              "0 0 0 1px oklch(0.84 0.16 165 / 0.12), 0 0 30px -20px oklch(0.84 0.16 165 / 0.35)",
          }}
        >
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Terminal className="size-3.5" />
            term — genai-course-tracker
          </div>

          <div className="space-y-2">
            {terminalLine(
              <>
                <span className="text-primary">genai-course-tracker</span>{" "}
                connect ~/Courses/GEN-AI
              </>,
              0,
            )}
            {terminalLine(
              <>
                <span className="text-muted-foreground">scanning</span>{" "}
                <span className="text-primary">7</span> course folders…
              </>,
              1,
            )}
            {terminalLine(
              <>
                <span className="text-muted-foreground">course</span>{" "}
                <span className="text-primary">COMPLETION-2024</span> ·{" "}
                <span className="text-primary">14</span> lectures ·{" "}
                <span className="text-primary">12h 40m</span> total
              </>,
              2,
            )}
            {terminalLine(
              <>
                <span className="text-muted-foreground">course</span>{" "}
                <span className="text-primary">RAG-FUNDAMENTALS</span> ·{" "}
                <span className="text-primary">9</span> lectures ·{" "}
                <span className="text-primary">6h 12m</span> total
              </>,
              3,
            )}
            {terminalLine(
              <>
                <span className="text-muted-foreground">streak</span>{" "}
                <span className="text-primary">4</span> days · watching{" "}
                <span className="text-primary">Embedding Models</span>
              </>,
              4,
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-primary" />
            control + c to stop · files never leave your machine
          </div>
        </motion.div>
      </section>

      {/* Feature grid */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="font-mono-tight text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              What it does
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Built for the way course folders actually live
            </h2>
          </div>
          <p className="hidden sm:block text-right text-xs text-muted-foreground">
            no cloud · no uploads · just catalog + progress
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: FolderOpen,
              title: "Catalog from your folders",
              description:
                "Every top-level folder becomes a course. Lectures inside are sorted in the order that makes sense, so Lecture 2 comes before Lecture 10.",
            },
            {
              icon: Search,
              title: "Search and filter",
              description:
                "Find a lecture by name, course, or tag. Bookmark the important ones, pull up completed videos, or search across the whole library.",
            },
            {
              icon: Play,
              title: "Play straight from disk",
              description:
                "Videos play from your local folder through a persisted file handle. No server uploads, no streaming backend — the browser talks to your drive.",
            },
            {
              icon: Bookmark,
              title: "Pick up where you left off",
              description:
                "Each video remembers your position between sessions. Re-open the course tomorrow and it starts close to where you stopped.",
            },
            {
              icon: Tag,
              title: "Notes and tags",
              description:
                "Drop a note on any lecture, add tags to shape your own filters, and mark videos as done when you finish them.",
            },
            {
              icon: Flame,
              title: "Daily watch streak",
              description:
                "Watch any lecture and the day counts. A streak keeps you going through a course, with a heatmap of the last few months.",
            },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 10 }}
              animate={mounted ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.35 }}
            >
              <FeatureCard {...f} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* Stats strip */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={mounted ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-6 rounded-xl border border-border/70 bg-card/40 px-6 py-5 text-sm"
        >
          {[
            { icon: Brain, label: "Built for downloaded AI courses", value: "GEN AI" },
            { icon: CheckCircle2, label: "Progress stays on your machine", value: "local-first" },
            { icon: Flame, label: "Keep the streak alive", value: "daily" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-muted-foreground">
              <span className="text-primary">
                <s.icon className="size-3.5" />
              </span>
              <span>{s.label}</span>
              <span className="font-mono-tight text-primary">{s.value}</span>
            </div>
          ))}
        </motion.div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-3xl px-4 pb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={mounted ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="rounded-xl border border-border/70 bg-card/40 p-8"
        >
          <h2 className="font-mono-tight text-xl font-bold tracking-tight">
            Ready when your course folder is
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Sign in, choose the folder that holds your GEN AI course videos, and
            the catalog is ready.
          </p>
          <Button
            className="mt-5 gap-2"
            size="lg"
            onClick={() => navigate("/auth?returnTo=/dashboard")}
          >
            Open the tracker
            <ArrowRight className="size-4" />
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/70 bg-background/40 px-4 py-6 text-center text-xs text-muted-foreground sm:px-6">
        <p className="font-mono-tight">
          gen-ai/course · a local-first tracker for downloaded course videos
        </p>
      </footer>
    </div>
  );
}
