// Designly video portfolio — build script (zero dependencies, Node 18+)
// Pulls every finished video from Bunny Stream, maps Bunny Collections to industries,
// and writes one fully static, pre-rendered HTML page to ./dist.
//
// Env vars (set them in Cloudflare Pages → Settings → Environment variables):
//   BUNNY_LIBRARY_ID   e.g. 123456
//   BUNNY_API_KEY      Stream library API key (Stream → API)
//   BUNNY_CDN_HOST     e.g. vz-abc123-456.b-cdn.net  (Stream → API → CDN hostname)
// Without them the build runs in DEMO mode with sample-videos.json.

import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";

const ROOT = new URL(".", import.meta.url);
const cfg = JSON.parse(await readFile(new URL("site.config.json", ROOT), "utf8"));
const { BUNNY_LIBRARY_ID: LIB, BUNNY_API_KEY: KEY, BUNNY_CDN_HOST: CDN } = process.env;
const DEMO = !(LIB && KEY && CDN);

// ---------- data ----------
async function bunny(path) {
  const res = await fetch(`https://video.bunnycdn.com/library/${LIB}${path}`, {
    headers: { AccessKey: KEY, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Bunny API ${res.status} on ${path}: ${await res.text()}`);
  return res.json();
}

async function fetchAll(path) {
  const out = [];
  for (let page = 1; ; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await bunny(`${path}${sep}page=${page}&itemsPerPage=100`);
    out.push(...data.items);
    if (out.length >= data.totalItems || data.items.length === 0) break;
  }
  return out;
}

// Title convention in Bunny:  "★ اسم العميل | عنوان الفيديو"
//   ★ at the start  → featured (shown first)
//   "client | title" → client shown as a small label
function parseTitle(raw) {
  let t = (raw || "").replace(/\.(mp4|mov|m4v|webm)$/i, "").trim();
  const featured = /^[★*]/.test(t);
  t = t.replace(/^[★*]\s*/, "");
  const [a, b] = t.split("|").map((s) => s.trim());
  return b ? { client: a, title: b, featured } : { client: "", title: a, featured };
}

const industryByCollection = new Map(cfg.industries.map((i) => [i.collection.toLowerCase(), i]));
const slugify = (s) => s.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/(^-|-$)/g, "");

async function loadVideos() {
  if (DEMO) {
    console.log("⚠  DEMO mode (no Bunny env vars) — using generated sample videos");
    const inds = cfg.industries.slice(0, 7);
    const titles = ["إعلان افتتاح الفرع الجديد", "ريل إطلاق المنتج", "فيديو تعريفي بالخدمات", "حملة رمضان", "جولة داخل المشروع", "موشن شرح التطبيق"];
    return Array.from({ length: 24 }, (_, i) => ({
      id: `demo-${i}`, title: titles[i % titles.length], client: "", featured: i < 3,
      industry: inds[i % inds.length].slug, industryLabel: inds[i % inds.length].label,
      vertical: i % 3 !== 1, duration: 15 + ((i * 37) % 110), date: new Date(2026, 10, 1 - i * 9).toISOString(),
      thumb: "", preview: "",
    }));
  }
  const [collections, items] = await Promise.all([
    fetchAll("/collections?orderBy=date"),
    fetchAll("/videos?orderBy=date"),
  ]);
  const colName = new Map(collections.map((c) => [c.guid, c.name]));
  return items
    .filter((v) => v.status === 4 && v.collectionId) // 4 = finished encoding; must be in a collection
    .map((v) => {
      const name = colName.get(v.collectionId) || "";
      const ind = industryByCollection.get(name.toLowerCase());
      const { client, title, featured } = parseTitle(v.title);
      return {
        id: v.guid,
        title,
        client,
        featured,
        industry: ind ? ind.slug : slugify(name),
        industryLabel: ind ? ind.label : name,
        vertical: v.height > v.width,
        duration: Math.round(v.length || 0),
        date: v.dateUploaded,
        thumb: `https://${CDN}/${v.guid}/${v.thumbnailFileName || "thumbnail.jpg"}`,
        preview: `https://${CDN}/${v.guid}/preview.webp`,
      };
    });
}

// ---------- render ----------
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

function card(v, i) {
  const eager = i < 4;
  const media = v.thumb
    ? `<img src="${esc(v.thumb)}" alt="" width="${v.vertical ? 540 : 960}" height="${v.vertical ? 960 : 540}" ${
        eager ? `fetchpriority="${i === 0 ? "high" : "auto"}"` : `loading="lazy"`
      } decoding="async">`
    : `<span class="ph" style="--h:${(i * 47) % 360}"></span>`;
  return `<li class="card${v.vertical ? " v" : ""}" data-i="${v.industry}" data-f="${v.vertical ? "v" : "h"}">
<button type="button" class="tile" data-id="${esc(v.id)}" aria-label="تشغيل: ${esc(v.title)}">
<span class="media">${media}<span class="play" aria-hidden="true"></span>${v.duration ? `<span class="dur">${fmt(v.duration)}</span>` : ""}</span>
<span class="meta"><span class="tag">${esc(v.industryLabel)}${v.client ? ` · ${esc(v.client)}` : ""}</span><span class="ttl">${esc(v.title)}</span></span>
</button></li>`;
}

