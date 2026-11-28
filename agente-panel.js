// KbidFlow · aba "Fila do agente" do painel: monta a fila, inicia/pausa e mostra o andamento.
// O motor roda em agente.js, na aba do Flow. Estado em chrome.storage.local ("kfAgente").
(() => {
  const KEY = "kfAgente", LOG = "kfAgenteLog";
  const $ = (id) => document.getElementById(id);
  const CFG = ["minSeg", "calmaSeg", "maxImgSeg", "maxVidSeg", "pausaSeg"];
  const ICON = { pendente: "○", enviando: "↗", gerando: "⏳", feito: "✔", erro: "✖", pergunta: "⚠" };

  // abas do painel
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll('[id^="tab-"]').forEach((el) => el.classList.toggle("hidden", el.id !== "tab-" + b.dataset.tab));
    try { localStorage.setItem("kfTab", b.dataset.tab); } catch {}
  }));
  try { const tb = localStorage.getItem("kfTab"); if (tb) document.querySelector(`.tabs button[data-tab="${tb}"]`)?.click(); } catch {}

  const get = async () => (await chrome.storage.local.get(KEY))[KEY] || { fila: [], rodando: false, cfg: {} };
  const put = (st) => chrome.storage.local.set({ [KEY]: st });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tipoDe = (t) => (/MODO:\s*V[ÍI]DEO/i.test(t || "") ? "video" : "imagem");

  async function flowTab() {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (t && /^https:\/\/(flow\.google\.com|labs\.google)\//.test(t.url || "")) return t;
    const all = await chrome.tabs.query({ url: ["https://flow.google.com/*", "https://labs.google/*"] });
    return all.find((x) => /\/project\//.test(x.url)) || all[0];
  }

  function parse(txt) {
    txt = txt.trim();
    if (!txt) return [];
    if (txt.startsWith("[")) return JSON.parse(txt).map((x, i) => ({ cod: x.cod || `p${i + 1}`, tipo: x.tipo || tipoDe(x.texto), texto: x.texto }));
    return txt.split(/\n\s*={5,}\s*\n/).map((t) => t.trim()).filter(Boolean).map((t, i) => {
      const m = t.match(/C[óo]digo:\s*(\S+)/i);
      return { cod: m ? m[1] : `p${i + 1}`, tipo: tipoDe(t), texto: t };
    });
  }

  async function render() {
    const st = await get();
    const cfg = st.cfg || {};
    CFG.forEach((k) => { if (cfg[k] !== undefined && document.activeElement !== $(k)) $(k).value = cfg[k]; });
    $("agCont").textContent = `· ${st.fila.filter((x) => x.status === "feito").length}/${st.fila.length} feitos`;
    $("agFila").innerHTML = st.fila.map((x, i) =>
      `<li class="${x.status}"><button class="x" data-i="${i}" title="tirar da fila">✕</button>${ICON[x.status] || "?"} <span class="cod">${esc(x.cod)}</span> · ${x.tipo}` +
      (x.msg ? `<span class="msg">${esc(x.msg)}</span>` : "") + `</li>`).join("");
    const atual = st.fila.find((x) => x.status === "gerando" || x.status === "enviando");
    $("agEstado").textContent = st.rodando
      ? `Rodando${atual ? ` · ${atual.cod} (${atual.status}${atual.inicio ? `, ${Math.round((Date.now() - atual.inicio) / 1000)} s` : ""})` : ""}`
      : st.fila.some((x) => x.status === "pergunta") ? "Pausada: o agente respondeu sem gerar. Responda no Flow e clique em repetir ⚠/✖ ou Iniciar."
      : st.fila.length && st.fila.every((x) => x.status === "feito") ? "Fila concluída." : "Parada.";
    const lg = (await chrome.storage.local.get(LOG))[LOG] || [];
    $("agLog").textContent = lg.slice(-80).join("\n");
    $("agLog").scrollTop = 1e9;
  }

  $("agAdd").onclick = async () => {
    try {
      const itens = parse($("agEntrada").value);
      if (!itens.length) return;
      const st = await get();
      const have = new Set(st.fila.map((x) => x.cod));
      itens.forEach((x) => { if (!have.has(x.cod)) st.fila.push({ ...x, status: "pendente", msg: "" }); });
      await put(st);
      $("agEntrada").value = "";
    } catch (e) { alert("Não consegui ler a fila: " + e.message); }
  };
  $("agStart").onclick = async () => {
    const t = await flowTab();
    if (!t) return alert("Abra o projeto do Flow, com o painel do agente aberto, numa aba.");
    const st = await get();
    st.rodando = true;
    st.fila.forEach((x) => { if (x.status === "enviando" || x.status === "gerando") x.status = "pendente"; });
    await put(st);
    try { await chrome.tabs.sendMessage(t.id, { kfAgente: "start" }); }
    catch { st.rodando = false; await put(st); alert("A aba do Flow não respondeu. Dê F5 no Flow e tente de novo."); }
  };
  $("agPause").onclick = async () => { const st = await get(); st.rodando = false; await put(st); };
  $("agPing").onclick = async () => {
    const t = await flowTab();
    if (!t) return ($("agEstado").textContent = "Nenhuma aba do Flow aberta.");
    try {
      const r = await chrome.tabs.sendMessage(t.id, { kfAgente: "ping" });
      $("agEstado").textContent = `Aba OK · caixa do agente: ${r.box ? "achei" : "NÃO achei (abra o agente)"} · botão enviar: ${r.send ? "achei" : "NÃO achei"} · mídias prontas: ${r.snap.media}`;
    } catch { $("agEstado").textContent = "A aba do Flow não respondeu: dê F5 no Flow."; }
  };
  $("agRetry").onclick = async () => { const st = await get(); st.fila.forEach((x) => { if (x.status === "erro" || x.status === "pergunta") { x.status = "pendente"; x.msg = ""; } }); await put(st); };
  $("agLimparFeitos").onclick = async () => { const st = await get(); st.fila = st.fila.filter((x) => x.status !== "feito"); await put(st); };
  $("agLimpar").onclick = async () => { if (!confirm("Esvaziar a fila inteira?")) return; const st = await get(); st.fila = []; st.rodando = false; await put(st); };
  $("agLimparLog").onclick = () => chrome.storage.local.set({ [LOG]: [] });
  $("agFila").onclick = async (e) => {
    const i = e.target?.dataset?.i; if (i === undefined) return;
    const st = await get(); if (st.fila[i]?.status === "gerando") return; st.fila.splice(+i, 1); await put(st);
  };
  CFG.forEach((k) => ($(k).onchange = async () => { const st = await get(); st.cfg = { ...(st.cfg || {}), [k]: +$(k).value }; await put(st); }));
  ["baixarAoFim", "baixarImagens"].forEach((k) => ($(k).onchange = async () => { const st = await get(); st.cfg = { ...(st.cfg || {}), [k]: $(k).checked }; await put(st); }));
  get().then((st) => { const c = st.cfg || {}; $("baixarAoFim").checked = c.baixarAoFim !== false; $("baixarImagens").checked = !!c.baixarImagens; });

  chrome.storage.onChanged.addListener((ch) => { if (ch[KEY] || ch[LOG]) render(); });
  setInterval(render, 1000);
  render();
})();
