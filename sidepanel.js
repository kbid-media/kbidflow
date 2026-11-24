// KbidFlow - painel lateral
const $ = (s) => document.querySelector(s);
const FLOW_RE = /^https:\/\/(flow\.google\.com|labs\.google)\//;
const SPEED = { fast: 3, balanced: 2, slow: 1 };
const FIELDS = [
  "prompts", "speed", "maxParallel", "genGapSec", "genTimeoutMin", "chainFrames", "thenDownload",
  "limit", "skipSaved", "includeImages",
  "quality", "imageQuality", "folder", "prefix", "startNumber", "timeoutMin", "gapSec", "fallback720", "allowCredits",
];
let tabId = null;

// ---------- configurações salvas ----------
function readSettings() {
  const s = {};
  for (const id of FIELDS) {
    const el = $("#" + id);
    s[id] = el.type === "checkbox" ? el.checked : el.value;
  }
  return s;
}
async function saveSettings() {
  await chrome.storage.local.set({ kfSettings: readSettings() });
}
async function loadSettings() {
  const { kfSettings } = await chrome.storage.local.get("kfSettings");
  if (!kfSettings) return;
  for (const id of FIELDS) {
    const el = $("#" + id);
    if (!(id in kfSettings)) continue;
    if (el.type === "checkbox") el.checked = !!kfSettings[id];
    else el.value = kfSettings[id];
  }
}
function settingsForRun() {
  const s = readSettings();
  s.prompts = s.prompts.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return s;
}

// ---------- aba do Flow ----------
async function findFlowTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && FLOW_RE.test(active.url || "")) return active.id;
  const all = await chrome.tabs.query({ url: ["https://flow.google.com/*", "https://labs.google/*"] });
  return all[0]?.id ?? null;
}
async function cmd(action, extra = {}) {
  tabId = await findFlowTab();
  if (tabId == null) throw new Error("Abra o Google Flow numa aba");
  try {
    return await chrome.tabs.sendMessage(tabId, { kf: "cmd", action, ...extra });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await new Promise((r) => setTimeout(r, 300));
    return await chrome.tabs.sendMessage(tabId, { kf: "cmd", action, ...extra });
  }
}

// ---------- tela ----------
function addLog(msg, level = "info", at = Date.now()) {
  const d = document.createElement("div");
  d.className = level;
  const t = new Date(at).toLocaleTimeString("pt-BR", { hour12: false });
  d.textContent = `${t}  ${msg}`;
  const log = $("#log");
  log.prepend(d);
  while (log.childNodes.length > 400) log.lastChild.remove();
}
function showStatus(st) {
  if (!st) return;
  const pill = $("#conn");
  if (st.running) {
    pill.textContent = st.mode === "generate" ? "gerando" : "baixando";
    pill.className = "pill run";
  } else {
    pill.textContent = "conectado";
    pill.className = "pill on";
  }
  if (st.text) $("#statusText").textContent = st.text;
  const total = st.total || 0;
  const pct = total ? Math.min(100, ((st.done + st.failed) / total) * 100) : 0;
  $("#bar").style.width = pct + "%";
  $("#btnGen").disabled = !!st.running;
  $("#btnDl").disabled = !!st.running;
  if ("pickMode" in st) {
    $("#pickMode").checked = !!st.pickMode;
    $("#pickedCount").textContent = st.pickMode
      ? st.picked
        ? `${st.picked} marcado${st.picked > 1 ? "s" : ""}`
        : "nenhum marcado = baixa todos"
      : "desligado: baixa todos";
    $("#btnDl").textContent = st.pickMode && st.picked ? `Baixar ${st.picked} marcado${st.picked > 1 ? "s" : ""}` : "Baixar vídeos";
  }
}
async function refresh() {
  try {
    const st = await cmd("ping");
    if (!st?.ok) return;
    showStatus(st);
    $("#countVideos").textContent = `${st.videos} vídeos prontos`;
    $("#countGen").textContent = `${st.generating} gerando`;
    $("#detect").textContent = `prompt: ${st.promptFound ? "✓" : "✗"}  enviar: ${st.sendFound ? "✓" : "✗"}`;
    const c = st.calib || {};
    $("#calibInfo").textContent =
      `Prompt: ${c.prompt ? "calibrado" : "automático"} · Enviar: ${c.send ? "calibrado" : "automático"}`;
  } catch (e) {
    $("#conn").textContent = "sem aba do Flow";
    $("#conn").className = "pill off";
    $("#statusText").textContent = e.message;
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.tab && tabId != null && sender.tab.id !== tabId) return;
  if (msg?.kf === "log") addLog(msg.msg, msg.level, msg.at);
  if (msg?.kf === "status") showStatus(msg);
});