const videos = (await loadVideos()).sort(
  (a, b) => (b.featured - a.featured) || String(b.date).localeCompare(String(a.date))
);

// Only show industries that actually have videos, in config order, then any extras.
const counts = videos.reduce((m, v) => m.set(v.industry, (m.get(v.industry) || 0) + 1), new Map());
const known = cfg.industries.filter((i) => counts.has(i.slug));
const extra = [...counts.keys()]
  .filter((s) => !known.some((k) => k.slug === s))
  .map((s) => ({ slug: s, label: videos.find((v) => v.industry === s).industryLabel }));
const filters = [...known, ...extra];

const chips = [
  `<button type="button" class="chip" data-i="all" aria-pressed="true">الكل <b>${videos.length}</b></button>`,
  ...filters.map(
    (f) => `<button type="button" class="chip" data-i="${esc(f.slug)}" aria-pressed="false">${esc(f.label)} <b>${counts.get(f.slug)}</b></button>`
  ),
].join("");

const b = cfg.brand;
const wa = `https://wa.me/${b.whatsapp}?text=${encodeURIComponent(b.whatsappMessage)}`;
const clientData = videos.map((v) => ({ id: v.id, t: v.title, p: v.preview, v: v.vertical ? 1 : 0 }));

const [tpl, css, js] = await Promise.all(
  ["src/template.html", "src/style.css", "src/app.js"].map((f) => readFile(new URL(f, ROOT), "utf8"))
);

const minCss = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,>])\s*/g, "$1").trim();

const html = tpl
  .replaceAll("{{NAME_AR}}", esc(b.nameAr || ""))
  .replaceAll("{{NAME}}", esc(b.name))
  .replaceAll("{{TIKTOK}}", esc(b.tiktok || ""))
  .replaceAll("{{X}}", esc(b.x || ""))
  .replaceAll("{{TAGLINE}}", esc(b.tagline))
  .replaceAll("{{HEADLINE_HTML}}", esc(b.headline).replace(/\*(.+?)\*/g, "<em>$1</em>"))
  .replaceAll("{{INTRO}}", esc(b.intro))
  .replaceAll("{{SITE_URL}}", esc(b.siteUrl))
  .replaceAll("{{MAIN_SITE}}", esc(b.mainSite))
  .replaceAll("{{INSTAGRAM}}", esc(b.instagram))
  .replaceAll("{{WA}}", esc(wa))
  .replaceAll("{{COUNT}}", String(videos.length))
  .replaceAll("{{INDUSTRY_COUNT}}", String(filters.length))
  .replaceAll("{{YEAR}}", String(new Date().getFullYear()))
  .replace("{{PRECONNECT}}", DEMO ? "" : `<link rel="preconnect" href="https://${CDN}" crossorigin>`)
  .replace("{{CSS}}", minCss.replaceAll("{{ACCENT}}", b.accent))
  .replace("{{CHIPS}}", chips)
  .replace("{{CARDS}}", videos.map(card).join(""))
  .replace("{{DATA}}", JSON.stringify({ lib: DEMO ? "" : LIB, videos: clientData }).replace(/</g, "\\u003c"))
  .replace("{{JS}}", js);

await rm(new URL("dist", ROOT), { recursive: true, force: true });
await mkdir(new URL("dist", ROOT), { recursive: true });
await cp(new URL("public", ROOT), new URL("dist", ROOT), { recursive: true });
await writeFile(new URL("dist/index.html", ROOT), html);
await writeFile(
  new URL("dist/_headers", ROOT),
  `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/\n  Cache-Control: public, max-age=0, s-maxage=600, stale-while-revalidate=86400\n/favicon.svg\n  Cache-Control: public, max-age=31536000, immutable\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n  Access-Control-Allow-Origin: *\n/logo.svg\n  Cache-Control: public, max-age=86400\n`
);
await writeFile(new URL("dist/robots.txt", ROOT), `User-agent: *\nAllow: /\n`);
await writeFile(
  new URL("dist/favicon.svg", ROOT),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B0B0C"/><text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="40" fill="${b.accent}">D</text></svg>`
);

console.log(`✓ Built ${videos.length} videos, ${filters.length} industries → dist/index.html (${(html.length / 1024).toFixed(1)} KB)`);
