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

const PLACES = [
  { id: "iskele", name: "İskele", blurb: "Su kenarı. Oturanlar, gelen geçen, akşam ışığı.", x: 52, y: 11 },
  { id: "park", name: "Çınar Parkı", blurb: "Banklar, köpekler, serin gölge.", x: 20, y: 28 },
  { id: "carsi", name: "Çarşı", blurb: "Kalabalık, dükkânlar, rastgele karşılaşmalar.", x: 54, y: 34 },
  { id: "kafe", name: "Ada Kafe", blurb: "Kahve, priz kavgası, yarı açık sohbetler.", x: 82, y: 30 },
  { id: "kutuphane", name: "Kütüphane", blurb: "Kısık ses, masa paylaşımı, sınav haftası.", x: 18, y: 58 },
  { id: "durak", name: "Durak", blurb: "Beklemek. Kısa cümleler, ortak kader.", x: 48, y: 62 },
  { id: "atolye", name: "Atölye", blurb: "Uğraşanlar, müzik, açık kapı.", x: 78, y: 58 },
  { id: "cati", name: "Çatı", blurb: "Gece. Manzara, uzun konuşmalar.", x: 70, y: 82 },
];

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

let supabaseClient = null;

function $(id) {
  return document.getElementById(id);
}

function oradaConfig() {
  const c = window.ORADA_CONFIG || {};
  if (c.supabaseUrl && c.supabaseAnonKey && !String(c.supabaseAnonKey).includes("YOUR-")) {
    return c;
  }
  return null;
}

function sb() {
  if (!supabaseClient) {
    const c = oradaConfig();
    supabaseClient = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseClient;
}

function rpcError(error) {
  const msg = error?.message || "Supabase hatası";
  if (/function|schema cache|does not exist/i.test(msg)) {
    return "Yeni Supabase projesinde orada/supabase/01_tables.sql ve 02_functions.sql dosyalarını SQL Editor'da çalıştır.";
  }
  return msg;
}

async function rpc(name, args) {
  const { data, error } = await sb().rpc(name, args);
  if (error) throw new Error(rpcError(error));
  return data;
}

async function localApi(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers["X-Avatar-Token"] = state.token;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "İstek başarısız");
  return data;
}

function applySession(data, token) {
  state.me = data.me || null;
  state.world = {
    time: data.time,
    tick: data.tick,
    avatars: data.avatars || [],
    recent: data.recent || [],
    me_id: data.me?.id || null,
    places: PLACES,
  };
  state.inbox = data.inbox || [];
  if (token) state.token = token;
  renderMap();
  renderMe();
  renderInbox();
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
    <p>${me.persona || ""}</p>
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
        <div>${ev.summary || (ev.messages && ev.messages[0] && ev.messages[0].text) || ""}</div>
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

async function refresh(extraTicks = 0) {
  if (oradaConfig()) {
    const data = await rpc("town_session", {
      p_token: state.token || null,
      p_extra_ticks: extraTicks,
    });
    applySession(data, state.token);
    return;
  }
  if (!state.token) return;
  if (extraTicks) {
    await localApi("/api/fast-forward", {
      method: "POST",
      body: JSON.stringify({ ticks: extraTicks }),
    });
  }
  const [me, world, inbox] = await Promise.all([
    localApi("/api/me"),
    localApi("/api/world"),
    localApi("/api/inbox"),
  ]);
  applySession({
    time: world.time,
    tick: world.tick,
    avatars: world.avatars,
    recent: world.recent,
    me,
    inbox: inbox.events,
  }, state.token);
}

async function createAvatar() {
  const name = $("name").value.trim();
  if (!name) {
    $("name").focus();
    return;
  }
  const traits = state.selectedTraits.join(",");
  const persona = $("persona").value.trim();
  if (oradaConfig()) {
    const data = await rpc("town_create_avatar", {
      p_name: name,
      p_persona: persona,
      p_traits: traits,
      p_color: state.selectedColor,
      p_emoji: state.selectedEmoji,
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    showTown(true);
    applySession(data, data.token);
    return;
  }
  const created = await localApi("/api/avatars", {
    method: "POST",
    body: JSON.stringify({
      name,
      persona,
      traits: state.selectedTraits,
      color: state.selectedColor,
      emoji: state.selectedEmoji,
    }),
  });
  localStorage.setItem(TOKEN_KEY, created.token);
  state.token = created.token;
  showTown(true);
  await refresh();
}

async function deploy(placeId, wander = true) {
  if (!placeId) return;
  state.selectedPlace = placeId;
  if (oradaConfig()) {
    const data = await rpc("town_deploy", {
      p_token: state.token,
      p_place_id: placeId,
      p_wander: wander,
    });
    applySession(data, state.token);
    return;
  }
  await localApi("/api/deploy", {
    method: "POST",
    body: JSON.stringify({ place_id: placeId, wander }),
  });
  await refresh();
}

async function recall() {
  if (oradaConfig()) {
    const data = await rpc("town_recall", { p_token: state.token });
    applySession(data, state.token);
    return;
  }
  await localApi("/api/recall", { method: "POST" });
  await refresh();
}

async function skipTime() {
  $("btn-skip").disabled = true;
  try {
    await refresh(8);
  } finally {
    $("btn-skip").disabled = false;
  }
}

async function openConversation(id) {
  let conv;
  if (oradaConfig()) {
    conv = await rpc("town_conversation", { p_id: id });
  } else {
    conv = await localApi(`/api/conversations/${id}`);
  }
  const msgs = (conv.messages || []).map((m) => `
    <div class="msg">
      <div class="who">${m.emoji || ""} ${m.name}</div>
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
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.token) {
      refresh().catch(() => {});
    }
  });
}

async function boot() {
  bind();
  if (!state.token) {
    showTown(false);
    if (oradaConfig()) {
      try {
        const data = await rpc("town_session", { p_token: null, p_extra_ticks: 0 });
        applySession(data, null);
      } catch {
        /* SQL henüz çalıştırılmamış olabilir */
      }
    }
    return;
  }
  try {
    await refresh();
    showTown(true);
  } catch {
    resetAvatar();
  }
}

boot();