// ---------- eventos ----------
document.querySelectorAll(".tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("hidden", t.id !== "tab-" + b.dataset.tab));
  }),
);
$("#speed").addEventListener("change", () => {
  const v = SPEED[$("#speed").value];
  if (v) $("#maxParallel").value = v;
});
$("#maxParallel").addEventListener("input", () => ($("#speed").value = "custom"));
const countPrompts = () =>
  ($("#promptCount").textContent = `${$("#prompts").value.split(/\r?\n/).filter((l) => l.trim()).length} prompts`);
$("#prompts").addEventListener("input", countPrompts);
for (const id of FIELDS) $("#" + id).addEventListener("change", saveSettings);
$("#prompts").addEventListener("input", saveSettings);

async function start(action) {
  await saveSettings();
  const s = settingsForRun();
  if (action === "generate" && !s.prompts.length) return addLog("Escreva pelo menos um prompt.", "error");
  if (action === "generate" && pack) {
    try {
      Object.assign(s, await packForRun(s.prompts));
    } catch (e) {
      return addLog(`Pacote: ${e.message}`, "error");
    }
  }
  try {
    const r = await cmd(action, { settings: s });
    if (!r?.ok) addLog(r?.error || "Não começou", "error");
  } catch (e) {
    addLog(e.message, "error");
  }
}
$("#btnGen").addEventListener("click", () => start("generate"));
$("#btnDl").addEventListener("click", () => start("download"));
document.querySelectorAll("button.stop").forEach((b) =>
  b.addEventListener("click", () => cmd("stop").catch((e) => addLog(e.message, "error"))),
);
$("#calPrompt").addEventListener("click", async () => {
  addLog("Clique na caixa de prompt dentro do Flow…");
  await cmd("calibrate", { what: "prompt" }).catch((e) => addLog(e.message, "error"));
  refresh();
});
$("#calSend").addEventListener("click", async () => {
  addLog("Clique no botão de enviar dentro do Flow (o clique é bloqueado, não gera nada)…");
  await cmd("calibrate", { what: "send" }).catch((e) => addLog(e.message, "error"));
  refresh();
});
$("#calReset").addEventListener("click", async () => {
  await cmd("resetCalib").catch(() => {});
  refresh();
});
$("#btnClearHist").addEventListener("click", async () => {
  await cmd("clearHistory").catch((e) => addLog(e.message, "error"));
  addLog("Histórico deste projeto apagado.");
});
$("#clearLog").addEventListener("click", () => ($("#log").textContent = ""));

// ---------- seleção ----------
$("#pickMode").addEventListener("change", async () => {
  await cmd("pick", { on: $("#pickMode").checked }).catch((e) => addLog(e.message, "error"));
  if ($("#pickMode").checked) addLog("Clique na caixinha (canto inferior direito) de cada vídeo que quer baixar.");
  refresh();
});
$("#pickAll").addEventListener("click", async () => {
  await cmd("pickAll", { includeImages: $("#includeImages").checked }).catch((e) => addLog(e.message, "error"));
  refresh();
});
$("#pickClear").addEventListener("click", async () => {
  await cmd("pickClear").catch(() => {});
  refresh();
});

