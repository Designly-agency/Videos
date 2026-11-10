(() => {
  const D = JSON.parse(document.getElementById("data").textContent);
  const byId = new Map(D.videos.map((v) => [v.id, v]));
  const grid = document.getElementById("grid");
  const cards = [...grid.children];
  const empty = document.getElementById("empty");
  const chips = [...document.querySelectorAll(".chip")];
  const segs = [...document.querySelectorAll(".seg button")];
  const state = { i: "all", f: "all" };

  // ---------- filters (+ shareable URL: ?industry=real-estate&format=v) ----------
  function apply(push) {
    let n = 0;
    for (const c of cards) {
      const ok = (state.i === "all" || c.dataset.i === state.i) && (state.f === "all" || c.dataset.f === state.f);
      c.hidden = !ok;
      if (ok) n++;
    }
    empty.hidden = n > 0;
    chips.forEach((b) => b.setAttribute("aria-pressed", b.dataset.i === state.i));
    segs.forEach((b) => b.setAttribute("aria-pressed", b.dataset.f === state.f));
    if (push) {
      const u = new URL(location);
      state.i === "all" ? u.searchParams.delete("industry") : u.searchParams.set("industry", state.i);
      state.f === "all" ? u.searchParams.delete("format") : u.searchParams.set("format", state.f);
      history.replaceState(null, "", u);
    }
  }
  chips.forEach((b) => b.addEventListener("click", () => { state.i = b.dataset.i; apply(true); }));
  segs.forEach((b) => b.addEventListener("click", () => { state.f = b.dataset.f; apply(true); }));

  const q = new URLSearchParams(location.search);
  if (chips.some((b) => b.dataset.i === q.get("industry"))) state.i = q.get("industry");
  if (["v", "h"].includes(q.get("format"))) state.f = q.get("format");
  apply(false);
  const active = chips.find((b) => b.dataset.i === state.i);
  if (active && state.i !== "all") active.scrollIntoView({ block: "nearest", inline: "center" });

  // ---------- hover preview (desktop only; loads the animated WebP only on hover) ----------
  if (matchMedia("(hover:hover) and (pointer:fine)").matches) {
    grid.addEventListener("pointerover", (e) => {
      const t = e.target.closest(".tile");
      if (!t || t.dataset.pv) return;
      const v = byId.get(t.dataset.id);
      if (!v || !v.p || !D.lib) return;
      t.dataset.pv = 1;
      const img = new Image();
      img.className = "pv";
      img.alt = "";
      img.decoding = "async";
      img.onload = () => t.querySelector(".media").insertBefore(img, t.querySelector(".play"));
      img.src = v.p;
    });
  }

  // ---------- lightbox (iframe created on open, destroyed on close) ----------
  const lb = document.getElementById("lb");
  const frame = document.getElementById("frame");
  const lbt = document.getElementById("lbt");
  let cur = null;

  const visibleIds = () => cards.filter((c) => !c.hidden).map((c) => c.querySelector(".tile").dataset.id);

  function open(id) {
    const v = byId.get(id);
    if (!v) return;
    cur = id;
    frame.className = "frame" + (v.v ? " v" : "");
    frame.innerHTML = D.lib
      ? `<iframe src="https://iframe.mediadelivery.net/embed/${D.lib}/${id}?autoplay=true&preload=true&responsive=true" allow="autoplay;fullscreen;picture-in-picture;encrypted-media" allowfullscreen title=""></iframe>`
      : `<div class="demo">وضع تجريبي: سيعمل الفيديو هنا بعد ربط Bunny Stream</div>`;
    lbt.textContent = v.t;
    if (!lb.open) lb.showModal();
    const u = new URL(location);
    u.searchParams.set("v", id);
    history.replaceState(null, "", u);
  }
  function close() {
    lb.close();
  }
  lb.addEventListener("close", () => {
    frame.innerHTML = "";
    cur = null;
    const u = new URL(location);
    u.searchParams.delete("v");
    history.replaceState(null, "", u);
  });
  function step(d) {
    const ids = visibleIds();
    const i = ids.indexOf(cur);
    if (ids.length) open(ids[(i + d + ids.length) % ids.length]);
  }

  grid.addEventListener("click", (e) => {
    const t = e.target.closest(".tile");
    if (t) open(t.dataset.id);
  });
  lb.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]")?.dataset.act;
    if (a === "close") close();
    else if (a === "next") step(1);
    else if (a === "prev") step(-1);
    else if (a === "share") {
      const b = e.target.closest("button");
      navigator.clipboard?.writeText(location.href).then(() => {
        b.textContent = "تم النسخ ✓";
        setTimeout(() => (b.textContent = "نسخ الرابط"), 1600);
      });
    } else if (e.target === lb || e.target.classList.contains("lb-in")) close();
  });
  document.addEventListener("keydown", (e) => {
    if (!lb.open) return;
    if (e.key === "ArrowLeft") step(1); // RTL: left = next
    if (e.key === "ArrowRight") step(-1);
  });

  if (q.get("v") && byId.has(q.get("v"))) open(q.get("v"));
})();
