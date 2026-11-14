// Converts every PDF in ./branding into sharp, fast WebP images + a manifest.
// Runs automatically in GitHub Actions (.github/workflows/branding.yml) whenever a PDF is
// added, replaced or deleted. Needs: pdftoppm (poppler-utils) and the `sharp` npm package.
//
//   branding/قهوة اليوم | هوية بصرية.pdf   →   public/branding/<id>-<hash>/p01-600.webp …
//                                              public/branding/manifest.json
//
// Each page is rendered with its long side at 2400px (crisp on retina screens), then saved as:
//   page 1 (cover): 600w, 1200w, 2400w   — the grid only loads 600/1200
//   other pages:    1200w, 2400w         — loaded only when someone opens the project
// Unchanged PDFs are skipped (content hash), so re-runs are fast.

import { readdir, readFile, writeFile, mkdir, rm, mkdtemp, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const SRC = "branding";
const OUT = "public/branding";
const LONG_SIDE = 2400;
const Q = 88;

const sha = (x) => createHash("sha1").update(x).digest("hex");

function parseTitle(name) {
  let t = name.replace(/\.pdf$/i, "").trim();
  const featured = /^[★*]/.test(t);
  t = t.replace(/^[★*]\s*/, "");
  if (!/[؀-ۿ]/.test(t) && !/\s/.test(t)) t = t.replace(/[-_]+/g, " ").trim();
  // "client | title"  or (Windows doesn't allow "|" in file names) "client - title"
  const m = t.match(/^(.+?)\s*(?:\||\s-\s|\s–\s)\s*(.+)$/);
  return m ? { client: m[1].trim(), title: m[2].trim(), featured } : { client: "", title: t, featured };
}

function gitDate(file) {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cI", "--", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

await mkdir(OUT, { recursive: true });
const prev = existsSync(join(OUT, "manifest.json"))
  ? JSON.parse(await readFile(join(OUT, "manifest.json"), "utf8"))
  : { items: [] };
const prevById = new Map(prev.items.map((i) => [i.id, i]));

const pdfs = existsSync(SRC) ? (await readdir(SRC)).filter((f) => /\.pdf$/i.test(f)).sort() : [];
const items = [];

for (const file of pdfs) {
  const path = join(SRC, file);
  const buf = await readFile(path);
  const id = sha(file.normalize("NFC")).slice(0, 8); // stable per filename → stable share links
  const hash = sha(buf).slice(0, 8); // changes when the PDF content changes → cache-busting folder
  const dir = `${id}-${hash}`;
  const meta = parseTitle(file);
  const date = gitDate(path) || (await stat(path)).mtime.toISOString();

  const old = prevById.get(id);
  if (old && old.dir === dir && existsSync(join(OUT, dir))) {
    items.push({ ...old, ...meta, date });
    console.log(`= ${file} (unchanged)`);
    continue;
  }

  const tmp = await mkdtemp(join(tmpdir(), "pdf-"));
  execFileSync("pdftoppm", ["-png", "-scale-to", String(LONG_SIDE), path, join(tmp, "p")]);
  const pngs = (await readdir(tmp)).filter((f) => f.endsWith(".png")).sort();
  await mkdir(join(OUT, dir), { recursive: true });

  const pages = [];
  for (let i = 0; i < pngs.length; i++) {
    const src = sharp(join(tmp, pngs[i])).flatten({ background: "#ffffff" });
    const { width, height } = await src.metadata();
    const n = String(i + 1).padStart(2, "0");
    const widths = i === 0 ? [600, 1200, 2400] : [1200, 2400];
    for (const w of widths) {
      await src
        .clone()
        .resize({ width: Math.min(w, width), withoutEnlargement: true })
        .webp({ quality: Q, effort: 5, smartSubsample: true })
        .toFile(join(OUT, dir, `p${n}-${w}.webp`));
    }
    pages.push([width, height]);
  }
  await rm(tmp, { recursive: true, force: true });
  if (old && old.dir !== dir) await rm(join(OUT, old.dir), { recursive: true, force: true });

  items.push({ id, dir, ...meta, date, pages });
  console.log(`✓ ${file} → ${pages.length} page(s)`);
}

// Remove folders of PDFs that were deleted
const keep = new Set(items.map((i) => i.dir));
for (const d of await readdir(OUT)) {
  if (d !== "manifest.json" && !keep.has(d)) {
    await rm(join(OUT, d), { recursive: true, force: true });
    console.log(`✗ removed ${d}`);
  }
}

await writeFile(join(OUT, "manifest.json"), JSON.stringify({ items }, null, 1));
console.log(`Done: ${items.length} project(s)`);
