// KbidFlow - roda dentro do Google Flow (flow.google.com / labs.google). Só baixa.
// Para cada vídeo: abre ⋮ > Download > 1080p, espera o Flow fazer o upscale e o Chrome iniciar o download,
// e só então passa para o próximo.
// Seletores do Flow (Angular Material):
//   tiles <flow-video-tile>/<flow-image-tile>, menu button[aria-label="More options"] (ícone more_vert),
//   itens [role="menuitem"], qualidades com .label/.caption, fechar menu clicando .cdk-overlay-backdrop.

(() => {
  if (window.__kbidflow) return;
  window.__kbidflow = true;

  const TAG = "[KbidFlow]";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TILE_SEL = "flow-video-tile, flow-image-tile";
  const ICON_SEL = "mat-icon, i, [class*='material-symbols'], [class*='material-icons'], [class*='google-symbols']";
  const FAIL_WORDS = /fail|couldn't|could not|unable to|went wrong|error|fall[óo]|no se pudo|falh|não foi possível|erro/i;
  const PERCENT_RE = /^\s*\d{1,3}\s?%\s*$/;

  const S = {
    running: false,
    stop: false,
    mode: null,
    armSeq: 0,
    gotArm: null,
    dlState: new Map(),
    done: 0,
    failed: 0,
    total: 0,
  };

  // ---------- comunicação ----------
  const send = (m) => chrome.runtime.sendMessage(m).catch(() => {});
  function log(msg, level = "info") {
    console.log(TAG, msg);
    send({ kf: "log", msg, level, at: Date.now() });
  }
  function status(text) {
    S.statusText = text || S.statusText || "";
    send({
      kf: "status",
      running: S.running,
      mode: S.mode,
      text: S.statusText,
      done: S.done,
      failed: S.failed,
      total: S.total,
      pickMode: S.pickMode,
      picked: S.picked ? S.picked.size : 0,
    });
    paintBadge();
  }


  // ---------- utilidades de DOM ----------
  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  async function waitFor(fn, ms = 3000, step = 100) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (S.stop) return null;
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }
  function hover(el) {
    const r = el.getBoundingClientRect();
    const o = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      pointerType: "mouse",
    };
    el.dispatchEvent(new PointerEvent("pointerover", o));
    el.dispatchEvent(new MouseEvent("mouseover", o));
    el.dispatchEvent(new MouseEvent("mouseenter", { ...o, bubbles: false }));
    el.dispatchEvent(new PointerEvent("pointermove", o));
    el.dispatchEvent(new MouseEvent("mousemove", o));
  }
  const iconNames = (el) => [...el.querySelectorAll(ICON_SEL)].map((i) => (i.textContent || "").trim());
  const showsIcon = (el, names) =>
    iconNames(el).some((n) => names.includes(n)) || names.includes((el.textContent || "").trim());
  function labelOf(el) {
    const parts = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walk.nextNode())
      if (!walk.currentNode.parentElement?.closest(ICON_SEL)) parts.push(walk.currentNode.textContent);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }
  const isDisabled = (el) =>
    el.disabled ||
    el.getAttribute("aria-disabled") === "true" ||
    el.classList.contains("mat-mdc-menu-item-disabled") ||
    el.classList.contains("mat-mdc-button-disabled");

  // ---------- tiles ----------
  const kindOf = (t) => (t.tagName === "FLOW-IMAGE-TILE" ? "image" : "video");
  const moreButton = (tile) =>
    tile.querySelector('button[aria-label="More options"]') ||
    [...tile.querySelectorAll("button")].find((b) => showsIcon(b, ["more_vert", "more_horiz"])) ||
    null;
  function showsPercent(t) {
    const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) if (PERCENT_RE.test(walk.currentNode.textContent)) return true;
    return false;
  }
  function isFailedTile(t) {
    if (t.querySelector("flow-error-tile") || /failed to generate|falha ao gerar/i.test(t.textContent || ""))
      return true;
    return !moreButton(t) && FAIL_WORDS.test(t.textContent || "");
  }
  const isGenerating = (t) => !isFailedTile(t) && (!moreButton(t) || showsPercent(t));
  const isReady = (t) => !!moreButton(t) && !isFailedTile(t) && !isGenerating(t);
  const allTiles = () => [...document.querySelectorAll(TILE_SEL)];
  const getGenerating = () => allTiles().filter(isGenerating);
  function tileName(t) {
    const n =
      t.querySelector('button[aria-haspopup="true"]')?.getAttribute("aria-label") ||
      (kindOf(t) === "image" ? "imagem" : "video");
    return n.replace(/…$/, "").trim();
  }
  // O Flow não tem id estável no DOM: a chave é título + posição entre tiles de mesmo título.
  function tileKeys() {
    const per = new Map();
    const keys = new Map();
    for (const t of allTiles()) {
      const title = tileName(t);
      const i = per.get(title) || 0;
      per.set(title, i + 1);
      keys.set(t, `${title}#${i}`);
    }
    return keys;
  }

  // ---------- menus ----------
  const visibleMenuItems = () => [...document.querySelectorAll('[role="menuitem"]')].filter(visible);
  function findDownloadItem() {
    return (
      visibleMenuItems().find((m) => {
        const text = (m.textContent || "").replace(/\s+/g, " ").trim();
        return showsIcon(m, ["download"]) || /^download(?![a-z_])/.test(text) || /(Download|Baixar|Fazer download)$/i.test(text);
      }) || null
    );
  }
  async function closeMenus() {
    for (let i = 0; i < 3 && visibleMenuItems().length; i++) {
      const backdrop = document.querySelector(".cdk-overlay-backdrop");
      if (backdrop) backdrop.click();
      else document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(300);
    }
  }
  function readQualityItems() {
    return visibleMenuItems()
      .map((el) => {
        const label = (el.querySelector(".label")?.textContent || el.textContent || "").trim().split(/\s+/)[0];
        if (!/^(\d{3,4}p|\dK)$/i.test(label)) return null;
        const caption = (el.querySelector(".caption")?.textContent || "").trim();
        const enabled = !isDisabled(el) && !/upgrade|fazer upgrade/i.test(el.textContent || "");
        return { el, label: label.replace(/k$/, "K"), caption, enabled };
      })
      .filter(Boolean);
  }
  const sameQ = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  async function openDownloadMenu(tile) {
    const more = moreButton(tile);
    if (!more) return false;
    hover(tile);
    await sleep(200);
    more.click();
    if (await waitFor(findDownloadItem, 2000)) return true;
    await closeMenus();
    hover(tile);
    more.click();
    return !!(await waitFor(findDownloadItem, 2500));
  }
  async function openQualityItem(label) {
    const dl = findDownloadItem();
    if (!dl) return {};
    dl.click();
    const pick = () => {
      const all = readQualityItems();
      return all.length ? all : null;
    };
    let all = await waitFor(pick, 2000);
    if (!all) {
      hover(dl);
      all = await waitFor(pick, 2000);
    }
    if (!all) return {};
    const hit = all.find((q) => sameQ(q.label, label));
    return hit ? { item: hit, all } : { offered: all.map((q) => q.label), all };
  }

  // ---------- avisos e diálogos do Flow ----------
  const NOTICE_SEL =
    'mat-snack-bar-container, .mat-mdc-snack-bar-container, [role="alert"], [role="status"], [aria-live="assertive"], [aria-live="polite"]';
  const noticeText = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  const flowNotices = () =>
    [...document.querySelectorAll(NOTICE_SEL)].filter(
      (el) => visible(el) && !el.closest(TILE_SEL) && !el.closest("#kbidflow-badge"),
    );
  const noticesNow = () => new Map(flowNotices().map((el) => [el, noticeText(el)]));
  function newFailureNotice(before) {
    for (const el of flowNotices()) {
      const text = noticeText(el);
      if (text && before.get(el) !== text && FAIL_WORDS.test(text)) return text;
    }
    return null;
  }
  const flowDialogs = () =>
    [
      ...document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], mat-dialog-container, .mat-mdc-dialog-container',
      ),
    ].filter(visible);
  const CANCEL_RE = /^(cancel|cancelar|não|no|close|fechar|voltar|back)$/i;
  const UPGRADE_RE = /upgrade|buy|comprar|assinar|subscribe/i;
  // Se o Flow abrir uma pergunta (ex.: "o upscale 4K usa 50 créditos"), só confirma quando o usuário permitiu créditos.
  async function handleFlowQuestion(before) {
    const dlg = await waitFor(() => flowDialogs().find((d) => !before.has(d)), 1500);
    if (!dlg) return null;
    const text = noticeText(dlg).slice(0, 200);
    const btns = [...dlg.querySelectorAll("button")].filter(visible);
    const cancel = btns.find((b) => CANCEL_RE.test(labelOf(b) || b.getAttribute("aria-label") || ""));
    const confirm = btns.filter((b) => b !== cancel && !UPGRADE_RE.test(labelOf(b))).pop();
    if (S.settings.allowCredits && confirm) {
      log(`Flow perguntou: "${text}" → confirmado (créditos permitidos)`, "warn");
      confirm.click();
      return null;
    }
    if (cancel) cancel.click();
    else document.querySelector(".cdk-overlay-backdrop")?.click();
    return `o Flow pediu confirmação ("${text}") e os créditos não estão liberados`;
  }

  // ---------- aba precisa estar visível (o Chrome congela menus em abas de fundo) ----------
  async function waitUntilVisible() {
    if (!document.hidden || S.stop) return;
    status("⏸ Pausado: volte para a aba do Flow");
    while (document.hidden && !S.stop) await sleep(1000);
    if (!S.stop) {
      status("Continuando…");
      await sleep(1200);
    }
  }

  // ---------- download de um tile ----------
  async function expectDownload(armId, name) {
    S.gotArm = null;
    try {
      await chrome.runtime.sendMessage({ kf: "expectDownload", armId, name, folder: S.settings.folder });
    } catch {}
  }
  async function waitForDownload(armId, notices, label) {
    const timeoutMs = (Number(S.settings.timeoutMin) || 10) * 60000;
    const start = Date.now();
    while (!S.stop) {
      if (S.gotArm === armId) return { ok: true };
      const failed = newFailureNotice(notices);
      if (failed) return { ok: false, err: "o Flow avisou: " + failed.slice(0, 120) };
      if (Date.now() - start > timeoutMs) return { ok: false, err: `não começou em ${S.settings.timeoutMin} min` };
      const s = Math.round((Date.now() - start) / 1000);
      status(`${label}: esperando o upscale ${S.settings.quality} (${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")})`);
      await sleep(1000);
    }
    return { ok: false, err: "parado" };
  }

  const UNAVAILABLE = "INDISPONIVEL";
  async function processTile(tile, label, fileName, allowFallback = false) {
    await waitUntilVisible();
    if (S.stop) return "parado";
    tile.scrollIntoView({ block: "center", behavior: "instant" });
    await sleep(600);
    const kind = kindOf(tile);
    const q = kind === "image" ? S.settings.imageQuality || "2K" : S.settings.quality || "1080p";
    status(`${label}: abrindo o menu`);
    if (!(await openDownloadMenu(tile))) {
      await closeMenus();
      return "o menu ⋮ > Download não abriu";
    }
    const r = await openQualityItem(q);
    const offered = (r.all || []).map((x) => `${x.label}${x.enabled ? "" : " (bloqueado)"}`).join(", ");
    let item = r.item && r.item.enabled ? r.item : null;
    if (!item && r.all && allowFallback) {
      const order = kind === "image" ? ["2K", "1K"] : ["720p"];
      item = order.map((l) => r.all.find((x) => x.enabled && sameQ(x.label, l))).find(Boolean) || null;
      if (item) log(`⚠️ ${label}: ${q} continua bloqueado, baixando em ${item.label} (opção ligada nos Ajustes)`, "warn");
    }
    if (!item) {
      await closeMenus();
      if (!r.all) return "o submenu de qualidade não abriu";
      return `${UNAVAILABLE}: ${q} não está liberado agora (o Flow mostra: ${offered || "nada"})`;
    }
    if (!sameQ(item.label, q) && !allowFallback) {
      await closeMenus();
      return `${UNAVAILABLE}: ${q} não está liberado agora (o Flow mostra: ${offered})`;
    }
    if (document.hidden) {
      await closeMenus();
      return "aba ficou oculta";
    }
    S.lastQ = item.label;
    const armId = ++S.armSeq;
    await expectDownload(armId, fileName);
    const before = new Set(flowDialogs());
    const notices = noticesNow();
    item.el.click();
    const blocked = await handleFlowQuestion(before);
    if (blocked) {
      await closeMenus();
      await expectDownload(null);
      return blocked;
    }
    await sleep(600);
    await closeMenus();
    const res = await waitForDownload(armId, notices, label);
    if (!res.ok) {
      await expectDownload(null);
      return res.err;
    }
    // espera o arquivo terminar de gravar (até 3 min) antes de seguir
    await waitFor(() => S.dlState.get(armId), 180000, 500);
    return null;
  }

  // Quando o Flow bloqueia a qualidade por um tempo (ex.: limite de upscale), espera e tenta de novo em vez de baixar
  // pior. Só cai para 720p no fim se "fallback720" estiver ligado.
  const UNAVAILABLE_WAITS = [30, 60, 120, 240];
  async function downloadTile(tile, label, fileName) {
    let err = null;
    let waits = 0;
    for (let attempt = 0; attempt < 3 + UNAVAILABLE_WAITS.length; attempt++) {
      err = await processTile(tile, label, fileName);
      if (!err || S.stop) break;
      if (err.startsWith(UNAVAILABLE)) {
        if (waits < UNAVAILABLE_WAITS.length) {
          const sec = UNAVAILABLE_WAITS[waits++];
          log(`⏳ ${label}: ${err.slice(UNAVAILABLE.length + 2)}. Esperando ${sec} s e tentando de novo (${waits}/${UNAVAILABLE_WAITS.length})`, "warn");
          for (let s = sec; s > 0 && !S.stop; s--) {
            status(`${label}: ${S.settings.quality} bloqueado, nova tentativa em ${s} s`);
            await sleep(1000);
          }
          continue;
        }
        if (S.settings.fallback720) {
          err = await processTile(tile, label, fileName, true);
          if (err?.startsWith(UNAVAILABLE)) err = err.slice(UNAVAILABLE.length + 2);
        } else err = err.slice(UNAVAILABLE.length + 2) + " — pulado depois de 4 tentativas";
        break;
      }
      if (/aba ficou oculta/.test(err)) {
        await waitUntilVisible();
        continue;
      }
      if (/o Flow avisou/.test(err) && attempt === 0) {
        log(`${label}: ${err}. Tentando de novo em 4 s`, "warn");
        await sleep(4000);
        continue;
      }
      break;
    }
    return err;
  }

  // ---------- seleção: caixinha sobre cada tile (camada própria, o Flow redesenha os tiles) ----------
  S.pickMode = false;
  S.picked = new Set(); // chaves dos tiles marcados
  let pickLayer = null;
  const pickBoxes = new Map(); // chave -> caixinha
  const stopEvt = (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  };
  function paintPicks() {
    if (!S.pickMode || S.running) {
      if (pickLayer) {
        pickLayer.remove();
        pickLayer = null;
        pickBoxes.clear();
      }
      return;
    }
    if (!pickLayer) {
      pickLayer = document.createElement("div");
      pickLayer.id = "kbidflow-picks";
      pickLayer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483646";
      document.documentElement.appendChild(pickLayer);
    }
    const keys = tileKeys();
    const live = new Set();
    for (const t of allTiles()) {
      if (!isReady(t)) continue;
      const k = keys.get(t);
      live.add(k);
      let box = pickBoxes.get(k);
      if (!box) {
        box = document.createElement("div");
        ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick"].forEach((ev) => box.addEventListener(ev, stopEvt));
        box.addEventListener("click", (e) => {
          stopEvt(e);
          e.preventDefault();
          const kk = box.dataset.key;
          S.picked.has(kk) ? S.picked.delete(kk) : S.picked.add(kk);
          paintPicks();
          status();
        });
        pickLayer.appendChild(box);
        pickBoxes.set(k, box);
      }
      box.dataset.key = k;
      const r = t.getBoundingClientRect();
      const on = S.picked.has(k);
      const shown = r.width > 0 && r.bottom > 0 && r.top < innerHeight;
      box.textContent = on ? "✓" : "";
      box.title = on ? "Marcado para baixar" : "Marcar para baixar";
      box.style.cssText =
        `position:absolute;left:${r.right - 44}px;top:${r.bottom - 44}px;width:34px;height:34px;border-radius:9px;` +
        "box-sizing:border-box;pointer-events:auto;align-items:center;justify-content:center;cursor:pointer;" +
        "font:800 20px system-ui;box-shadow:0 2px 8px rgba(0,0,0,.6);user-select:none;" +
        `display:${shown ? "flex" : "none"};` +
        (on
          ? "background:#f5a524;color:#111;border:2px solid #fff;"
          : "background:rgba(20,20,20,.7);color:#fff;border:2px solid rgba(255,255,255,.85);");
    }
    for (const [k, b] of pickBoxes)
      if (!live.has(k)) {
        b.remove();
        pickBoxes.delete(k);
      }
  }
  setInterval(paintPicks, 300);
  addEventListener("scroll", paintPicks, { capture: true, passive: true });
  addEventListener("resize", paintPicks);
  function setPick(on) {
    S.pickMode = !!on;
    paintPicks();
  }
  function pickAllVisible(includeImages) {
    const keys = tileKeys();
    for (const t of allTiles())
      if (isReady(t) && (includeImages || kindOf(t) === "video")) S.picked.add(keys.get(t));
    paintPicks();
  }

  // ---------- histórico (para "só os ainda não baixados") ----------
  const histKey = () => "kfSaved:" + location.pathname;
  async function loadHistory() {
    const k = histKey();
    return new Set((await chrome.storage.local.get(k))[k] || []);
  }
  async function addHistory(key) {
    const k = histKey();
    const list = (await chrome.storage.local.get(k))[k] || [];
    if (!list.includes(key)) list.push(key);
    await chrome.storage.local.set({ [k]: list.slice(-5000) });
  }

  // A área que rola de verdade (a galeria do Flow tem rolagem própria; se não houver, a página).
  function scroller() {
    let n = allTiles()[0]?.parentElement;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 10) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  // ---------- percorre os tiles e baixa um por vez ----------
  // pickTarget(tile, key) → null (pular) ou { fileName } ; ordem: a do grid do Flow (mais novo primeiro)
  async function runDownloads(pickTarget, expected) {
    const seen = new Set();
    let emptyPasses = 0;
    let n = 0;
    const startHref = location.href;
    await closeMenus();
    window.scrollTo({ top: 0, behavior: "instant" });
    scroller().scrollTo?.({ top: 0, behavior: "instant" });
    await sleep(800);
    while (!S.stop) {
      if (location.href !== startHref) {
        log("O projeto mudou, parando.", "error");
        break;
      }
      if (expected && n >= expected) break;
      const keys = tileKeys();
      const tiles = allTiles().filter(isReady);
      let next = null;
      let target = null;
      for (const t of tiles) {
        const k = keys.get(t);
        if (seen.has(k)) continue;
        seen.add(k);
        const tg = pickTarget(t, k);
        if (tg) {
          next = t;
          target = { ...tg, key: k };
          break;
        }
      }
      if (!next) {
        // A galeria do Flow rola dentro de uma área própria e carrega mais tiles aos poucos.
        const sc = scroller();
        const before = sc.scrollTop;
        tiles[tiles.length - 1]?.scrollIntoView({ block: "end" });
        sc.scrollBy?.({ top: sc.clientHeight * 0.8 });
        window.scrollBy({ top: window.innerHeight * 0.8 });
        let grew = false;
        for (let i = 0; i < 8 && !grew && !S.stop; i++) {
          await sleep(500);
          const after = tileKeys();
          grew = allTiles().some((t) => isReady(t) && !seen.has(after.get(t)));
        }
        if (grew) {
          emptyPasses = 0;
          continue;
        }
        const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 8;
        if (sc.scrollTop === before || atBottom) emptyPasses++;
        if (emptyPasses >= 3) {
          const generating = getGenerating().length;
          log(`Fim da galeria: ${seen.size} itens vistos${generating ? `, ${generating} ainda gerando (não baixados)` : ""}.`);
          break;
        }
        continue;
      }
      emptyPasses = 0;
      n++;
      const label = `#${n}${S.total ? "/" + S.total : ""} "${tileName(next).slice(0, 40)}"`;
      markTile(next, "active");
      const err = await downloadTile(next, label, target.fileName);
      if (S.stop) break;
      if (err) {
        S.failed++;
        markTile(next, "fail");
        log(`❌ ${label}: ${err}`, "error");
      } else {
        S.done++;
        markTile(next, "ok");
        await addHistory(target.key);
        log(`✅ ${label} salvo em ${S.lastQ} como ${target.fileName}`, S.lastQ === S.settings.quality || kindOf(next) === "image" ? "success" : "warn");
      }
      status();
      const gap = (Number(S.settings.gapSec) || 0) * 1000;
      if (gap) await sleep(gap);
    }
  }

  const pad = (n) => String(n).padStart(3, "0");
  // Nome do arquivo: o título do vídeo no Flow (ex.: v4_t03.mp4, renomeado pela página guia) ou "001 - título".
  const arquivoDe = (t, num) =>
    S.settings.nameByTitle === false
      ? `${S.settings.prefix || ""}${pad(num)} - ${shortTitle(tileName(t))}`
      : `${S.settings.prefix || ""}${shortTitle(tileName(t))}`;
  const shortTitle = (s) => s.replace(/[\\/]+/g, " ").slice(0, 60).trim();

  async function startDownloadAll() {
    // Com vídeos marcados, baixa só eles (na ordem do grid), ignorando "quantos" e o histórico.
    if (S.pickMode && S.picked.size) {
      const wanted = new Set(S.picked);
      const startNum = Number(S.settings.startNumber) || 1;
      let count = 0;
      S.total = wanted.size;
      status(`Baixando ${wanted.size} marcados`);
      await runDownloads((t, key) => {
        if (!wanted.has(key)) return null;
        count++;
        return { fileName: arquivoDe(t, startNum + count - 1) };
      }, wanted.size);
      if (!S.stop) {
        S.picked.clear();
        S.pickMode = false;
      }
      return;
    }
    const hist = S.settings.skipSaved ? await loadHistory() : new Set();
    const limit = Number(S.settings.limit) || 0;
    const includeImages = !!S.settings.includeImages;
    let count = 0;
    const startNum = Number(S.settings.startNumber) || 1;
    const keys0 = tileKeys();
    const pending = allTiles().filter(
      (t) => isReady(t) && (includeImages || kindOf(t) === "video") && !hist.has(keys0.get(t)),
    ).length;
    S.total = limit ? Math.min(limit, pending) || limit : pending;
    status(`Baixando ${limit ? limit : "todos os"} itens`);
    await runDownloads((t, key) => {
      if (!includeImages && kindOf(t) !== "video") return null;
      if (hist.has(key)) return null;
      if (limit && count >= limit) return null;
      count++;
      const num = startNum + count - 1;
      return { fileName: arquivoDe(t, num) };
    }, limit || 0);
  }

  // ---------- selo visual no Flow ----------
  const tileMarks = new WeakMap();
  function markTile(t, state) {
    const color = { active: "#fbbc04", ok: "#34a853", fail: "#ea4335" }[state];
    t.style.outline = `3px solid ${color}`;
    t.style.outlineOffset = "-3px";
    tileMarks.set(t, state);
  }
  let badge = null;
  function showBadge(text) {
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "kbidflow-badge";
      badge.style.cssText =
        "position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#111827;color:#fff;font:13px/1.4 system-ui,sans-serif;" +
        "padding:10px 12px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);max-width:340px;display:flex;gap:10px;align-items:center";
      const span = document.createElement("span");
      const stop = document.createElement("button");
      stop.textContent = "Parar";
      stop.style.cssText = "background:#ea4335;color:#fff;border:0;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit";
      stop.onclick = () => stopRun();
      badge.append(span, stop);
      document.documentElement.appendChild(badge);
    }
    badge.firstChild.textContent = text;
    badge.lastChild.style.display = S.running ? "" : "none";
    badge.style.display = "flex";
  }
  function hideBadgeSoon() {
    setTimeout(() => {
      if (!S.running && badge) badge.style.display = "none";
    }, 3000);
  }
  function paintBadge() {
    if (S.running) showBadge(`KbidFlow · ${S.statusText || ""}`);
  }

  // ---------- execução ----------
  const onBeforeUnload = (e) => {
    e.preventDefault();
    e.returnValue = "";
  };
  async function run(mode, settings) {
    if (S.running) return { ok: false, error: "Já está rodando" };
    S.running = true;
    S.stop = false;
    S.mode = mode;
    S.settings = settings || {};
    S.done = S.failed = S.total = 0;
    S.dlState.clear();
    window.addEventListener("beforeunload", onBeforeUnload);
    const oldTitle = document.title;
    status("Iniciando downloads");
    (async () => {
      try {
        await startDownloadAll();
      } catch (e) {
        log("Erro: " + (e?.message || e), "error");
      } finally {
        S.running = false;
        window.removeEventListener("beforeunload", onBeforeUnload);
        document.title = oldTitle;
        const msg = S.stop ? "Parado" : `Concluído: ${S.done} ok, ${S.failed} com erro`;
        log(msg, S.failed ? "warn" : "success");
        status(msg);
        showBadge(`KbidFlow · ${msg}`);
        hideBadgeSoon();
        chrome.runtime.sendMessage({ kf: "expectDownload", armId: null }).catch(() => {});
      }
    })();
    return { ok: true };
  }
  function stopRun() {
    S.stop = true;
    closeMenus();
    status("Parando…");
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.kf === "gotArm") {
      S.gotArm = msg.armId;
      return false;
    }
    if (msg?.kf === "dlState") {
      S.dlState.set(msg.armId, msg.state);
      return false;
    }
    if (msg?.kf !== "cmd") return false;
    (async () => {
      switch (msg.action) {
        case "ping": {
          const tiles = allTiles();
          return {
            ok: true,
            running: S.running,
            mode: S.mode,
            text: S.statusText,
            done: S.done,
            failed: S.failed,
            total: S.total,
            videos: tiles.filter((t) => kindOf(t) === "video" && isReady(t)).length,
            images: tiles.filter((t) => kindOf(t) === "image" && isReady(t)).length,
            generating: getGenerating().length,
            pickMode: S.pickMode,
            picked: S.picked.size,
          };
        }
        case "pick":
          setPick(msg.on);
          return { ok: true };
        case "pickAll":
          setPick(true);
          pickAllVisible(!!msg.includeImages);
          return { ok: true, picked: S.picked.size };
        case "pickClear":
          S.picked.clear();
          paintPicks();
          return { ok: true };
        case "download":
          return run("download", msg.settings);
        case "stop":
          stopRun();
          return { ok: true };
        case "clearHistory":
          await chrome.storage.local.remove(histKey());
          return { ok: true };
        default:
          return { ok: false, error: "comando desconhecido" };
      }
    })().then(sendResponse, (e) => sendResponse({ ok: false, error: e?.message || String(e) }));
    return true;
  });

  log("pronto nesta aba do Flow");
})();
