// Build a distributable zip of the project using only Node built-ins
// (the runtime has no `zip`/`tar` binaries). Result: public/genai-course-tracker.zip
//
// Usage: node scripts/export-zip.mjs

import { createWriteStream } from "node:fs";
import { readFile, readdir, mkdir, stat, rm } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public");
const OUT_FILE = path.join(OUT_DIR, "genai-course-tracker.zip");

/** Directories never included, relative to the project root. */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".vercel",
  ".turbo",
  ".cache",
  "coverage",
  ".nodepod",
]);

/** Files never included (secrets / generated artifacts). */
const SKIP_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "public/genai-course-tracker.zip",
]);

// ---------------------------------------------------------------------------
// Collect files
// ---------------------------------------------------------------------------

async function listFiles(dir, base = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await listFiles(path.join(dir, entry.name), rel)));
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(rel)) continue;
      files.push({ rel, abs: path.join(dir, entry.name) });
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// CRC-32 (IEEE 802.3), table-driven — zlib.crc32 needs Node >= 22.2
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Minimal zip writer (stored + deflate, no encryption, no zip64)
// ---------------------------------------------------------------------------

function dosDateTime(d) {
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function u16(v) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v >>> 0, 0);
  return b;
}
function u32(v) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0, 0);
  return b;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

function buildZip(entries) {
  const { time, date } = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.rel, "utf8");
    const raw = entry.data;
    const crc = crc32(raw);

    const deflated = deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const payload = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0; // 8 = deflate, 0 = stored

    const local = Buffer.concat([
      u32(LOCAL_SIG),
      u16(20), // version needed
      u16(0), // flags
      u16(method),
      u16(time),
      u16(date),
      u32(crc),
      u32(payload.length), // compressed size
      u32(raw.length), // uncompressed size
      u16(nameBuf.length),
      u16(0), // extra len
      nameBuf,
      payload,
    ]);
    localParts.push(local);

    const central = Buffer.concat([
      u32(CENTRAL_SIG),
      u16(20), // version made by
      u16(20), // version needed
      u16(0), // flags
      u16(method),
      u16(time),
      u16(date),
      u32(crc),
      u32(payload.length),
      u32(raw.length),
      u16(nameBuf.length),
      u16(0), // extra
      u16(0), // comment
      u16(0), // disk number
      u16(0), // internal attrs
      u32(0), // external attrs
      u32(offset),
      nameBuf,
    ]);
    centralParts.push(central);

    offset += local.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.concat([
    u32(EOCD_SIG),
    u16(0), // disk
    u16(0), // cd disk
    u16(entries.length),
    u16(entries.length),
    u32(centralBuf.length),
    u32(offset),
    u16(0), // comment len
  ]);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const files = await listFiles(ROOT);
  files.sort((a, b) => a.rel.localeCompare(b.rel));

  const entries = [];
  for (const file of files) {
    const [data, info] = await Promise.all([readFile(file.abs), stat(file.abs)]);
    if (info.size > 512 * 1024 * 1024) {
      console.warn(`Skipping ${file.rel}: larger than 512 MB`);
      continue;
    }
    entries.push({ rel: file.rel, data });
  }

  // Ensure the zip itself can be re-exported without including a stale copy.
  await mkdir(OUT_DIR, { recursive: true });
  await rm(OUT_FILE, { force: true });

  const zip = buildZip(entries);
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(OUT_FILE);
    stream.on("error", reject);
    stream.on("finish", resolve);
    stream.end(zip);
  });

  const kb = (zip.length / 1024).toFixed(1);
  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)} (${kb} KB, ${entries.length} files)`);
  console.log(
    "Download it by opening /genai-course-tracker.zip on the dev server URL.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
