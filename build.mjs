// Designly video portfolio — build script (zero dependencies, Node 18+)
// Pulls every finished video from Bunny Stream and writes one fully static,
// pre-rendered HTML page to ./dist.
//
// Env vars (Cloudflare → your Pages project → Settings → Variables and Secrets):
//   BUNNY_LIBRARY_ID   e.g. 123456
//   BUNNY_API_KEY      Stream library API key (Stream → API)
//   BUNNY_CDN_HOST     e.g. vz-abc123-456.b-cdn.net  (Stream → API → CDN hostname)
// Without them the build runs in DEMO mode with generated sample videos.

import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";

const ROOT = new URL(".", import.meta.url);
const cfg = JSON.parse(await readFile(new URL("site.config.json", ROOT), "utf8"));
const { BUNNY_LIBRARY_ID: LIB, BUNNY_API_KEY: KEY, BUNNY_CDN_HOST: CDN } = process.env;
const DEMO = !(LIB && KEY && CDN);
// Diagnostics: show which variables the build can see (names only, never values)
console.log(
  "env check →",
  ["BUNNY_LIBRARY_ID", "BUNNY_API_KEY", "BUNNY_CDN_HOST"].map((k) => `${k}: ${process.env[k] ? "✓" : "✗ missing"}`).join(" | ")
);
const b = cfg.brand;

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