// ---------- filas prontas (D:\IA\KbidFlow\filas, geradas pela skill kbidflow-prompts) ----------
// Formato: { titulo, criada, flow:{modelo,modo,proporcao,duracao,por_prompt,observacoes},
//            kbidflow:{quality,folder,prefix,startNumber,maxParallel,thenDownload,...}, prompts:[...] }
let queues = [];
async function listQueues() {
  const sel = $("#queueList");
  try {
    const r = await fetch(chrome.runtime.getURL("filas/index.json") + "?t=" + Date.now(), { cache: "no-store" });
    const idx = await r.json();
    queues = (idx.filas || []).slice().reverse();
  } catch {
    queues = [];
  }
  sel.textContent = "";
  const none = new Option(queues.length ? "— escolha uma fila —" : "— nenhuma fila na pasta —", "");
  sel.add(none);
  for (const q of queues) sel.add(new Option(`${q.titulo || q.arquivo} (${q.prompts ?? "?"} prompts${q.imagens ? ` · ${q.imagens} imagens` : ""}${q.criada ? " · " + q.criada : ""})`, q.arquivo));
}
// ---------- pacote: prompts + imagens ----------
// prompts: ["texto", {"texto": "...", "imagens": ["a.jpg"], "inicio": "frame.png"}]; "imagens" no topo valem para todos.
let pack = null; // { title, items:[{text,images,inicio}], globalImages:[], load(name) -> dataURL }
const blobToDataUrl = (blob) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean);
function normalizeQueue(q) {
  const items = (Array.isArray(q.prompts) ? q.prompts : []).map((p) =>
    typeof p === "string"
      ? { text: p, images: [], inicio: null }
      : {
          text: p.texto || p.text || p.prompt || "",
          images: asList(p.imagens || p.images),
          inicio: p.inicio || p.start || null,
          nome: p.nome || p.name || null,
          duracao: p.duracao || p.duration || null,
          continuar: !!(p.continuar || p.continue),
          continuarDe: p.continuar_de || null,
        },
  );
  items.forEach((it) => (it.text = String(it.text).replace(/\s*\r?\n\s*/g, " ").trim()));
  return { items, globalImages: asList(q.imagens || q.images) };
}
function showPack() {
  const box = $("#packInfo");
  if (!pack) return box.classList.add("hidden");
  const names = new Set(pack.globalImages);
  pack.items.forEach((it) => [...it.images, it.inicio].filter(Boolean).forEach((n) => names.add(n)));
  const per = pack.items.filter((it) => it.images.length || it.inicio).length;
  const cont = pack.items.filter((it) => it.continuar || it.continuarDe).length;
  const durs = pack.items.filter((it) => it.duracao).length;
  const nomes = pack.items.map((it) => it.nome).filter(Boolean);
  box.innerHTML = "";
  const b = document.createElement("b");
  b.textContent = `📎 Pacote: ${pack.items.length} takes, ${names.size} imagem(ns)`;
  const d = document.createElement("div");
  d.className = "muted";
  d.style.marginTop = "4px";
  d.textContent =
    (nomes.length ? `Takes: ${nomes.join(", ")}. ` : "") +
    (pack.globalImages.length ? `Em todos os prompts: ${pack.globalImages.join(", ")}. ` : "") +
    (per ? `${per} take(s) com imagem própria ou frame inicial. ` : "") +
    (cont ? `${cont} take(s) continuam do último frame do anterior. ` : "") +
    (durs ? "Cada take troca a própria duração. " : "") +
    "Ela sobe o que faltar no projeto e ajusta a caixa sozinha (um vídeo por vez).";
  const x = document.createElement("button");
  x.className = "link";
  x.textContent = "tirar as imagens";
  x.onclick = () => {
    pack = null;
    showPack();
    addLog("Imagens do pacote removidas; a fila usa só o texto.");
  };
  box.append(b, d, x);
  box.classList.remove("hidden");
}
async function packForRun(lines) {
  let items;
  if (lines.length === pack.items.length) items = lines.map((t, i) => ({ ...pack.items[i], text: t }));
  else {
    addLog("O número de linhas mudou desde que o pacote foi carregado: só as imagens gerais foram mantidas.", "warn");
    items = lines.map((t) => ({ text: t, images: [], inicio: null }));
    addLog("Nomes, durações e “continuar” por take também foram descartados.", "warn");
  }
  const names = new Set(pack.globalImages);
  items.forEach((it) => [...(it.images || []), it.inicio].filter(Boolean).forEach((n) => names.add(n)));
  const assets = {};
  for (const n of names) {
    try {
      assets[n] = await pack.load(n);
    } catch (e) {
      throw new Error(`não achei a imagem "${n}" no pacote`);
    }
  }
  addLog(`📎 ${names.size} imagem(ns) do pacote prontas para enviar.`);
  return { items, globalImages: pack.globalImages, assets };
}

