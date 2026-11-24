// KbidFlow - painel lateral (só download)
const $ = (s) => document.querySelector(s);
const FLOW_RE = /^https:\/\/(flow\.google\.com|labs\.google)\//;
const FIELDS = [
  "limit", "skipSaved", "includeImages", "nameByTitle",
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
  $("#qualityHint").textContent = $("#quality").value;
}
async function loadSettings() {
  const { kfSettings } = await chrome.storage.local.get("kfSettings");
  if (kfSettings)
    for (const id of FIELDS) {
      const el = $("#" + id);
      if (!(id in kfSettings)) continue;
      if (el.type === "checkbox") el.checked = !!kfSettings[id];
      else el.value = kfSettings[id];
    }
  $("#qualityHint").textContent = $("#quality").value;
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
  pill.textContent = st.running ? "baixando" : "conectado";
  pill.className = st.running ? "pill run" : "pill on";
  if (st.text) $("#statusText").textContent = st.text;
  const total = st.total || 0;
  $("#bar").style.width = (total ? Math.min(100, ((st.done + st.failed) / total) * 100) : 0) + "%";
  $("#btnDl").disabled = !!st.running;
  if ("pickMode" in st) {
    $("#pickMode").checked = !!st.pickMode;
    $("#pickedCount").textContent = st.pickMode
      ? st.picked
        ? `${st.picked} marcado${st.picked > 1 ? "s" : ""}`
        : "nenhum marcado = baixa todos"
      : "desligado: baixa todos";
    $("#btnDl").textContent =
      st.pickMode && st.picked ? `Baixar ${st.picked} marcado${st.picked > 1 ? "s" : ""}` : "Baixar vídeos";
  }
}
async function refresh() {
  try {
    const st = await cmd("ping");
    if (!st?.ok) return;
    showStatus(st);
    $("#countVideos").textContent = `${st.videos} vídeos prontos`;
    $("#countGen").textContent = `${st.generating} gerando`;
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
for (const id of FIELDS) $("#" + id).addEventListener("change", saveSettings);
$("#btnDl").addEventListener("click", async () => {
  await saveSettings();
  try {
    const r = await cmd("download", { settings: readSettings() });
    if (!r?.ok) addLog(r?.error || "Não começou", "error");
  } catch (e) {
    addLog(e.message, "error");
  }
});
document.querySelectorAll("button.stop").forEach((b) =>
  b.addEventListener("click", () => cmd("stop").catch((e) => addLog(e.message, "error"))),
);
$("#btnClearHist").addEventListener("click", async () => {
  await cmd("clearHistory").catch((e) => addLog(e.message, "error"));
  addLog("Pronto: neste projeto, tudo conta como ainda não baixado.");
});
$("#clearLog").addEventListener("click", () => ($("#log").textContent = ""));
$("#pickMode").addEventListener("change", async () => {
  await cmd("pick", { on: $("#pickMode").checked }).catch((e) => addLog(e.message, "error"));
  if ($("#pickMode").checked) addLog("Clique na caixinha (canto de baixo, à direita) de cada vídeo que quer baixar.");
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

$("#version").textContent = "v" + chrome.runtime.getManifest().version;
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onUpdated.addListener((id, info) => info.status === "complete" && refresh());
loadSettings().then(() => {
  refresh();
  setInterval(refresh, 4000);
});