// Optional title convention in Bunny:  "★ اسم العميل | عنوان الفيديو"
//   ★ at the start  → featured (shown first)
//   "client | title" → client shown as a small label
function parseTitle(raw) {
  let t = (raw || "").replace(/\.(mp4|mov|m4v|webm)$/i, "").trim();
  // Filename-looking titles (no Arabic, no spaces) → tidy: drop sizes like 9x16 / 1080x1920, dashes → spaces
  if (!/[\u0600-\u06FF]/.test(t) && !/\s/.test(t)) {
    t = t.replace(/\b\d{1,4}\s*[x×]\s*\d{1,4}\b/gi, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  }
  const featured = /^[★*]/.test(t);
  t = t.replace(/^[★*]\s*/, "");
  const [a, c] = t.split("|").map((s) => s.trim());
  return c ? { client: a, title: c, featured } : { client: "", title: a, featured };
}

async function loadVideos() {
  if (DEMO) {
    console.log("⚠  DEMO mode (no Bunny env vars) — using generated sample videos");
    const titles = ["إعلان افتتاح الفرع الجديد", "ريل إطلاق المنتج", "فيديو تعريفي بالخدمات", "حملة رمضان", "جولة داخل المشروع", "موشن شرح التطبيق"];
    return Array.from({ length: 24 }, (_, i) => ({
      id: `demo-${i}`, title: titles[i % titles.length], client: "", featured: i < 3,
      vertical: i % 3 !== 1, duration: 15 + ((i * 37) % 110),
      date: new Date(2026, 10, 1 - i * 9).toISOString(), thumb: "", preview: "",
    }));
  }
  const items = await fetchAll("/videos?orderBy=date");
  return items
    .filter((v) => v.status === 4) // 4 = finished encoding
    .map((v) => {
      const { client, title, featured } = parseTitle(v.title);
      return {
        id: v.guid,
        title,
        client,
        featured,
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

const WA_ICON = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.85 9.85 0 0 0 12.04 2Zm5.8 14.06c-.24.69-1.42 1.32-1.96 1.4-.5.08-1.13.11-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.27-.29.58-.36.78-.36h.56c.18.01.42-.07.66.5.24.58.82 2.01.89 2.16.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.3-.13.59.17.29.74 1.22 1.59 1.98 1.09.97 2.01 1.27 2.3 1.42.29.14.46.12.63-.07.17-.19.72-.84.92-1.13.19-.29.38-.24.65-.14.27.1 1.7.8 1.99.95.29.14.48.22.55.34.07.12.07.69-.17 1.37Z"/></svg>`;

function card(v, i) {
  const eager = i < 4;
  const media = v.thumb
    ? `<img src="${esc(v.thumb)}" alt="" width="${v.vertical ? 540 : 960}" height="${v.vertical ? 960 : 540}" ${
        eager ? `fetchpriority="${i === 0 ? "high" : "auto"}"` : `loading="lazy"`
      } decoding="async">`
    : `<span class="ph" style="--h:${(i * 47) % 360}"></span>`;
  return `<li class="card${v.vertical ? " v" : ""}" data-f="${v.vertical ? "v" : "h"}">
<button type="button" class="tile" data-id="${esc(v.id)}" aria-label="تشغيل: ${esc(v.title)}">
<span class="media">${media}<span class="play" aria-hidden="true"></span>${v.duration ? `<span class="dur">${fmt(v.duration)}</span>` : ""}</span>
</button>
<div class="meta"><div class="txt">${v.client ? `<span class="tag">${esc(v.client)}</span>` : ""}<span class="ttl">${esc(v.title)}</span></div>
<a class="wa" href="https://wa.me/${b.whatsapp}" target="_blank" rel="noopener" aria-label="أريد فيديو مثل: ${esc(v.title)}" title="أريد فيديو مثله"><svg width="18" height="18" aria-hidden="true"><use href="#i-wa"/></svg></a></div>
</li>`;
}

const videos = (await loadVideos()).sort(
  (a, c) => (c.featured - a.featured) || String(c.date).localeCompare(String(a.date))
);
const nV = videos.filter((v) => v.vertical).length;

const wa = `https://wa.me/${b.whatsapp}?text=${encodeURIComponent(b.whatsappMessage)}`;
const clientData = {
  lib: DEMO ? "" : LIB, wa: b.whatsapp, msg: b.videoMessage, site: b.siteUrl,
  videos: videos.map((v) => ({ id: v.id, t: v.title, p: DEMO ? "" : v.preview, v: v.vertical ? 1 : 0 })),
};

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
  .replaceAll("{{WA_ICON}}", '<svg width="18" height="18" aria-hidden="true"><use href="#i-wa"/></svg>')
  .replace("{{SPRITE}}", `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="i-wa" viewBox="0 0 24 24">${WA_ICON.replace(/^<svg[^>]*>|<\/svg>$/g, "")}</symbol></svg>`)
  .replaceAll("{{COUNT}}", String(videos.length))
  .replaceAll("{{COUNT_V}}", String(nV))
  .replaceAll("{{COUNT_H}}", String(videos.length - nV))
  .replaceAll("{{HIDE_V}}", nV ? "" : " hidden")
  .replaceAll("{{HIDE_H}}", videos.length - nV ? "" : " hidden")
  .replaceAll("{{HIDE_SEG}}", nV && videos.length - nV ? "" : " hidden")
  .replaceAll("{{YEAR}}", String(new Date().getFullYear()))
  .replace("{{PRECONNECT}}", DEMO ? "" : `<link rel="preconnect" href="https://${CDN}" crossorigin>`)
  .replace("{{CSS}}", minCss.replaceAll("{{ACCENT}}", b.accent))
  .replace("{{CARDS}}", videos.map(card).join(""))
  .replace("{{DATA}}", JSON.stringify(clientData).replace(/</g, "\\u003c"))
  .replace("{{JS}}", js);

await rm(new URL("dist", ROOT), { recursive: true, force: true });
await mkdir(new URL("dist", ROOT), { recursive: true });
await cp(new URL("public", ROOT), new URL("dist", ROOT), { recursive: true });
await writeFile(new URL("dist/index.html", ROOT), html);
await writeFile(
  new URL("dist/_headers", ROOT),
  `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/\n  Cache-Control: public, max-age=0, must-revalidate\n/favicon.svg\n  Cache-Control: public, max-age=31536000, immutable\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n  Access-Control-Allow-Origin: *\n/logo.svg\n  Cache-Control: public, max-age=86400\n`
);
await writeFile(new URL("dist/robots.txt", ROOT), `User-agent: *\nAllow: /\n`);
await writeFile(
  new URL("dist/favicon.svg", ROOT),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B0B0C"/><text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="40" fill="${b.accent}">D</text></svg>`
);

console.log(`✓ Built ${videos.length} videos → dist/index.html (${(html.length / 1024).toFixed(1)} KB)`);
