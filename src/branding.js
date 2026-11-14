(() => {
  const D = JSON.parse(document.getElementById("data").textContent);
  const byId = new Map(D.items.map((v) => [v.id, v]));
  const order = D.items.map((v) => v.id);

  // Ready WhatsApp message per project (includes the exact project link)
  const waFor = (v) =>
        `https://wa.me/${D.wa}?text=${encodeURIComponent(`${D.msg}\n\nالمشروع: ${v.t}${v.c ? " - " + v.c : ""}\n${D.site}/?p=${v.id}`)}`;
  for (const a of document.querySelectorAll(".card .wa")) {
    const v = byId.get(a.closest(".card").querySelector(".tile").dataset.id);
    if (v) a.href = waFor(v);
  }

  // ---------- project viewer: pages load only when opened, lazily, at screen-appropriate size ----------
  const doc = document.getElementById("doc");
  const pages = document.getElementById("pages");
  const dtt = document.getElementById("dtt");
  const dtag = document.getElementById("dtag");
  const dwa = document.getElementById("dwa");
  const dwa2 = document.getElementById("dwa2");
  let cur = null;

  const src = (v, n, w) => `/branding/${v.dir}/p${String(n).padStart(2, "0")}-${w}.webp`;

  function open(id) {
    const v = byId.get(id);
    if (!v) return;
    cur = id;
    dtt.textContent = v.t;
    dtag.textContent = v.c || "";
    dtag.hidden = !v.c;
    dwa.href = dwa2.href = waFor(v);
    pages.innerHTML = v.pg
      .map(
        ([w, h], i) =>
          `<img src="${src(v, i + 1, 1200)}" srcset="${src(v, i + 1, 1200)} 1200w, ${src(v, i + 1, 2400)} 2400w" sizes="(max-width:1300px) calc(100vw - 32px), 1240px" width="${w}" height="${h}" alt="${v.t.replace(/"/g, "&quot;")} — صفحة ${i + 1}" ${i < 2 ? "" : 'loading="lazy"'} decoding="async">`
      )
      .join("");
    if (!doc.open) doc.showModal();
    doc.scrollTop = 0;
    const u = new URL(location);
    u.searchParams.set("p", id);
    history.replaceState(null, "", u);
  }

  doc.addEventListener("close", () => {
    pages.innerHTML = "";
    cur = null;
    const u = new URL(location);
    u.searchParams.delete("p");
    history.replaceState(null, "", u);
  });

  document.getElementById("grid").addEventListener("click", (e) => {
    const t = e.target.closest(".tile");
    if (t) open(t.dataset.id);
  });

  doc.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]")?.dataset.act;
    if (a === "close") doc.close();
    else if (a === "next") open(order[(order.indexOf(cur) + 1) % order.length]);
    else if (a === "share") {
      const b = e.target.closest("button");
      navigator.clipboard?.writeText(location.href).then(() => {
        b.textContent = "تم النسخ ✓";
        setTimeout(() => (b.textContent = "نسخ الرابط"), 1600);
      });
    }
  });

  const q = new URLSearchParams(location.search).get("p");
  if (q && byId.has(q)) open(q);
})();
