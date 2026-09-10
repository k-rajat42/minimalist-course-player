import { loadVideoHandle } from "@/lib/video";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { unixToDate } from "@/lib/streak";
import { Link, useParams } from "react-router";
import { useEffect, useRef, useState } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function durationFor(s: number | undefined | null): string {
  if (!s || s <= 0) return "0:00";
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function formatTimestamp(ts: number): string {
  const h = Math.floor(ts / 3600);
  const m = Math.floor((ts % 3600) / 60);
  const s = Math.floor(ts % 60);
  return `${h > 0 ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const cmpTags = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const videoId = (id ?? "") as Id<"videos">;

  const video = useQuery(api.library.getVideo, { videoId }) ?? null;
  const state = useQuery(api.library.getVideoState, { videoId }) ?? null;
  const notes = useQuery(api.library.listNotes, { videoId }) ?? [];

  const saveProgress = useMutation(api.library.saveProgress);
  const toggleBookmark = useMutation(api.library.toggleBookmark);
  const addNote = useMutation(api.library.addNote);
  const setTags = useMutation(api.library.setTags);
  const setCompleted = useMutation(api.library.setCompleted);
  const deleteNote = useMutation(api.library.deleteNote);

  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [pinnedTs, setPinnedTs] = useState<number | null>(null);

  // --- playback ---
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const startAt = useRef(0);
  const lastSaved = useRef(0);
  const scrubbing = useRef(false);
  const pendingSeek = useRef<number | null>(null);

  const save = () => {
    if (!video || !videoRef.current) return;
    const now = Date.now();
    if (now - lastSaved.current < 2000) return;
    lastSaved.current = now;
    saveProgress({
      videoId: video._id,
      positionSeconds: videoRef.current.currentTime,
      durationSeconds: video.durationSeconds,
      secondsWatchedDelta: 0,
    }).catch(() => {});
  };

  const handleTimeUpdate = () => {
    if (!video || scrubbing.current) return;
    const t = videoRef.current?.currentTime ?? 0;
    if (t - startAt.current > 10) {
      startAt.current = t;
      save();
    }
  };

  const handleSeek = () => {
    scrubbing.current = true;
    save();
    setTimeout(() => { scrubbing.current = false; }, 350);
  };

  const seekTo = (ts: number) => {
    const el = videoRef.current;
    if (!el) return;
    scrubbing.current = true;
    el.currentTime = ts;
    setTimeout(() => { scrubbing.current = false; }, 350);
  };

  // resume position after mount (or as soon as metadata is available)
  useEffect(() => {
    if (!video || !state) return;
    const pos = state.positionSeconds;
    if (!pos || pos <= 1) return;
    const el = videoRef.current;
    if (el && el.readyState >= 1) {
      el.currentTime = pos;
    } else {
      pendingSeek.current = pos;
    }
    // Only re-run when the watched video or its saved state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?._id, state?._id, state?.positionSeconds]);

  const handleLoadedMetadata = () => {
    if (pendingSeek.current != null && videoRef.current) {
      videoRef.current.currentTime = pendingSeek.current;
      pendingSeek.current = null;
    }
  };

  // file handle + source
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      if (!video) return;
      const file = await loadVideoHandle(video._id);
      if (cancelled || !file || !videoRef.current) return;
      url = URL.createObjectURL(file);
      videoRef.current.src = url;
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [video?._id]);

  const toggle = async () => {
    if (!video) return;
    try {
      const now = await toggleBookmark({ videoId: video._id });
      toast.success(now ? "Bookmarked" : "Bookmark removed", {
        description: now
          ? "Saved for a focused rewatch later."
          : "Removed from your bookmarks.",
      });
    } catch {
      // keep silent — the bookmark state will simply not change
    }
  };

  const submitNote = async () => {
    if (!video || !note.trim() || savingNote) return;
    setSavingNote(true);
    try {
      await addNote({
        videoId: video._id,
        text: note.trim(),
        timestampSeconds: pinnedTs ?? undefined,
      });
      setNote("");
      setPinnedTs(null);
      toast.success("Note saved", {
        description:
          pinnedTs != null
            ? `Pinned to ${formatTimestamp(pinnedTs)} in this video.`
            : "Added to this video.",
      });
    } catch {
      toast.error("Could not save note", {
        description: "Please try again in a moment.",
      });
    } finally {
      setSavingNote(false);
    }
  };

  const tags: string[] = state?.tags ?? [];

  const applyTags = async (patch: { add?: string[]; remove?: string[] }) => {
    if (!video) return;
    const next = new Set(tags);
    patch.add?.forEach((n) => n && next.add(n.trim().toLowerCase()));
    patch.remove?.forEach((n) => n && next.delete(n));
    await setTags({
      videoId: video._id,
      tags: Array.from(next).sort(cmpTags),
    }).catch(() => {});
  };

  const appendTag = async () => {
    const name = newTag.trim().toLowerCase();
    if (!name || !video) return;
    setNewTag("");
    await applyTags({ add: [name] });
    toast.success("Tag added", { description: `#${name} — filter with it on the dashboard.` });
  };

  const removeTag = async (name: string) => {
    await applyTags({ remove: [name] });
    toast("Tag removed", { description: `#${name} is no longer on this lecture.` });
  };

  const toggleCompleted = async () => {
    if (!video) return;
    await setCompleted({
      videoId: video._id,
      completed: !(state?.completed ?? false),
    }).catch(() => {});
  };

  const removeNote = async (noteId: Id<"notes">) => {
    await deleteNote({ noteId }).catch(() => {});
  };

  const courseName = video?.courseName;
  const backUrl = courseName
    ? `/dashboard?folder=${encodeURIComponent(courseName)}`
    : "/dashboard";

  if (!video) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground tracking-wide">
          {id ? "Video not found in your library." : "Nothing selected."}
        </div>
      </div>
    );
  }

  const watchedSeconds = state?.positionSeconds ?? 0;
  const dur = video.durationSeconds ?? 0;
  const pct = dur > 0 ? Math.round((watchedSeconds / dur) * 100) : 0;
  const savedAt = state?.updatedAt ?? null;
  const completed = state?.completed ?? false;
  const bookmarked = state?.bookmarked ?? false;

  return (
    <div className="bg-grid min-h-screen flex flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/70 bg-background/90 backdrop-blur">
        <Link
          to={backUrl}
          className="text-sm text-muted-foreground hover:text-foreground transition flex items-center gap-2"
        >
          <span className="text-base">←</span>
          <span className="hidden sm:inline">Back to course</span>
          <span className="sm:hidden">Back</span>
        </Link>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            className={`px-3 py-1.5 rounded-md text-xs font-medium tracking-wide border transition ${
              bookmarked
                ? "bg-primary/15 border-primary/40 text-primary"
                : "border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}
            title={bookmarked ? "Bookmarked" : "Bookmark"}
          >
            {bookmarked ? "★ Bookmarked" : "☆ Bookmark"}
          </button>

          <div className="font-mono-tight flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{durationFor(video.durationSeconds)}</span>
          </div>
        </div>
      </div>

      {/* player */}
      <div className="flex-1 flex items-center justify-center bg-black/40 px-4 py-4">
        <video
          ref={videoRef}
          controls
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onSeeked={handleSeek}
          onEnded={save}
          playsInline
          className="max-w-4xl max-h-[70vh] w-full rounded-lg bg-black/60 shadow-[0_0_0_1px_oklch(0.84_0.16_165/0.12)]"
        />
      </div>

      {/* progress hint */}
      {state?.positionSeconds != null && state.positionSeconds > 1 && (
        <div className="font-mono-tight text-center text-xs text-primary/70 tracking-wide pb-1 -mt-2">
          resuming from {durationFor(state.positionSeconds)}
        </div>
      )}

      {/* meta strip */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-2 text-xs text-muted-foreground border-b border-border/70">
        <span className="truncate max-w-[200px]">{courseName}</span>
        <span className="opacity-30">/</span>
        <span className="font-mono-tight font-medium text-foreground">{video.name}</span>
        <span className="opacity-30">·</span>
        <span className="font-mono-tight">{pct}% watched</span>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 max-w-5xl mx-auto w-full">
        {/* notes */}
        <section className="w-full lg:w-[340px] shrink-0 p-5 lg:border-r border-border/70">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
            <span className="inline-block w-5 h-px bg-primary/40" />
            Notes
          </h2>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitNote();
                  }
                }}
                placeholder="Add a note…"
                className="flex-1 rounded-md border border-border/70 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/50 transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={pinnedTs != null ? "secondary" : "outline"}
                className="gap-1.5 text-xs"
                onClick={() => {
                  const el = videoRef.current;
                  if (!el) return;
                  setPinnedTs(Math.floor(el.currentTime));
                }}
                title="Pin this note to the current playback position"
              >
                {pinnedTs != null ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                {pinnedTs != null ? `Pinned at ${formatTimestamp(pinnedTs)}` : "Pin to current time"}
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={submitNote}
                disabled={!note.trim() || savingNote}
                className="ml-auto gap-1.5"
              >
                <Plus className="size-3.5" />
                {savingNote ? "Saving…" : "Save note"}
              </Button>
            </div>

            {pinnedTs != null && (
              <button
                type="button"
                onClick={() => setPinnedTs(null)}
                className="font-mono-tight self-start text-[11px] text-muted-foreground underline"
              >
                clear pin
              </button>
            )}
          </div>

          <div className="mt-5 space-y-2">
            {notes.map((n) => (
              <div
                key={n._id}
                className="group rounded-lg border border-border/70 bg-card px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  {n.timestampSeconds != null ? (
                    <button
                      type="button"
                      onClick={() => seekTo(n.timestampSeconds!)}
                      className="font-mono-tight rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/20 transition-colors"
                      title="Jump to this moment"
                    >
                      ▸ {formatTimestamp(n.timestampSeconds)}
                    </button>
                  ) : (
                    <span className="font-mono-tight text-[11px] text-muted-foreground">
                      {unixToDate(n.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeNote(n._id)}
                    className="text-muted-foreground/40 opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                    title="Delete note"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                  {n.text}
                </p>
              </div>
            ))}
            {notes.length === 0 && (
              <p className="font-mono-tight text-xs text-muted-foreground/70">
                no notes yet <span className="caret-blink text-primary">▍</span>
              </p>
            )}
          </div>
        </section>

        {/* tags + viewer */}
        <section className="flex-1 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
            <span className="inline-block w-5 h-px bg-primary/40" />
            Tags
          </h2>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 border border-primary/25 text-primary"
              >
                #{t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="opacity-40 hover:opacity-100 transition"
                  title={`Remove "${t}"`}
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))}
            {tags.length === 0 && (
              <span className="text-xs text-muted-foreground">No tags yet.</span>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  appendTag();
                }
              }}
              placeholder="Add a tag…"
              className="flex-1 rounded-md border border-border/70 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/50 transition"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!newTag.trim()}
              onClick={appendTag}
              className="gap-1"
            >
              <Plus className="size-3.5" />
              Add
            </Button>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground/80">
            Tags stay in sync with your library — filter the catalog with them on the dashboard.
          </p>

          {/* activity */}
          <div className="mt-6 pt-4 border-t border-border/70">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Activity
            </h3>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Last saved</span>
                <span className="text-foreground font-medium">
                  {savedAt != null ? unixToDate(savedAt).toLocaleString() : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Watched</span>
                <span className="font-mono-tight text-foreground font-medium">
                  {durationFor(watchedSeconds)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Completed</span>
                <span className={cn("font-medium", completed ? "text-primary" : "text-foreground")}>
                  {completed ? "Yes" : watchedSeconds >= dur && dur > 0 ? "Yes" : "No"}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleCompleted}
                className="mt-3 w-full"
              >
                {completed ? "Mark as not completed" : "Mark as complete"}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
