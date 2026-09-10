import type { Doc } from "@/convex/_generated/dataModel";
import { formatDuration, naturalSortKey, compareKeys } from "@/lib/video";
import { Bookmark, CheckCircle2, Play } from "lucide-react";

export type CatalogVideo = Doc<"videos"> & {
  courseName: string;
  state: Doc<"videoStates"> | null;
};

export function sortCatalogVideos(videos: CatalogVideo[]): CatalogVideo[] {
  return [...videos].sort((a, b) =>
    compareKeys(naturalSortKey(a.path), naturalSortKey(b.path)),
  );
}

export function progressFraction(video: CatalogVideo): number {
  const state = video.state;
  if (!state || video.durationSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, state.positionSeconds / video.durationSeconds));
}

export function VideoRow({
  video,
  onOpen,
  showCourse = false,
}: {
  video: CatalogVideo;
  onOpen: () => void;
  showCourse?: boolean;
}) {
  const progress = progressFraction(video);
  const duration = formatDuration(video.durationSeconds);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full items-center gap-3 overflow-hidden rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border/70 hover:bg-accent/30"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Play className="size-3.5 fill-current" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{video.name}</span>
        {showCourse && (
          <span className="font-mono-tight block truncate text-xs text-muted-foreground">
            {video.courseName}
          </span>
        )}
      </span>

      {video.state?.bookmarked && (
        <Bookmark className="size-3.5 shrink-0 fill-primary text-primary" />
      )}

      {video.state?.completed ? (
        <CheckCircle2 className="size-4 shrink-0 text-primary" />
      ) : (
        <span className="font-mono-tight shrink-0 text-xs tabular-nums text-muted-foreground">
          {duration ?? "—"}
        </span>
      )}

      {progress > 0 && (
        <span className="absolute inset-x-3 bottom-1 h-0.5 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-primary"
            style={{ width: `${progress * 100}%` }}
          />
        </span>
      )}
    </button>
  );
}
