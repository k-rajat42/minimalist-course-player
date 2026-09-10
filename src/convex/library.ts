import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

const dayKey = (ts: number) => {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

// ------------------------------------------------------------------ queries

/** Courses for the signed-in user, plus their videos. */
export const listCourses = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const courses = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const withVideos = await Promise.all(
      courses.map(async (course) => {
        const videos = await ctx.db
          .query("videos")
          .withIndex("by_course", (q) => q.eq("courseId", course._id))
          .collect();
        return { ...course, videos };
      }),
    );
    return withVideos;
  },
});

/** All videos + per-video watch state, for the catalog view. */
export const listVideos = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const courses = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const courseById = new Map(courses.map((c) => [c._id, c.name]));
    return Promise.all(
      videos.map(async (video) => {
        const state = await ctx.db
          .query("videoStates")
          .withIndex("by_user_and_video", (q) =>
            q.eq("userId", userId).eq("videoId", video._id),
          )
          .unique();
        return {
          ...video,
          courseName: courseById.get(video.courseId) ?? "Unknown course",
          state: state ?? null,
        };
      }),
    );
  },
});

/** Watch state for a single video. */
export const getVideoState = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, { videoId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("videoStates")
      .withIndex("by_user_and_video", (q) =>
        q.eq("userId", userId).eq("videoId", videoId),
      )
      .unique();
  },
});

/** One video (plus its course name) for the player page. */
export const getVideo = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, { videoId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const video: Doc<"videos"> | null = await ctx.db.get(videoId);
    if (!video || video.userId !== userId) return null;
    const course = await ctx.db.get(video.courseId);
    return { ...video, courseName: course?.name ?? "Unknown course" };
  },
});

/** Notes for one video, newest first. */
export const listNotes = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, { videoId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const all = await ctx.db
      .query("notes")
      .withIndex("by_video", (q) => q.eq("videoId", videoId))
      .collect();
    return all
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** All activity rows — used to draw the streak + heatmap on the dashboard. */
export const listActivity = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("activity")
      .withIndex("by_user_and_date", (q) => q.eq("userId", userId))
      .collect();
  },
});

// ---------------------------------------------------------------- mutations

/**
 * Replace the whole library with a freshly scanned folder tree.
 *
 * Watch states, bookmarks, tags and notes survive the re-import by matching
 * "<courseFolder>/<relative path>" keys, so progress carries over when the
 * same files are re-scanned later. The activity table (daily streak) is
 * always kept.
 */
