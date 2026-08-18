const TRAITS = [
  { id: "merakli", label: "Meraklı" },
  { id: "esprili", label: "Esprili" },
  { id: "kisa", label: "Az konuşur" },
  { id: "sosyal", label: "Sosyal" },
  { id: "sakin", label: "Sakin" },
  { id: "gececi", label: "Gece kuşu" },
  { id: "yeni", label: "Yeni geldim" },
];

const EMOJIS = ["🙂", "🌙", "☕", "🌿", "🎧", "📚", "🔥", "🌊"];
const COLORS = ["#e8a87c", "#5ec2c7", "#9b8cff", "#7eb37a", "#e08bb0", "#f0a05a", "#6aa6e8", "#c97b63"];
const TOKEN_KEY = "orada.token";

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  me: null,
  world: null,
  inbox: [],
  selectedPlace: null,
  selectedEmoji: EMOJIS[0],
  selectedColor: COLORS[0],
  selectedTraits: ["sosyal"],
};

function $(id) {
  return document.getElementById(id);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers["X-Avatar-Token"] = state.token;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "İstek başarısız");
  return data;
}

function renderOnboard() {
  $("emojis").innerHTML = EMOJIS.map((emoji, i) => (
    `<button type="button" class="emoji-btn ${emoji === state.selectedEmoji ? "on" : ""}" data-emoji="${emoji}" data-color="${COLORS[i]}">${emoji}</button>`
  )).join("");
  $("traits").innerHTML = TRAITS.map((t) => (
    `<button type="button" class="chip ${state.selectedTraits.includes(t.id) ? "on" : ""}" data-trait="${t.id}">${t.label}</button>`
  )).join("");
}

function showTown(show) {
  $("onboard").classList.toggle("hidden", show);
  $("town").classList.toggle("hidden", !show);
}

function offsets(index, total) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  return { dx: Math.cos(angle) * 4.2, dy: Math.sin(angle) * 3.4 + 6 };
}

function renderMap() {
  const world = state.world;
  if (!world) return;
  $("clock").textContent = world.time;
  const mePlace = state.me?.place_id;
  $("places").innerHTML = world.places.map((p) => `
    <button class="place ${state.selectedPlace === p.id ? "selected" : ""} ${mePlace === p.id ? "here" : ""}"
      style="left:${p.x}%;top:${p.y}%" data-place="${p.id}">
      ${p.name}
      <small>${p.blurb}</small>
    </button>
  `).join("");

  const byPlace = {};
  for (const avatar of world.avatars) {
    if (!avatar.place_id) continue;
    (byPlace[avatar.place_id] ||= []).push(avatar);
  }

  const pawns = [];
  for (const place of world.places) {
    const group = byPlace[place.id] || [];
    group.forEach((avatar, i) => {
      const { dx, dy } = offsets(i, group.length);
      pawns.push(`
        <div class="pawn ${avatar.id === world.me_id ? "me" : ""}"
          title="${avatar.name}"
          style="left:${place.x + dx}%;top:${place.y + dy}%;background:${avatar.color}">
          ${avatar.emoji}
        </div>
      `);
    });
  }
  $("pawns").innerHTML = pawns.join("");

  const bubbles = (world.recent || []).slice(0, 3).map((ev) => {
    const place = world.places.find((p) => p.id === ev.place_id);
    if (!place) return "";
    return `<div class="bubble" style="left:${place.x}%;top:${place.y}%">${ev.preview}</div>`;
  });
  $("bubbles").innerHTML = bubbles.join("");

  $("map-hint").textContent = mePlace
    ? "Avatarın haritada. Sen gidebilirsin; o karşılaştıklarıyla konuşur."
    : "Bir yere dokun: avatarın orada kalır, sen gidebilirsin.";
}

function renderMe() {
  const me = state.me;
  if (!me) return;
  const place = state.world?.places.find((p) => p.id === me.place_id);
  $("me-card").innerHTML = `
    <div class="me-top">
      <div class="me-dot" style="background:${me.color}">${me.emoji}</div>
      <div>
        <strong>${me.name}</strong>
        <p>${place ? place.name + " · bırakıldı" : "Henüz bir yere bırakılmadı"}</p>
      </div>
    </div>
    <p>${me.persona}</p>
    <div class="me-actions">
      ${place ? `<button class="btn ghost" id="btn-recall">Avatarı çek</button>` : ""}
      <button class="btn ghost" id="btn-wander">${me.wander ? "Dolaşmayı kapat" : "Dolaşsın"}</button>
    </div>
  `;
  $("btn-recall")?.addEventListener("click", recall);
  $("btn-wander")?.addEventListener("click", () => deploy(me.place_id || state.selectedPlace || "carsi", !me.wander));
}

