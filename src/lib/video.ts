/** @ts-nocheck */ // browser File System Access types are ambient-only here
/** Client-side course library scanner.

 * Browser port of the original Python/Flask scanner: it walks a folder the
 * user picks, finds every .mp4 (recursively), sorts everything naturally
 * ("Lecture 2" before "Lecture 10") and reads each file's `mvhd` box for the
 * duration — no ffmpeg, no uploads; only catalog metadata leaves the machine.
 */

export interface ScannedVideo {
  name: string; // filename without extension
  path: string; // course-relative path, "/"-separated
  durationSeconds: number;
  handle: FileSystemFileHandle;
}

export interface ScannedCourse {
  name: string; // top-level folder name = course name
  folderName: string;
  videos: ScannedVideo[];
  totalSeconds: number;
}

export function naturalSortKey(s: string): (string | number)[] {
  return s
    .split(/(\d+)/)
    .map((chunk) =>
      chunk !== "" && /^\d+$/.test(chunk) ? Number(chunk) : chunk.toLowerCase(),
    );
}

export function compareKeys(a: (string | number)[], b: (string | number)[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Compact "1d 4h" style total for headers. */
export function formatTotal(seconds: number): string {
  if (seconds <= 0) return "0m";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.round((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 && d === 0) parts.push(`${m}m`);
  return parts.length > 0 ? parts.join(" ") : `${d}d`;
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// ---------------------------------------------------------------------------
// MP4 box walking (port of _iter_boxes + get_mp4_duration)
// ---------------------------------------------------------------------------

interface Box {
  type: string;
  contentStart: number;
  contentEnd: number;
}

async function* iterBoxes(
  file: File,
  start: number,
  end: number,
): AsyncGenerator<Box, void, unknown> {
  let pos = start;
  while (pos < end - 8) {
    const buf = await file.slice(pos, pos + 8).arrayBuffer();
    if (buf.byteLength < 8) break;
    const view = new DataView(buf);

    let size = view.getUint32(0);
    const boxType = String.fromCharCode(
      view.getUint8(4),
      view.getUint8(5),
      view.getUint8(6),
      view.getUint8(7),
    );
    let headerLen = 8;

    if (size === 1) {
      const large = await file.slice(pos + 8, pos + 16).arrayBuffer();
      if (large.byteLength < 8) break;
      size = Number(new DataView(large).getBigUint64(0));
      headerLen = 16;
    } else if (size === 0) {
      size = end - pos;
    }

    if (size < headerLen) break;
    const boxEnd = pos + size;
    yield { type: boxType, contentStart: pos + headerLen, contentEnd: boxEnd };
    pos = boxEnd;
  }
}

/** Read the `mvhd` box of an MP4 to get duration in seconds. */
export async function getMp4Duration(file: File): Promise<number | null> {
  try {
    const fileSize = file.size;
    for await (const box of iterBoxes(file, 0, fileSize)) {
      if (box.type !== "moov") continue;
      for await (const sub of iterBoxes(file, box.contentStart, box.contentEnd)) {
        if (sub.type !== "mvhd") continue;

        const buf = await file.slice(sub.contentStart, sub.contentStart + 32).arrayBuffer();
        if (buf.byteLength < 32) return null;
        const view = new DataView(buf);

        const version = view.getUint8(0);
        // bytes 1-3 are flags, then creation/modification times.

        if (version === 1) {
          // skip 8+8 byte times, then 4-byte timescale, 8-byte duration
          const timescale = view.getUint32(20);
          const duration = Number(view.getBigUint64(24));
          return timescale > 0 ? duration / timescale : null;
        }

        // skip 4+4 byte times, then 4-byte timescale, 4-byte duration
        const timescale = view.getUint32(12);
        const duration = view.getUint32(16);
        return timescale > 0 ? duration / timescale : null;
      }
      // moov found but no mvhd inside — stop looking.
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Folder scanning
// ---------------------------------------------------------------------------

type FsEntry = { kind: "file" | "directory"; name: string; handle: any };

async function* iterateDir(dir: FileSystemDirectoryHandle): AsyncGenerator<FsEntry> {
  const iterable = dir as unknown as AsyncIterable<[string, any]>;
  for await (const [name, handle] of iterable) {
    const kind: "file" | "directory" = handle.kind === "directory" ? "directory" : "file";
    yield { kind, name, handle };
  }
}

/** Recursively collect .mp4 files under a directory handle. */
async function collectVideos(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: { path: string; handle: FileSystemFileHandle }[],
): Promise<void> {
  const dirs: { path: string; handle: FileSystemDirectoryHandle }[] = [];

  for await (const entry of iterateDir(dir)) {
    if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".mp4")) {
      const p = prefix ? `${prefix}/${entry.name}` : entry.name;
      out.push({ path: p, handle: entry.handle as FileSystemFileHandle });
    } else if (entry.kind === "directory" && !entry.name.startsWith(".")) {
      const p = prefix ? `${prefix}/${entry.name}` : entry.name;
      dirs.push({ path: p, handle: entry.handle as FileSystemDirectoryHandle });
    }
  }

  dirs.sort((a, b) => compareKeys(naturalSortKey(a.path), naturalSortKey(b.path)));
  for (const d of dirs) {
    await collectVideos(d.handle, d.path, out);
  }
}

export interface ScanProgress {
  folder: string;
  file: string;
  index: number;
  total: number;
}

/**
 * Open the folder picker and scan every non-hidden subfolder that contains
 * .mp4 files into "courses". Durations are read during the scan so the
 * catalog can show totals immediately.
 */
export async function scanCourseFolders(
  onProgress?: (p: ScanProgress) => void,
): Promise<ScannedCourse[]> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (opts: { mode: string }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (!picker) {
    throw new Error(
      "Your browser can't open local folders. Please use Chrome, Edge or another Chromium browser.",
    );
  }

  const root = await picker.call(window, { mode: "read" });
  const courses: ScannedCourse[] = [];

  const subfolders: FileSystemDirectoryHandle[] = [];
  const rootFiles: FileSystemFileHandle[] = [];

  for await (const entry of iterateDir(root)) {
    if (entry.kind === "directory") {
      if (!entry.name.startsWith(".")) {
        subfolders.push(entry.handle as FileSystemDirectoryHandle);
      }
    } else if (entry.name.toLowerCase().endsWith(".mp4")) {
      rootFiles.push(entry.handle as FileSystemFileHandle);
    }
  }

  subfolders.sort((a, b) => compareKeys(naturalSortKey(a.name), naturalSortKey(b.name)));

  const buildCourse = async (
    name: string,
    folderName: string,
    dir: FileSystemDirectoryHandle | null,
    looseFiles: FileSystemFileHandle[],
  ): Promise<ScannedCourse | null> => {
    const found: { path: string; handle: FileSystemFileHandle }[] = [];
    if (dir !== null) {
      await collectVideos(dir, "", found);
    }
    for (const h of looseFiles) {
      found.push({ path: h.name, handle: h });
    }
    if (found.length === 0) return null;

    found.sort((a, b) => compareKeys(naturalSortKey(a.path), naturalSortKey(b.path)));

    const videos: ScannedVideo[] = [];
    for (let i = 0; i < found.length; i++) {
      const item = found[i];
      onProgress?.({
        folder: name,
        file: item.path,
        index: i + 1,
        total: found.length,
      });
      let durationSeconds = 0;
      try {
        const file = await item.handle.getFile();
        durationSeconds = (await getMp4Duration(file)) ?? 0;
      } catch {
        // Permission or read error — keep the video with unknown duration.
        durationSeconds = 0;
      }
      videos.push({
        name: item.handle.name.replace(/\.mp4$/i, ""),
        path: item.path,
        durationSeconds,
        handle: item.handle,
      });
    }

    let totalSeconds = 0;
    for (const v of videos) totalSeconds += v.durationSeconds;

    return { name, folderName, videos, totalSeconds };
  };

  for (const folder of subfolders) {
    const course = await buildCourse(folder.name, folder.name, folder, []);
    if (course) courses.push(course);
  }

  // MP4s sitting directly in the picked root become one course named after it.
  if (rootFiles.length > 0) {
    const course = await buildCourse(root.name, root.name, null, rootFiles);
    if (course) courses.push(course);
  }

  return courses;
}

// ---------------------------------------------------------------------------
// Handle persistence (IndexedDB) so video handles survive reloads
// ---------------------------------------------------------------------------

const DB_NAME = "genai-course-tracker";
const STORE = "video-handles";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<FileSystemFileHandle | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: FileSystemFileHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function storeVideoHandle(
  videoId: string,
  handle: FileSystemFileHandle,
): Promise<void> {
  try {
    await idbSet(videoId, handle);
  } catch {
    // Storage full or unavailable — playback still works this session.
  }
}

type PermissionedHandle = FileSystemFileHandle & {
  queryPermission(d: { mode: string }): Promise<PermissionState>;
  requestPermission(d: { mode: string }): Promise<PermissionState>;
};

/** Reattach a stored handle and make sure the browser re-grants read access. */
export async function loadVideoHandle(videoId: string): Promise<File | null> {
  try {
    const handle = (await idbGet(videoId)) as PermissionedHandle | undefined;
    if (!handle) return null;

    let perm = await handle.queryPermission({ mode: "read" });
    if (perm !== "granted") {
      perm = await handle.requestPermission({ mode: "read" });
    }
    if (perm !== "granted") return null;
    return await handle.getFile();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Watch-time helpers (local dates, matching the server dayKey)
// ---------------------------------------------------------------------------

export function localDayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