export const importLibrary = mutation({
  args: {
    courses: v.array(
      v.object({
        name: v.string(),
        folderName: v.string(),
        videos: v.array(
          v.object({
            name: v.string(),
            path: v.string(),
            durationSeconds: v.number(),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, { courses }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const now = Date.now();

    // ---- snapshot watch state + notes, keyed by "<folderName>/<path>" ----
    const oldCourses = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const courseFolderById = new Map<Id<"courses">, string>();
    for (const c of oldCourses) courseFolderById.set(c._id, c.folderName);

    const oldVideos = await ctx.db
      .query("videos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const oldStateByPath = new Map<string, Doc<"videoStates">>();
    const oldNotesByPath = new Map<string, Doc<"notes">[]>();
    for (const v of oldVideos) {
      const folder = courseFolderById.get(v.courseId);
      if (!folder) continue;
      const key = `${folder}/${v.path}`;
      const state = await ctx.db
        .query("videoStates")
        .withIndex("by_user_and_video", (q) =>
          q.eq("userId", userId).eq("videoId", v._id),
        )
        .unique();
      if (state) oldStateByPath.set(key, state);
      const notes = await ctx.db
        .query("notes")
        .withIndex("by_video", (q) => q.eq("videoId", v._id))
        .collect();
      const mine = notes.filter((n) => n.userId === userId);
      if (mine.length > 0) oldNotesByPath.set(key, mine);
    }

    // ---- wipe previous library rows (the activity/streak table is kept) ----
    for (const table of ["videoStates", "notes", "videos", "courses"] as const) {
      const rows = await ctx.db
        .query(table)
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();
      await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
    }

    // ---- insert the new library, carrying over state by path ----
    let totalSeconds = 0;
    let carriedState = 0;
    let carriedNotes = 0;

    for (const course of courses) {
      const total = course.videos.reduce((sum, v) => sum + v.durationSeconds, 0);
      totalSeconds += total;
      const courseId = await ctx.db.insert("courses", {
        userId,
        name: course.name,
        folderName: course.folderName,
        videoCount: course.videos.length,
        totalSeconds: total,
        createdAt: now,
      });
      for (const video of course.videos) {
        const videoId = await ctx.db.insert("videos", {
          userId,
          courseId,
          name: video.name,
          path: video.path,
          durationSeconds: video.durationSeconds,
          createdAt: now,
        });

        const key = `${course.folderName}/${video.path}`;
        const old = oldStateByPath.get(key);
        if (old) {
          await ctx.db.insert("videoStates", {
            userId,
            videoId,
            positionSeconds: old.positionSeconds,
            durationSeconds: video.durationSeconds || old.durationSeconds,
            completed: old.completed,
            bookmarked: old.bookmarked,
            tags: old.tags,
            updatedAt: now,
          });
          carriedState += 1;
        }
        for (const n of oldNotesByPath.get(key) ?? []) {
          await ctx.db.insert("notes", {
            userId,
            videoId,
            text: n.text,
            timestampSeconds: n.timestampSeconds,
            createdAt: n.createdAt,
          });
          carriedNotes += 1;
        }
      }
    }

    return { courseCount: courses.length, totalSeconds, carriedState, carriedNotes };
  },
});

/** Create or update per-video watch state; bumps the daily activity row. */
export const saveProgress = mutation({
  args: {
    videoId: v.id("videos"),
    positionSeconds: v.number(),
    durationSeconds: v.number(),
    secondsWatchedDelta: v.optional(v.number()),
  },
  handler: async (ctx, { videoId, positionSeconds, durationSeconds, secondsWatchedDelta }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const existing = await ctx.db
      .query("videoStates")
      .withIndex("by_user_and_video", (q) =>
        q.eq("userId", userId).eq("videoId", videoId),
      )
      .unique();

    const completed = durationSeconds > 0 && positionSeconds >= durationSeconds - 1.5;
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        positionSeconds,
        durationSeconds,
        completed,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("videoStates", {
        userId,
        videoId,
        positionSeconds,
        durationSeconds,
        completed,
        bookmarked: false,
        tags: [],
        updatedAt: now,
      });
    }

    const delta = secondsWatchedDelta ?? 0;
    if (delta > 0) {
      const date = dayKey(now);
      const row = await ctx.db
        .query("activity")
        .withIndex("by_user_and_date", (q) =>
          q.eq("userId", userId).eq("date", date),
        )
        .unique();
      if (row) {
        await ctx.db.patch(row._id, { secondsWatched: row.secondsWatched + delta });
      } else {
        await ctx.db.insert("activity", { userId, date, secondsWatched: delta });
      }
    }
  },
});

/** Toggle the bookmark flag. */
export const toggleBookmark = mutation({
  args: { videoId: v.id("videos") },
  handler: async (ctx, { videoId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const existing = await ctx.db
      .query("videoStates")
      .withIndex("by_user_and_video", (q) =>
        q.eq("userId", userId).eq("videoId", videoId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        bookmarked: !existing.bookmarked,
        updatedAt: Date.now(),
      });
      return !existing.bookmarked;
    }
    await ctx.db.insert("videoStates", {
      userId,
      videoId,
      positionSeconds: 0,
      durationSeconds: 0,
      completed: false,
      bookmarked: true,
      tags: [],
      updatedAt: Date.now(),
    });
    return true;
  },
});

/** Set the tag list for a video (replaces existing tags). */
export const setTags = mutation({
  args: { videoId: v.id("videos"), tags: v.array(v.string()) },
  handler: async (ctx, { videoId, tags }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const cleaned = tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12);
    const existing = await ctx.db
      .query("videoStates")
      .withIndex("by_user_and_video", (q) =>
        q.eq("userId", userId).eq("videoId", videoId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { tags: cleaned, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("videoStates", {
        userId,
        videoId,
        positionSeconds: 0,
        durationSeconds: 0,
        completed: false,
        bookmarked: false,
        tags: cleaned,
        updatedAt: Date.now(),
      });
    }
    return cleaned;
  },
});

/** Mark a video watched / unwatched manually. */
export const setCompleted = mutation({
  args: { videoId: v.id("videos"), completed: v.boolean() },
  handler: async (ctx, { videoId, completed }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const existing = await ctx.db
      .query("videoStates")
      .withIndex("by_user_and_video", (q) =>
        q.eq("userId", userId).eq("videoId", videoId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { completed, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("videoStates", {
        userId,
        videoId,
        positionSeconds: 0,
        durationSeconds: 0,
        completed,
        bookmarked: false,
        tags: [],
        updatedAt: Date.now(),
      });
    }
  },
});

/** Add a note (optionally pinned to a timestamp in the video). */
export const addNote = mutation({
  args: {
    videoId: v.id("videos"),
    text: v.string(),
    timestampSeconds: v.optional(v.number()),
  },
  handler: async (ctx, { videoId, text, timestampSeconds }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Note is empty");
    await ctx.db.insert("notes", {
      userId,
      videoId,
      text: trimmed.slice(0, 2000),
      timestampSeconds,
      createdAt: Date.now(),
    });
  },
});

export const deleteNote = mutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, { noteId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const note = await ctx.db.get(noteId);
    if (note && note.userId === userId) await ctx.db.delete(noteId);
  },
});
