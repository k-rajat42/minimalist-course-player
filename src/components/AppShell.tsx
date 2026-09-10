import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Flame, LogOut, Play } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";

/** Wordmark used across the app. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <span className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
        <Play className="size-3.5 fill-current" />
      </span>
      <span className="font-mono-tight text-sm font-semibold tracking-tight">
        gen-ai<span className="text-primary">/course</span>
      </span>
    </Link>
  );
}

/**
 * Top bar for the authenticated pages: wordmark, streak chip and sign out.
 * `streakCurrent` comes from the dashboard's activity query.
 */
export function AppShell({
  children,
  streakCurrent,
  watchedToday,
}: {
  children: ReactNode;
  streakCurrent?: number;
  watchedToday?: boolean;
}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="bg-grid min-h-screen">
      <header className="glow-top sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-2">
            {streakCurrent !== undefined && (
              <div
                className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5"
                title={
                  watchedToday
                    ? "Streak active — you've watched today."
                    : "Watch something today to keep the streak alive."
                }
              >
                <Flame
                  className={`size-3.5 ${
                    watchedToday ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <span className="font-mono-tight text-xs font-semibold">
                  {streakCurrent} day{streakCurrent === 1 ? "" : "s"}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
    </div>
  );
}
