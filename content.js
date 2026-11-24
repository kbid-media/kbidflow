// KbidFlow - roda dentro do Google Flow (flow.google.com / labs.google).
// Gera: digita cada prompt na caixa do próprio Flow e clica no botão de enviar, respeitando um limite de gerações
//        ao mesmo tempo (o Flow resolve o próprio reCAPTCHA, como se fosse você clicando).
// Baixa: para cada vídeo, abre ⋮ > Download > 1080p, espera o Flow fazer o upscale e o Chrome iniciar o download,
//        e só então passa para o próximo.
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
    calib: {},
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

  chrome.storage.local.get("kfCalib").then((s) => (S.calib = s.kfCalib || {}));

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
        return { fileName: `${S.settings.prefix || ""}${pad(startNum + count - 1)} - ${shortTitle(tileName(t))}` };
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
      return { fileName: `${S.settings.prefix || ""}${pad(num)} - ${shortTitle(tileName(t))}` };
    }, limit || 0);
  }

  // ---------- geração ----------
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/…$/, "")
      .replace(/\s+/g, " ")
      .trim();

  function sigOf(el) {
    return {
      tag: el.tagName,
      aria: el.getAttribute("aria-label") || "",
      ph: el.getAttribute("placeholder") || el.getAttribute("data-placeholder") || "",
      icons: iconNames(el).join("|"),
      label: labelOf(el).slice(0, 40),
    };
  }
  function sigMatch(el, s) {
    if (!s || el.tagName !== s.tag) return false;
    const sg = sigOf(el);
    return (
      (s.aria && sg.aria === s.aria) ||
      (s.ph && sg.ph === s.ph) ||
      (s.icons && sg.icons === s.icons && (!s.label || sg.label === s.label)) ||
      (!s.icons && s.label && sg.label === s.label)
    );
  }
  function promptCandidates() {
    return [
      ...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], input[type="text"]'),
    ].filter((el) => visible(el) && !el.closest(TILE_SEL) && !el.closest("#kbidflow-badge"));
  }
  function findPromptBox() {
    const c = promptCandidates();
    if (S.calib.prompt) {
      const m = c.find((el) => sigMatch(el, S.calib.prompt));
      if (m) return m;
    }
    const PH = /criar|create|imagine|describe|descrev|prompt|o que você/i;
    const ph = c.find((el) =>
      PH.test(
        [el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.getAttribute("data-placeholder")].join(" "),
      ),
    );
    if (ph) return ph;
    return c.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] || null;
  }
  const SEND_ICONS = ["arrow_forward", "arrow_upward", "send", "north", "arrow_right_alt"];
  const SEND_RE = /^(criar|create|gerar|generate|enviar|send|submit)$/i;
  function findSendButton(box) {
    const all = [...document.querySelectorAll("button")].filter(visible);
    if (S.calib.send) {
      const m = all.find((b) => sigMatch(b, S.calib.send));
      if (m) return m;
    }
    let c = box;
    for (let i = 0; i < 10 && c; i++, c = c.parentElement) {
      const b = [...c.querySelectorAll("button")]
        .filter(visible)
        .find((b) => showsIcon(b, SEND_ICONS) || SEND_RE.test((b.getAttribute("aria-label") || "").trim()));
      if (b) return b;
    }
    return null;
  }
  const boxText = (el) => (el.value !== undefined ? el.value : el.innerText || "").trim();
  async function setPrompt(el, text) {
    el.focus();
    await sleep(120);
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand("insertText", false, text);
    }
    await sleep(300);
    return norm(boxText(el)).startsWith(norm(text).slice(0, 20));
  }

  async function submitPrompt(text, label) {
    const box = await waitFor(findPromptBox, 15000, 300);
    if (!box) return "caixa de prompt não encontrada (use Calibrar)";
    if (!(await setPrompt(box, text))) return "não consegui escrever na caixa de prompt (use Calibrar)";
    const btn = await waitFor(() => {
      const b = findSendButton(box);
      return b && !isDisabled(b) ? b : null;
    }, 8000, 200);
    const genBefore = getGenerating().length;
    const tilesBefore = allTiles().length;
    if (btn) btn.click();
    else {
      log(`${label}: botão de enviar não achado, tentando Enter`, "warn");
      box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
    }
    const ok = await waitFor(
      () => getGenerating().length > genBefore || allTiles().length > tilesBefore || !boxText(box),
      20000,
      400,
    );
    if (!ok) return "o Flow não aceitou o envio (confira configurações e créditos)";
    return null;
  }

  // ---------- continuar do último frame (tudo pelos botões do próprio Flow) ----------
  // Abre o vídeo anterior no editor, vai ao fim (Pular para o próximo clipe), clica em "Salvar frame",
  // volta para a galeria e põe "Frame salvo de <título>" no Início da caixa de comando.
  const visibleButtons = () => [...document.querySelectorAll("button")].filter(visible);
  const flowButton = (arias, icons) =>
    visibleButtons().find((b) => {
      const a = b.getAttribute("aria-label") || "";
      return arias.some((x) => a.includes(x)) || showsIcon(b, icons);
    }) || null;
  const findStartChip = () =>
    [...document.querySelectorAll("button.empty-chip")].filter(visible).find((b) => /^(Início|Inicio|Start)$/i.test((b.innerText || "").trim())) || null;
  const filledStartChip = () =>
    [...document.querySelectorAll("button.chip-container")].filter(visible).find((b) => b.querySelector("img")) || null;
  const overlay = () => [...document.querySelectorAll(".cdk-overlay-pane")].filter(visible).pop() || null;

  const titleCounts = () => {
    const m = new Map();
    for (const t of allTiles()) if (kindOf(t) === "video") m.set(tileName(t), (m.get(tileName(t)) || 0) + 1);
    return m;
  };
  // Tiles de vídeo que não existiam no retrato `before` (o grid mostra o mais novo primeiro).
  function newVideoTiles(before) {
    const seen = new Map();
    const out = [];
    const now = titleCounts();
    for (const t of allTiles()) {
      if (kindOf(t) !== "video") continue;
      const n = tileName(t);
      const i = (seen.get(n) || 0) + 1;
      seen.set(n, i);
      const extra = (now.get(n) || 0) - (before.get(n) || 0);
      if (i <= extra) out.push(t);
    }
    return out;
  }
  async function waitNewVideo(before, label) {
    const limit = (Number(S.settings.genTimeoutMin) || 30) * 60000;
    const start = Date.now();
    while (!S.stop && Date.now() - start < limit) {
      const fresh = newVideoTiles(before);
      const ready = fresh.find(isReady);
      if (ready) return { title: tileName(ready) };
      if (fresh.length && fresh.every(isFailedTile)) return { error: "a geração falhou no Flow" };
      status(`${label}: gerando… ${Math.round((Date.now() - start) / 1000)} s`);
      await sleep(3000);
    }
    return { error: S.stop ? "parado" : `nada ficou pronto em ${S.settings.genTimeoutMin || 30} min` };
  }

  async function clearStartFrame() {
    const chip = filledStartChip();
    if (!chip) return;
    const x = [...chip.querySelectorAll("*")].find((e) => !e.children.length && (e.textContent || "").trim() === "cancel");
    (x || chip).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await waitFor(findStartChip, 4000, 200);
  }

  async function saveLastFrame(title) {
    const tile = await waitFor(
      () => allTiles().find((t) => kindOf(t) === "video" && isReady(t) && tileName(t) === title),
      20000,
      500,
    );
    if (!tile) return `não achei o vídeo "${title}" na galeria`;
    tile.scrollIntoView({ block: "center", behavior: "instant" });
    await sleep(500);
    (tile.querySelector("video") || tile.querySelector(".container") || tile).click();
    const save = await waitFor(() => flowButton(["Salvar frame", "Save frame"], ["add_photo_alternate"]), 15000, 300);
    if (!save) return "o editor do vídeo não abriu";
    await sleep(800);
    const skip = flowButton(["Pular para o próximo clipe", "Skip to next clip"], ["skip_next"]);
    if (skip) {
      skip.click();
      await sleep(1000);
    }
    save.click();
    const ok = await waitFor(() => flowNotices().some((el) => /frame salvo|frame saved/i.test(noticeText(el))), 15000, 300);
    await sleep(600);
    flowButton(['"Voltar"', "Voltar", "Back"], ["arrow_back"])?.click();
    await waitFor(() => findStartChip() || filledStartChip(), 15000, 300);
    await sleep(800);
    return ok ? null : 'o Flow não confirmou "Frame salvo"';
  }

  async function attachStartFrame(title) {
    await clearStartFrame();
    const chip = await waitFor(findStartChip, 8000, 300);
    if (!chip) return "botão Início não apareceu (o modo escolhido no Flow aceita frame inicial?)";
    chip.click();
    const search = await waitFor(() => overlay()?.querySelector('input[aria-label="Pesquisar recursos"], input[type="text"]'), 8000, 250);
    if (!search) return "o seletor de frame não abriu";
    search.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(search, title);
    search.dispatchEvent(new Event("input", { bubbles: true }));
    const opt = await waitFor(
      () =>
        [...(overlay()?.querySelectorAll('button[role="option"]') || [])].find((b) => {
          const t = (b.innerText || "").trim();
          return /frame/i.test(t) && t.endsWith(title);
        }),
      8000,
      300,
    );
    if (!opt) {
      flowButton(["Fechar", "Close"], ["close"])?.click();
      return `"Frame salvo de ${title}" não apareceu no seletor`;
    }
    opt.click();
    // Clicar na imagem às vezes já inclui e fecha; senão, aparece "Incluir no comando".
    const next = await waitFor(() => filledStartChip() || overlay()?.querySelector("button.detail-add-to-prompt-btn"), 6000, 200);
    if (next && next.classList?.contains("detail-add-to-prompt-btn")) next.click();
    return (await waitFor(filledStartChip, 6000, 300)) ? null : "o frame não entrou na caixa";
  }

  async function startGenerate() {
    const prompts = (S.settings.prompts || []).map((p) => p.trim()).filter(Boolean);
    if (!prompts.length) return log("Nenhum prompt na fila.", "error");
    const chain = !!S.settings.chainFrames;
    const maxParallel = chain ? 1 : Math.max(1, Number(S.settings.maxParallel) || 2);
    const gap = Math.max(0, Number(S.settings.genGapSec) || 0) * 1000;
    const sent = [];
    const preKeys = new Set(tileKeys().values()); // o que já existia antes desta fila
    let lastTitle = null;
    S.total = prompts.length;
    if (chain) log("🔗 Modo contínuo: um vídeo por vez, cada um começa do último frame do anterior.");
    for (let i = 0; i < prompts.length && !S.stop; i++) {
      const label = `Prompt ${i + 1}/${prompts.length}`;
      await waitUntilVisible();
      status(`${label}: aguardando vaga (${getGenerating().length}/${maxParallel} gerando)`);
      await waitFor(() => getGenerating().length < maxParallel, 60 * 60000, 2000);
      if (S.stop) break;
      if (chain && lastTitle) {
        status(`${label}: pegando o último frame de "${lastTitle}"`);
        let e = await saveLastFrame(lastTitle);
        if (!e) e = await attachStartFrame(lastTitle);
        if (e) log(`⚠️ ${label}: ${e}. Segue sem frame inicial.`, "warn");
        else log(`🔗 ${label} começa do último frame de "${lastTitle}"`, "success");
      }
      const before = titleCounts();
      status(`${label}: enviando`);
      let err = await submitPrompt(prompts[i], label);
      if (err && !S.stop) {
        log(`${label}: ${err}. Tentando de novo em 5 s`, "warn");
        await sleep(5000);
        err = await submitPrompt(prompts[i], label);
      }
      if (err) {
        S.failed++;
        log(`❌ ${label}: ${err}`, "error");
      } else {
        S.done++;
        sent.push({ idx: i + 1, prompt: prompts[i] });
        log(`🎬 ${label} enviado: "${prompts[i].slice(0, 60)}"`, "success");
        if (chain && i < prompts.length - 1) {
          const r = await waitNewVideo(before, label);
          lastTitle = r.title || null;
          if (r.title) log(`✅ ${label} pronto: "${r.title}"`, "success");
          else log(`⚠️ ${label}: ${r.error}. O próximo começa sem frame.`, "warn");
        }
      }
      status();
      if (gap) await sleep(gap);
    }
    if (S.stop || !S.settings.thenDownload || !sent.length) return;

    // espera tudo terminar de gerar
    const idleMs = (Number(S.settings.genTimeoutMin) || 30) * 60000;
    let lastChange = Date.now();
    let lastCount = -1;
    await sleep(5000);
    while (!S.stop) {
      const g = getGenerating().length;
      if (g !== lastCount) {
        lastCount = g;
        lastChange = Date.now();
      }
      if (g === 0) break;
      if (Date.now() - lastChange > idleMs) {
        log(`Nada terminou em ${S.settings.genTimeoutMin} min, baixando o que já ficou pronto.`, "warn");
        break;
      }
      status(`Esperando o Flow terminar: ${g} gerando`);
      await sleep(3000);
    }
    if (S.stop) return;
    await sleep(3000);

    // baixa os vídeos desta fila, nomeados pela ordem do prompt (001a, 001b… quando há variações)
    const perPrompt = new Map();
    const startNum = Number(S.settings.startNumber) || 1;
    const matchPrompt = (title) => {
      const t = norm(title);
      if (t.length < 6) return null;
      return sent.find((s) => {
        const p = norm(s.prompt);
        return p.startsWith(t) || t.startsWith(p);
      });
    };
    // Vídeos novos = os que não existiam antes da fila. O grid mostra o mais novo primeiro, então o mais antigo
    // (prompt 1) recebe o número 1.
    const keysNow = tileKeys();
    const fresh = allTiles().filter((t) => kindOf(t) === "video" && isReady(t) && !preKeys.has(keysNow.get(t)));
    const order = new Map(fresh.map((t, i) => [keysNow.get(t), fresh.length - i]));
    S.done = 0;
    S.failed = 0;
    S.total = fresh.length;
    S.mode = "download";
    status(`Baixando os ${fresh.length} vídeos gerados`);
    await runDownloads((t, key) => {
      if (kindOf(t) !== "video") return null;
      const m = matchPrompt(tileName(t));
      if (m) {
        const c = (perPrompt.get(m.idx) || 0) + 1;
        perPrompt.set(m.idx, c);
        const suffix = c > 1 ? String.fromCharCode(96 + c) : "";
        return { fileName: `${S.settings.prefix || ""}${pad(startNum + m.idx - 1)}${suffix} - ${shortTitle(m.prompt)}` };
      }
      if (!order.has(key)) return null;
      return { fileName: `${S.settings.prefix || ""}${pad(startNum + order.get(key) - 1)} - ${shortTitle(tileName(t))}` };
    }, fresh.length || 0);
  }

  // ---------- calibração (só se a detecção automática falhar) ----------
  function calibrate(what) {
    return new Promise((resolve) => {
      const tip = what === "prompt" ? "Clique na caixa de prompt do Flow" : "Clique no botão de enviar do Flow (não vai gerar)";
      showBadge(`🎯 ${tip}`);
      const handler = (e) => {
        if (e.target.closest?.("#kbidflow-badge")) return;
        const el =
          what === "prompt"
            ? e.target.closest('textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], input') || e.target
            : e.target.closest("button") || e.target;
        if (what === "send") {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
        document.removeEventListener("pointerdown", handler, true);
        if (what === "send") {
          const block = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
          };
          for (const t of ["mousedown", "pointerup", "mouseup", "click"]) {
            document.addEventListener(t, block, true);
            setTimeout(() => document.removeEventListener(t, block, true), 800);
          }
        }
        S.calib[what] = sigOf(el);
        chrome.storage.local.set({ kfCalib: S.calib });
        log(`Calibrado: ${what === "prompt" ? "caixa de prompt" : "botão de enviar"} ${JSON.stringify(S.calib[what])}`, "success");
        hideBadgeSoon();
        resolve(S.calib[what]);
      };
      document.addEventListener("pointerdown", handler, true);
    });
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
    status(mode === "generate" ? "Iniciando geração" : "Iniciando downloads");
    (async () => {
      try {
        if (mode === "generate") await startGenerate();
        else await startDownloadAll();
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
            promptFound: !!findPromptBox(),
            sendFound: !!(findPromptBox() && findSendButton(findPromptBox())),
            calib: S.calib,
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
        case "generate":
          return run("generate", msg.settings);
        case "download":
          return run("download", msg.settings);
        case "stop":
          stopRun();
          return { ok: true };
        case "calibrate":
          return { ok: true, sig: await calibrate(msg.what) };
        case "resetCalib":
          S.calib = {};
          await chrome.storage.local.remove("kfCalib");
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

  // Para teste manual no console da aba (não muda nada sozinho).
  window.__kbidflowDebug = { saveLastFrame, attachStartFrame, clearStartFrame, titleCounts, newVideoTiles };

  log("pronto nesta aba do Flow");
})();
