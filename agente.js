// KbidFlow · Fila do agente: motor que roda na aba do Flow.
// Para cada pedido pendente: cola o texto na caixa do agente, clica em "Iniciar geração",
// espera o agente responder E a geração terminar, e só então passa para o próximo.
// Se o agente responder sem gerar nada (provavelmente fez uma pergunta), a fila PAUSA para você responder.
(() => {
  if (window.__kfAgenteLoaded) return;
  window.__kfAgenteLoaded = true;

  const KEY = "kfAgente", LOG = "kfAgenteLog";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let running = false;

  const get = async () => (await chrome.storage.local.get(KEY))[KEY] || { fila: [], rodando: false, cfg: {} };
  const put = (st) => chrome.storage.local.set({ [KEY]: st });
  async function log(msg) {
    const l = (await chrome.storage.local.get(LOG))[LOG] || [];
    l.push(new Date().toLocaleTimeString("pt-BR") + " · " + msg);
    await chrome.storage.local.set({ [LOG]: l.slice(-300) });
  }
  async function setItem(i, patch) { const st = await get(); Object.assign(st.fila[i], patch); await put(st); }

  // ---------- leitura da página ----------
  const box = () => document.querySelector('.ProseMirror[contenteditable="true"][aria-label*="criar" i]') || document.querySelector('.ProseMirror[contenteditable="true"]');
  const sendBtn = () => document.querySelector('button[aria-label="Iniciar geração"]') || document.querySelector("button.generate-icon-button");
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

  // cards da galeria: mesmos critérios da parte de download (content.js)
  const TILE_SEL = "flow-video-tile, flow-image-tile";
  const PERCENT_RE = /^\s*\d{1,3}\s?%\s*$/;
  const FAIL_RE = /failed to generate|falha ao gerar|não foi possível|went wrong/i;
  const hasMore = (t) => t.querySelector('button[aria-label="More options"]') ||
    [...t.querySelectorAll("button")].find((b) => /more_vert|more_horiz/.test(b.textContent || ""));
  function showsPercent(t) {
    const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) if (PERCENT_RE.test(w.currentNode.textContent)) return true;
    return false;
  }
  const isFailed = (t) => !!t.querySelector("flow-error-tile") || FAIL_RE.test(t.textContent || "");
  const isGen = (t) => !isFailed(t) && (!hasMore(t) || showsPercent(t));

  function snap() {
    const msgs = document.querySelectorAll(".agent-message-content");
    const last = msgs[msgs.length - 1];
    const tiles = [...document.querySelectorAll(TILE_SEL)];
    const gen = tiles.filter(isGen).length;
    const failed = tiles.filter(isFailed).length;
    const media = tiles.length - gen - failed;
    const progress = [...document.querySelectorAll('[role="progressbar"], mat-progress-spinner, mat-spinner, mat-progress-bar, .mat-mdc-progress-spinner')].filter(visible).length;
    const stop = [...document.querySelectorAll("button")].filter((b) => visible(b) && /parar|interromper|stop|cancelar/i.test(b.getAttribute("aria-label") || "")).length;
    const btn = sendBtn();
    return {
      msgs: msgs.length, lastLen: last ? last.innerText.length : 0, lastTxt: last ? last.innerText.slice(-160) : "",
      media, failed, busy: gen + progress + stop > 0, progress, pct: gen, stop, btnLabel: btn ? btn.getAttribute("aria-label") : "(sem botão)",
    };
  }

  // ---------- escrever e enviar ----------
  async function typeText(text) {
    const b = box();
    if (!b) throw new Error("não achei a caixa do agente ('O que você quer criar?')");
    b.focus();
    // testado no Flow em 27/11/2026: insertText entra no ProseMirror (um <p> por linha) e ativa o botão;
    // o evento de colar sintético é ignorado.
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, text);
    await sleep(500);
    const probe = text.replace(/\s+/g, " ").slice(0, 40);
    if (!b.innerText.replace(/\s+/g, " ").includes(probe)) throw new Error("o texto não entrou na caixa do agente");
  }

  async function clickSend() {
    for (let i = 0; i < 20; i++) {
      const btn = sendBtn();
      if (btn && !btn.disabled) { btn.click(); return; }
      await sleep(250);
    }
    throw new Error("o botão 'Iniciar geração' não ficou ativo");
  }

  // ---------- esperar terminar ----------
  async function waitDone(before, tipo, cfg) {
    const t0 = Date.now();
    const minMs = (cfg.minSeg ?? 15) * 1000;
    const maxMs = ((tipo === "video" ? cfg.maxVidSeg : cfg.maxImgSeg) ?? (tipo === "video" ? 900 : 300)) * 1000;
    const settleMs = (cfg.calmaSeg ?? 12) * 1000;
    let lastKey = "", calmSince = Date.now(), sawBusy = false, sawGen = false, lastLog = 0;
    while (true) {
      if (!(await get()).rodando) return { status: "parado" };
      await sleep(1000);
      const s = snap();
      if (s.busy) sawBusy = true;
      if (s.pct > 0) sawGen = true;
      const key = `${s.msgs}|${s.lastLen}|${s.media}|${s.busy}`;
      if (key !== lastKey) { lastKey = key; calmSince = Date.now(); }
      const el = Date.now() - t0;
      if (Date.now() - lastLog > 15000) {
        lastLog = Date.now();
        log(`  ${Math.round(el / 1000)} s · msgs ${s.msgs} · mídias ${s.media} (antes ${before.media}) · gerando ${s.pct} · falhas ${s.failed} · ocupado ${s.busy ? "sim" : "não"} · botão "${s.btnLabel}"`);
      }
      const answered = s.msgs > before.msgs || s.lastLen !== before.lastLen;
      const calm = !s.busy && Date.now() - calmSince >= settleMs;
      if (s.failed > before.failed && calm) return { status: "erro", msg: "o Flow mostrou falha na geração" };
      if (el >= minMs && answered && calm) {
        if (s.media > before.media || sawGen) return { status: "ok", msg: s.media > before.media ? `+${s.media - before.media} mídia(s)` : "geração vista e terminada" };
        return { status: "pergunta", msg: "o agente respondeu sem gerar: " + s.lastTxt.replace(/\s+/g, " ").slice(-120) };
      }
      if (el > maxMs) return { status: "erro", msg: `passou de ${Math.round(maxMs / 1000)} s sem terminar` };
    }
  }

  // ---------- baixar ao terminar: o que esta fila gerou ----------
  // No início, guarda a "digital" (miniatura /asb/<id>) de cada card que já existe, com a galeria no topo.
  // No fim, os cards novos (que não estavam lá) do tipo certo, limitados à quantidade que a fila gerou, vão para o ⬇ Baixar.
  const dl = () => window.__kfDl;
  async function topoDaGaleria() {
    window.scrollTo({ top: 0, behavior: "instant" });
    dl()?.scroller?.()?.scrollTo?.({ top: 0, behavior: "instant" });
    await sleep(1200);
  }
  async function fotografarGaleria() {
    const st = await get();
    if (st.base && st.base.length && st.fila.some((x) => x.status === "feito")) return; // retomada: mantém a foto do começo
    if (!dl()) return;
    await topoDaGaleria();
    st.base = dl().allTiles().map(dl().mediaId).filter(Boolean);
    await put(st);
    await log(`📸 galeria fotografada: ${st.base.length} arquivos que já existiam`);
  }
  async function baixarGerados() {
    const st = await get(); const cfg = st.cfg || {};
    if (!dl()) return log("⚠ não achei o módulo de download; recarregue o Flow (F5)");
    const nVid = st.fila.filter((x) => x.status === "feito" && x.tipo === "video").length;
    const nImg = cfg.baixarImagens ? st.fila.filter((x) => x.status === "feito" && x.tipo === "imagem").length : 0;
    if (!nVid && !nImg) return log("nada para baixar (nenhum vídeo gerado com ✔)");
    await log(`⏳ esperando 20 s para o Flow terminar as miniaturas e depois baixar ${nVid} vídeo(s)${nImg ? ` e ${nImg} imagem(ns)` : ""}`);
    await sleep(20000);
    await topoDaGaleria();
    const base = new Set(st.base || []);
    const keys = dl().tileKeys();
    const escolhidos = []; let v = 0, im = 0;
    for (const tl of dl().allTiles()) {
      if (!dl().isReady(tl)) continue;
      const id = dl().mediaId(tl); if (!id || base.has(id)) continue;
      const k = dl().kindOf(tl);
      if (k === "video" && v < nVid) { escolhidos.push(keys.get(tl)); v++; }
      else if (k === "image" && im < nImg) { escolhidos.push(keys.get(tl)); im++; }
    }
    if (!escolhidos.length) return log("⚠ não encontrei os arquivos novos no topo da galeria; use a aba ⬇ Baixar");
    const { kfSettings } = await chrome.storage.local.get("kfSettings");
    const ok = dl().startWithKeys(escolhidos, { ...(kfSettings || {}), includeImages: !!cfg.baixarImagens });
    await log(ok ? `⬇ baixando ${escolhidos.length} arquivo(s) gerados por esta fila (confira os azuis na galeria)` : "⚠ o download já estava rodando; tente pela aba ⬇ Baixar");
    const s2 = await get(); s2.base = []; await put(s2);
  }

  // ---------- laço ----------
  async function run() {
    if (running) return;
    running = true;
    await log("▶ fila iniciada nesta aba");
    await fotografarGaleria();
    try {
      while (true) {
        const st = await get();
        if (!st.rodando) { await log("⏸ fila pausada"); break; }
        const i = st.fila.findIndex((x) => x.status === "pendente");
        if (i < 0) {
          st.rodando = false; await put(st); await log("✔ fila concluída");
          if ((st.cfg || {}).baixarAoFim !== false) await baixarGerados();
          break;
        }
        const it = st.fila[i];
        await setItem(i, { status: "enviando", msg: "" });
        await log(`→ ${it.cod} (${it.tipo})`);
        try {
          const before = snap();
          await typeText(it.texto);
          await clickSend();
          await setItem(i, { status: "gerando", inicio: Date.now() });
          const r = await waitDone(before, it.tipo, st.cfg || {});
          if (r.status === "parado") { await setItem(i, { status: "pendente", msg: "interrompido; reenviar?" }); continue; }
          await setItem(i, { status: r.status === "ok" ? "feito" : r.status, msg: r.msg || "" });
          await log(`${r.status === "ok" ? "✔" : "⚠"} ${it.cod}: ${r.status} ${r.msg || ""}`);
          if (r.status !== "ok") { const s2 = await get(); s2.rodando = false; await put(s2); await log("⏸ pausei para você conferir/responder no Flow"); break; }
        } catch (e) {
          await setItem(i, { status: "erro", msg: String(e.message || e) });
          await log(`✖ ${it.cod}: ${e.message || e}`);
          const s2 = await get(); s2.rodando = false; await put(s2);
          break;
        }
        await sleep(((st.cfg || {}).pausaSeg ?? 4) * 1000);
      }
    } finally { running = false; }
  }

  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (m?.kfAgente === "start") { run(); reply({ ok: true }); }
    if (m?.kfAgente === "ping") reply({ ok: true, box: !!box(), send: !!sendBtn(), snap: snap() });
    return false;
  });
})();