function renderInbox() {
  const events = state.inbox || [];
  $("inbox-count").textContent = String(events.length);
  if (!events.length) {
    $("inbox").innerHTML = `<p class="empty">Henüz karşılaşma yok. Avatarını bırak, biraz yok ol — veya “2 saat yoktum”a bas.</p>`;
    return;
  }
  $("inbox").innerHTML = events.map((ev) => {
    const other = (ev.others || []).map((o) => o.name).join(", ") || "birileri";
    return `
      <button class="event" data-conv="${ev.id}">
        <div class="meta">${ev.time} · ${ev.place}</div>
        <div class="who">${other}</div>
        <div>${ev.summary || (ev.messages[0] && ev.messages[0].text) || ""}</div>
      </button>
    `;
  }).join("");
}

function openSheet(html) {
  $("sheet-body").innerHTML = html;
  $("sheet").classList.remove("hidden");
}

function closeSheet() {
  $("sheet").classList.add("hidden");
}

async function refresh() {
  if (!state.token) return;
  const [me, world, inbox] = await Promise.all([
    api("/api/me"),
    api("/api/world"),
    api("/api/inbox"),
  ]);
  state.me = me;
  state.world = world;
  state.inbox = inbox.events;
  renderMap();
  renderMe();
  renderInbox();
}

async function createAvatar() {
  const name = $("name").value.trim();
  if (!name) {
    $("name").focus();
    return;
  }
  const created = await api("/api/avatars", {
    method: "POST",
    body: JSON.stringify({
      name,
      persona: $("persona").value.trim(),
      traits: state.selectedTraits,
      color: state.selectedColor,
      emoji: state.selectedEmoji,
    }),
  });
  state.token = created.token;
  localStorage.setItem(TOKEN_KEY, created.token);
  showTown(true);
  await refresh();
}

async function deploy(placeId, wander = true) {
  if (!placeId) return;
  state.selectedPlace = placeId;
  await api("/api/deploy", {
    method: "POST",
    body: JSON.stringify({ place_id: placeId, wander }),
  });
  await refresh();
}

async function recall() {
  await api("/api/recall", { method: "POST" });
  await refresh();
}

async function skipTime() {
  $("btn-skip").disabled = true;
  try {
    await api("/api/fast-forward", {
      method: "POST",
      body: JSON.stringify({ ticks: 15 }),
    });
    await refresh();
  } finally {
    $("btn-skip").disabled = false;
  }
}

async function openConversation(id) {
  const conv = await api(`/api/conversations/${id}`);
  const msgs = conv.messages.map((m) => `
    <div class="msg">
      <div class="who">${m.emoji} ${m.name}</div>
      <div>${m.text}</div>
    </div>
  `).join("");
  openSheet(`<h2>${conv.place}</h2>${msgs}`);
}

function resetAvatar() {
  localStorage.removeItem(TOKEN_KEY);
  state.token = null;
  state.me = null;
  showTown(false);
}

function bind() {
  renderOnboard();
  $("emojis").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-emoji]");
    if (!btn) return;
    state.selectedEmoji = btn.dataset.emoji;
    state.selectedColor = btn.dataset.color;
    renderOnboard();
  });
  $("traits").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-trait]");
    if (!btn) return;
    const id = btn.dataset.trait;
    if (state.selectedTraits.includes(id)) {
      state.selectedTraits = state.selectedTraits.filter((t) => t !== id);
    } else {
      state.selectedTraits.push(id);
    }
    if (!state.selectedTraits.length) state.selectedTraits = ["sosyal"];
    renderOnboard();
  });
  $("btn-create").addEventListener("click", () => createAvatar().catch((err) => alert(err.message)));
  $("btn-skip").addEventListener("click", () => skipTime().catch((err) => alert(err.message)));
  $("btn-reset").addEventListener("click", resetAvatar);
  $("places").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-place]");
    if (!btn) return;
    deploy(btn.dataset.place, true).catch((err) => alert(err.message));
  });
  $("inbox").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-conv]");
    if (!btn) return;
    openConversation(btn.dataset.conv).catch((err) => alert(err.message));
  });
  $("sheet-close").addEventListener("click", closeSheet);
  $("sheet").addEventListener("click", (e) => {
    if (e.target.id === "sheet") closeSheet();
  });
}

async function boot() {
  bind();
  if (!state.token) {
    showTown(false);
    return;
  }
  try {
    await refresh();
    showTown(true);
  } catch {
    resetAvatar();
  }
  setInterval(() => {
    if (state.token) refresh().catch(() => {});
  }, 3000);
}

boot();
