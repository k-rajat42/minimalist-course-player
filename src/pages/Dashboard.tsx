import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AppShell } from "@/components/AppShell";
import { ImportDialog } from "@/components/ImportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useTitle } from "@/hooks/use-title";
import { buildHeatmap, computeStreak, heatmapLevel, type ActivityRow } from "@/lib/streak";
import { formatDuration, formatTotal } from "@/lib/video";
import {
  Bookmark,
  CheckCircle2,
  Flame,
  FolderOpen,
  FolderTree,
  Search,
  Tags,
} from "lucide-react";
import { VideoRow } from "@/components/VideoRow";
import { cn } from "@/lib/utils";

type Filter = "all" | "bookmark" | "tags" | "done";

export default function Dashboard() {
  useTitle("Library · GEN AI Course Tracker");
  const { user } = useAuth();

  const courses = useQuery(api.library.listCourses);
  const videos = useQuery(api.library.listVideos);
  const activity = useQuery(api.library.listActivity);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of videos ?? []) {
      for (const t of v.state?.tags ?? []) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [videos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (videos ?? []).filter((v) => {
      if (filter === "bookmark" && !v.state?.bookmarked) return false;
      if (filter === "done" && !v.state?.completed) return false;
      if (filter === "tags") {
        if (tagFilter && !(v.state?.tags ?? []).includes(tagFilter)) return false;
      } else if (tagFilter && !(v.state?.tags ?? []).includes(tagFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.path.toLowerCase().includes(q) ||
        v.courseName.toLowerCase().includes(q)
      );
    });
  }, [videos, query, filter, tagFilter]);

  const stats = useMemo(() => {
    const list = videos ?? [];
    const totalSeconds = list.reduce((sum, v) => sum + v.durationSeconds, 0);
    const completed = list.filter((v) => v.state?.completed).length;
    return { totalSeconds, completed, count: list.length };
  }, [videos]);

  const continueWatching = useMemo(() => {
    return (videos ?? [])
      .filter((v) => v.state && !v.state.completed && v.state.positionSeconds > 5)
      .sort((a, b) => (b.state?.updatedAt ?? 0) - (a.state?.updatedAt ?? 0))
      .slice(0, 4);
  }, [videos]);

  const loading = courses === undefined || videos === undefined;
  const isEmpty = !loading && (videos ?? []).length === 0;

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { courseId: string; courseName: string; videos: typeof filtered }
    >();
    for (const v of filtered) {
      const entry = map.get(v.courseName);
      if (entry) {
        entry.videos.push(v);
      } else {
        map.set(v.courseName, { courseId: v.courseId, courseName: v.courseName, videos: [v] });
      }
    }
    return [...map.values()];
  }, [filtered]);

  const activityRows: ActivityRow[] = activity ?? [];
  const streak = computeStreak(activityRows);
  const heatmap = buildHeatmap(activityRows, 12);

  return (
    <AppShell streakCurrent={streak.current} watchedToday={streak.watchedToday}>
      {/* Header row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono-tight text-xs uppercase tracking-widest text-muted-foreground">
            $ cat library.stats
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome back{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Loading your library…"
              : isEmpty
                ? "Connect a folder to start tracking lectures."
                : `${stats.count} lectures · ${stats.completed} completed · ${formatTotal(
                    stats.totalSeconds,
                  )} of content`}
          </p>
        </div>
        <Button onClick={() => setImportOpen(true)} className="gap-2 self-start sm:self-auto">
          <FolderOpen className="size-4" />
          {isEmpty ? "Connect folder" : "Re-scan folder"}
        </Button>
      </div>

      {loading && (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {isEmpty && (
        <div className="glow-top mt-10 flex flex-col items-center gap-4 rounded-xl border border-border/70 bg-card px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <FolderTree className="size-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">No courses connected yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Point the tracker at the folder on your laptop where the course videos live. Every
              subfolder becomes a course, lectures get ordered automatically, and your progress
              is saved between sessions.
            </p>
          </div>
          <Button onClick={() => setImportOpen(true)} className="gap-2">
            <FolderOpen className="size-4" />
            Pick your course folder
          </Button>
          <p className="font-mono-tight text-xs text-muted-foreground">
            nothing to track yet <span className="caret-blink text-primary">▍</span>
          </p>
        </div>
      )}

      {!loading && !isEmpty && (
        <>
          {/* Continue watching */}
          {continueWatching.length > 0 && (
            <section className="mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  Continue watching
                </h2>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {continueWatching.map((v) => {
                  const frac =
                    v.durationSeconds > 0
                      ? Math.min(1, (v.state?.positionSeconds ?? 0) / v.durationSeconds)
                      : 0;
                  const remaining = Math.max(
                    0,
                    v.durationSeconds - (v.state?.positionSeconds ?? 0),
                  );
                  return (
                    <Link
                      key={v._id}
                      to={`/watch/${v._id}`}
                      className="glow-top group rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/50"
                    >
                      <p className="truncate text-sm font-medium">{v.name}</p>
                      <p className="font-mono-tight mt-0.5 truncate text-xs text-muted-foreground">
                        {v.courseName}
                      </p>
                      <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${frac * 100}%` }}
                        />
                      </div>
                      <p className="font-mono-tight mt-2 text-xs text-muted-foreground">
                        {formatDuration(remaining) ?? "0:00"} left
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Streak + heatmap */}
          <section className="mt-8 grid gap-3 md:grid-cols-3">
            <div className="glow-top rounded-xl border border-border/70 bg-card p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Flame className="size-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-widest">Current streak</p>
              </div>
              <p className="mt-2 text-3xl font-bold tracking-tight">
                {streak.current}
                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  day{streak.current === 1 ? "" : "s"}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {streak.watchedToday
                  ? "Nice — the streak is safe for today."
                  : "Watch any lecture today to keep it going."}
              </p>
            </div>
            <div className="glow-top rounded-xl border border-border/70 bg-card p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="size-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-widest">Progress</p>
              </div>
              <p className="mt-2 text-3xl font-bold tracking-tight">
                {stats.completed}
                <span className="text-sm font-medium text-muted-foreground">
                  {" "}
                  / {stats.count}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Lectures finished so far — keep going.
              </p>
            </div>
            <div className="glow-top rounded-xl border border-border/70 bg-card p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Bookmark className="size-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-widest">Bookmarked</p>
              </div>
              <p className="mt-2 text-3xl font-bold tracking-tight">
                {(videos ?? []).filter((v) => v.state?.bookmarked).length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Saved for a focused rewatch later.
              </p>
            </div>

            <div className="md:col-span-3 glow-top rounded-xl border border-border/70 bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <Flame className="size-4 text-primary" />
                  Last 12 weeks
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  less
                  {[0, 1, 2, 3, 4].map((level) => (
                    <span
                      key={level}
                      className={cn(
                        "size-2.5 rounded-[3px]",
                        level === 0 && "bg-muted",
                        level === 1 && "bg-primary/25",
                        level === 2 && "bg-primary/45",
                        level === 3 && "bg-primary/70",
                        level === 4 && "bg-primary",
                      )}
                    />
                  ))}
                  more
                </div>
              </div>
              <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
                {heatmap.map((cell) => (
                  <span
                    key={cell.date}
                    title={`${cell.date}${
                      cell.seconds ? ` · ${formatDuration(cell.seconds)} watched` : ""
                    }`}
                    className={cn(
                      "size-3 shrink-0 rounded-[3px]",
                      heatmapLevel(cell.seconds) === 0 && "bg-muted",
                      heatmapLevel(cell.seconds) === 1 && "bg-primary/25",
                      heatmapLevel(cell.seconds) === 2 && "bg-primary/45",
                      heatmapLevel(cell.seconds) === 3 && "bg-primary/70",
                      heatmapLevel(cell.seconds) === 4 && "bg-primary",
                    )}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* Search + filters */}
          <section className="mt-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-sm">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search lectures and courses…"
                  className="pl-9"
                />
              </div>
              <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="bookmark" className="gap-1.5">
                    <Bookmark className="size-3.5" />
                    Bookmarked
                  </TabsTrigger>
                  <TabsTrigger value="tags" className="gap-1.5">
                    <Tags className="size-3.5" />
                    Tags
                  </TabsTrigger>
                  <TabsTrigger value="done" className="gap-1.5">
                    <CheckCircle2 className="size-3.5" />
                    Completed
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {allTags.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {allTags.map(([tag, count]) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setTagFilter((prev) => (prev === tag ? null : tag))}
                    className={cn(
                      "font-mono-tight rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                      tagFilter === tag
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border/70 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                    )}
                  >
                    #{tag} <span className="opacity-60">{count}</span>
                  </button>
                ))}
                {tagFilter && (
                  <button
                    type="button"
                    onClick={() => setTagFilter(null)}
                    className="text-xs text-muted-foreground underline"
                  >
                    clear
                  </button>
                )}
              </div>
            )}

            {/* Catalog grouped by course */}
            <div className="mt-5 space-y-8">
              {grouped.map((course) => (
                <div key={course.courseId}>
                  <div className="flex items-center gap-2">
                    <FolderTree className="size-4 text-primary" />
                    <h3 className="font-mono-tight text-sm font-semibold tracking-tight">
                      {course.courseName}
                    </h3>
                    <span className="font-mono-tight text-xs text-muted-foreground">
                      · {course.videos.length} lecture{course.videos.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-2 divide-y divide-border/40 overflow-hidden rounded-xl border border-border/70 bg-card">
                    {course.videos.map((v) => (
                      <VideoRowWrapper key={v._id} video={v} />
                    ))}
                  </div>
                </div>
              ))}
              {grouped.length === 0 && (
                <p className="rounded-xl border border-dashed border-border/70 px-6 py-12 text-center text-sm text-muted-foreground">
                  Nothing matches this search or filter.
                </p>
              )}
            </div>
          </section>
        </>
      )}

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </AppShell>
  );
}

function VideoRowWrapper({ video }: { video: import("@/components/VideoRow").CatalogVideo }) {
  const navigate = useNavigate();
  return (
    <VideoRow
      video={video}
      showCourse={false}
      onOpen={() => navigate(`/watch/${video._id}`)}
    />
  );
}
