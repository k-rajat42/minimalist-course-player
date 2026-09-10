import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import {
  scanCourseFolders,
  storeVideoHandle,
  formatTotal,
  type ScannedCourse,
} from "@/lib/video";
import { useMutation } from "convex/react";
import { FolderOpen, Loader2, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type Phase = "idle" | "scanning" | "importing";

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (result: { courses: number; videos: number }) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ file: string; index: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const importLibrary = useMutation(api.library.importLibrary);

  const reset = () => {
    setPhase("idle");
    setProgress(null);
    setError(null);
    runningRef.current = false;
  };

  const handleScan = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setError(null);
    setPhase("scanning");

    let scanned: ScannedCourse[];
    try {
      scanned = await scanCourseFolders((p) => {
        setProgress({ file: p.file, index: p.index, total: p.total });
      });
    } catch (err) {
      setPhase("idle");
      runningRef.current = false;
      const message =
        err instanceof Error ? err.message : "Could not open the folder. Please try again.";
      setError(message);
      return;
    }

    if (scanned.length === 0) {
      setPhase("idle");
      runningRef.current = false;
      setError(
        "No .mp4 files were found in that folder (or its subfolders). Pick the folder that contains your course videos.",
      );
      return;
    }

    setPhase("importing");
    try {
      // Keep file handles locally, keyed "<course folder>/<relative path>".
      for (const course of scanned) {
        for (const video of course.videos) {
          await storeVideoHandle(`${course.folderName}/${video.path}`, video.handle);
        }
      }

      const totalVideos = scanned.reduce((sum, c) => sum + c.videos.length, 0);
      await importLibrary({
        courses: scanned.map((course) => ({
          name: course.name,
          folderName: course.folderName,
          videos: course.videos.map((v) => ({
            name: v.name,
            path: v.path,
            durationSeconds: v.durationSeconds,
          })),
        })),
      });

      toast.success("Library connected", {
        description: `${scanned.length} course${scanned.length === 1 ? "" : "s"} · ${totalVideos} lecture${
          totalVideos === 1 ? "" : "s"
        } · ${formatTotal(scanned.reduce((s, c) => s + c.totalSeconds, 0))} of content`,
      });
      reset();
      onOpenChange(false);
      onImported?.({ courses: scanned.length, videos: totalVideos });
    } catch (err) {
      setPhase("idle");
      runningRef.current = false;
      setError(
        err instanceof Error ? err.message : "Import failed. Please check your connection.",
      );
    }
  };

  const busy = phase === "scanning" || phase === "importing";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="tracking-tight font-bold">Connect your course folder</DialogTitle>
          <DialogDescription>
            Choose the folder that holds your course videos. Every subfolder becomes a course,
            and the lectures inside are listed in order. Files stay on your machine — only names
            and durations are remembered.
          </DialogDescription>
        </DialogHeader>

        {busy ? (
          <div className="flex flex-col gap-3 py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="size-5 animate-spin text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {phase === "scanning" ? "Reading durations…" : "Saving your library…"}
                </p>
                {progress && phase === "scanning" && (
                  <p className="font-mono-tight truncate text-xs text-muted-foreground">
                    {progress.index}/{progress.total} · {progress.file}
                  </p>
                )}
              </div>
            </div>
            {progress && phase === "scanning" && (
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(progress.index / progress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <Button onClick={handleScan} className="w-full gap-2">
              <FolderOpen className="size-4" />
              Pick your course folder
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Re-running this later re-syncs the catalog. Your progress, bookmarks, tags and
              notes are kept.
            </p>
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
