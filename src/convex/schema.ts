import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
    }).index("email", ["email"]),

    // A course = one top-level folder on the user's machine. Folders without
    // videos are never imported (they're ignored by the folder picker).
    courses: defineTable({
      userId: v.id("users"),
      name: v.string(),
      folderName: v.string(),
      videoCount: v.number(),
      totalSeconds: v.number(),
      createdAt: v.number(),
      lastOpenedAt: v.optional(v.number()),
    })
      .index("by_user", ["userId"])
      .index("by_user_and_name", ["userId", "name"]),

    // One video file. The `handle` is a FileSystemFileHandle persisted in
    // IndexedDB on the client — the browser re-grants permission each session.
    videos: defineTable({
      userId: v.id("users"),
      courseId: v.id("courses"),
      name: v.string(), // filename without extension
      path: v.string(), // path relative to the course folder, "/"-separated
      durationSeconds: v.number(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_course", ["courseId"]),

    // Per-user watch state for one video.
    videoStates: defineTable({
      userId: v.id("users"),
      videoId: v.id("videos"),
      positionSeconds: v.number(),
      durationSeconds: v.number(),
      completed: v.boolean(),
      bookmarked: v.boolean(),
      tags: v.array(v.string()),
      updatedAt: v.number(),
    })
      .index("by_user_and_video", ["userId", "videoId"])
      .index("by_user_bookmarked", ["userId", "bookmarked"]),

    // Notes attached to a video, with an optional timestamp.
    notes: defineTable({
      userId: v.id("users"),
      videoId: v.id("videos"),
      text: v.string(),
      timestampSeconds: v.optional(v.number()),
      createdAt: v.number(),
    }).index("by_video", ["videoId"]),

    // One row per day the user watches something — the daily streak source.
    activity: defineTable({
      userId: v.id("users"),
      date: v.string(), // local YYYY-MM-DD
      secondsWatched: v.number(),
    }).index("by_user_and_date", ["userId", "date"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