function applyQueue(q, source, load = null) {
  const norm = normalizeQueue(q);
  const prompts = norm.items.map((it) => it.text);
  $("#prompts").value = prompts.join("\n");
  const hasImages = norm.globalImages.length || norm.items.some((it) => it.images.length || it.inicio);
  const hasTakes = norm.items.some((it) => it.nome || it.duracao || it.continuar || it.continuarDe);
  if (hasImages && !load) {
    addLog("Esta fila cita imagens, mas foi aberta como arquivo solto. Use “abrir pasta…” com a pasta do pacote.", "warn");
  }
  const noLoad = async (n) => {
    throw new Error(n);
  };
  pack =
    (hasImages && load) || hasTakes
      ? { title: q.titulo || source, ...norm, load: load || noLoad, ...(hasImages && !load ? { globalImages: [] } : {}) }
      : null;
  if (pack && hasImages && !load) pack.items.forEach((it) => ((it.images = []), (it.inicio = null)));
  showPack();
  const k = q.kbidflow || {};
  for (const [key, val] of Object.entries(k)) {
    const el = document.getElementById(key);
    if (!el || !FIELDS.includes(key)) continue;
    if (el.type === "checkbox") el.checked = !!val;
    else el.value = val;
  }
  if (k.maxParallel) $("#speed").value = { 3: "fast", 2: "balanced", 1: "slow" }[k.maxParallel] || "custom";
  const f = q.flow || {};
  const parts = [f.modelo, f.modo, f.proporcao, f.duracao, f.por_prompt ? `${f.por_prompt} por prompt` : ""].filter(Boolean);
  const box = $("#flowCheck");
  if (parts.length || f.observacoes) {
    box.innerHTML = "";
    const b = document.createElement("b");
    b.textContent = "Antes de gerar, deixe assim na caixa do Flow: ";
    box.append(b, document.createTextNode(parts.join(" · ")));
    if (f.observacoes) {
      const p = document.createElement("div");
      p.className = "muted";
      p.style.marginTop = "4px";
      p.textContent = f.observacoes;
      box.append(p);
    }
    box.classList.remove("hidden");
  } else box.classList.add("hidden");
  countPrompts();
  saveSettings();
  addLog(`Fila "${q.titulo || source}" carregada: ${prompts.length} prompts.`, "success");
}
$("#queueRefresh").addEventListener("click", listQueues);
$("#queueLoad").addEventListener("click", async () => {
  const file = $("#queueList").value;
  if (!file) return addLog("Escolha uma fila na lista.", "warn");
  try {
    const r = await fetch(chrome.runtime.getURL("filas/" + file) + "?t=" + Date.now(), { cache: "no-store" });
    const q = await r.json();
    const base = "filas/" + (q.pasta ? q.pasta.replace(/^\/+|\/+$/g, "") + "/" : "");
    const load = async (name) => {
      const res = await fetch(chrome.runtime.getURL(base + name), { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      return blobToDataUrl(await res.blob());
    };
    applyQueue(q, file, load);
  } catch (e) {
    addLog(`Não consegui ler filas/${file}: ${e.message}`, "error");
  }
});
$("#queueFile").addEventListener("change", async () => {
  const f = $("#queueFile").files[0];
  if (!f) return;
  const text = await f.text();
  try {
    if (/\.json$/i.test(f.name)) applyQueue(JSON.parse(text), f.name);
    else applyQueue({ titulo: f.name, prompts: text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) }, f.name);
  } catch (e) {
    addLog(`Arquivo inválido: ${e.message}`, "error");
  }
  $("#queueFile").value = "";
});
// Lista do que já existe no projeto do Flow, pronta para colar na conversa com o Claude
$("#copyTitles").addEventListener("click", async () => {
  addLog("Lendo a galeria do projeto (rola até o fim)…");
  try {
    const r = await cmd("listTitles");
    if (!r?.ok) return addLog(r?.error || "Não consegui ler o projeto", "error");
    const txt =
      `Títulos no projeto do Flow ${r.project} (KbidFlow):\n` +
      `Vídeos prontos (${r.videos.length}): ${r.videos.join(", ") || "nenhum"}\n` +
      (r.generating.length ? `Gerando agora (${r.generating.length}): ${r.generating.join(", ")}\n` : "") +
      `Imagens (${r.images.length}): ${r.images.join(", ") || "nenhuma"}`;
    await navigator.clipboard.writeText(txt);
    addLog(`📋 Copiado: ${r.videos.length} vídeos e ${r.images.length} imagens. Cole na conversa com o Claude.`, "success");
  } catch (e) {
    addLog(e.message, "error");
  }
});

// Pasta do computador com fila.json (ou prompts.txt) + imagens
$("#queueFolder").addEventListener("change", async () => {
  const files = [...$("#queueFolder").files];
  $("#queueFolder").value = "";
  if (!files.length) return;
  const byName = new Map(files.map((f) => [f.name, f]));
  const json = files.find((f) => /^fila.*\.json$/i.test(f.name)) || files.find((f) => /\.json$/i.test(f.name));
  const txt = files.find((f) => /\.txt$/i.test(f.name));
  const imgs = files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name));
  const load = async (name) => {
    const f = byName.get(name);
    if (!f) throw new Error("não encontrada");
    return blobToDataUrl(f);
  };
  try {
    let q;
    if (json) q = JSON.parse(await json.text());
    else if (txt) q = { titulo: txt.name, prompts: (await txt.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean) };
    else return addLog("A pasta não tem fila .json nem prompts .txt.", "error");
    // Sem lista de imagens no arquivo: todas as imagens da pasta valem para todos os prompts.
    if (!q.imagens && !q.images && !(q.prompts || []).some((p) => typeof p === "object" && (p.imagens || p.images || p.inicio)))
      q.imagens = imgs.map((f) => f.name);
    applyQueue(q, json?.name || txt.name, load);
  } catch (e) {
    addLog(`Pasta inválida: ${e.message}`, "error");
  }
});
listQueues();
$("#version").textContent = "v" + chrome.runtime.getManifest().version;

chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onUpdated.addListener((id, info) => info.status === "complete" && refresh());

loadSettings().then(() => {
  countPrompts();
  refresh();
  setInterval(refresh, 4000);
});
