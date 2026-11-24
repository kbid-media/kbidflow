// KbidFlow - service worker
// 1. Abre o painel lateral ao clicar no ícone.
// 2. Quando a aba do Flow avisa que acabou de clicar numa qualidade ("arm"), o primeiro download vindo do Flow
//    é reivindicado, renomeado para <pasta>/<nome>.<ext> e a aba é avisada de que ele começou.
//    Todos os outros downloads do Chrome ficam intactos.
// 3. Libera "downloads automáticos" para o Flow (sem o aviso "Baixar vários arquivos?").

const FLOW_RE = /^https:\/\/(flow\.google\.com|labs\.google)\//;
const FLOW_FILE_RE =
  /^(?:blob:)?https:\/\/(?:flow\.google\.com|labs\.google|[^/]+\.googleusercontent\.com|storage\.googleapis\.com)\//;

let armed = null; // { armId, tabId, name, folder }
let loaded = false;
const claimed = new Map(); // downloadId -> arm

const ready = chrome.storage.session.get("armed").then((s) => {
  if (!loaded) armed = s.armed || null;
  loaded = true;
});
const save = () => chrome.storage.session.set({ armed }).catch(() => {});

chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

function looksLikeFlow(item) {
  if (item.byExtensionId && item.byExtensionId !== chrome.runtime.id) return false;
  if (item.referrer) return FLOW_RE.test(item.referrer);
  const url = item.finalUrl || item.url || "";
  return FLOW_FILE_RE.test(url) || url.startsWith("data:");
}

function claim(item) {
  if (claimed.has(item.id)) return claimed.get(item.id);
  if (!armed || !looksLikeFlow(item)) return null;
  const arm = armed;
  armed = null; // um download por clique
  claimed.set(item.id, arm);
  save();
  chrome.tabs.sendMessage(arm.tabId, { kf: "gotArm", armId: arm.armId, downloadId: item.id }).catch(() => {});
  return arm;
}

const clean = (s) =>
  String(s || "")
    .replace(/[<>:"\\|?*\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  ready.then(() => {
    const arm = claim(item);
    if (!arm) return suggest();
    const original = item.filename.split(/[\\/]/).pop() || "arquivo";
    const ext = (original.match(/\.[a-z0-9]{2,4}$/i) || [""])[0] || (item.mime?.startsWith("video") ? ".mp4" : "");
    const folder = String(arm.folder || "KbidFlow")
      .split(/[\\/]/)
      .map(clean)
      .filter(Boolean)
      .join("/");
    const base = arm.name ? clean(arm.name).slice(0, 120) + ext : original;
    suggest({ filename: folder ? `${folder}/${base}` : base, conflictAction: "uniquify" });
  });
  return true;
});

chrome.downloads.onChanged.addListener((d) => {
  const arm = claimed.get(d.id);
  if (!arm || !d.state) return;
  if (d.state.current === "complete" || d.state.current === "interrupted") {
    chrome.tabs
      .sendMessage(arm.tabId, { kf: "dlState", armId: arm.armId, state: d.state.current })
      .catch(() => {});
    claimed.delete(d.id);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.kf !== "expectDownload") return false;
  armed =
    msg.armId != null && sender.tab
      ? { armId: msg.armId, tabId: sender.tab.id, name: msg.name || "", folder: msg.folder || "" }
      : null;
  loaded = true;
  save().then(() => sendResponse({ ok: true }));
  return true;
});

function allowAutoDownloads() {
  for (const primaryPattern of ["https://flow.google.com/*", "https://labs.google/*"]) {
    chrome.contentSettings.automaticDownloads.set({ primaryPattern, setting: "allow" }).catch?.(() => {});
  }
}
chrome.runtime.onInstalled.addListener(allowAutoDownloads);
chrome.runtime.onStartup.addListener(allowAutoDownloads);
