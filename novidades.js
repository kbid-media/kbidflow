// KbidFlow · novidades por versão e aviso de atualização.
// 1. Na primeira abertura do painel depois de uma atualização, mostra as novidades da versão.
// 2. A cada 6 h consulta o último Release no GitHub (repositório público, sem login) e, se houver versão nova,
//    mostra o aviso com o comando de atualização (PowerShell) e o botão que recarrega a extensão.
(() => {
  const $ = (id) => document.getElementById(id);
  const REPO = "kbid-media/kbidflow";
  const CMD = "& ([scriptblock]::Create((irm https://raw.githubusercontent.com/kbid-media/kbidflow/main/instalar.ps1)))";
  const atual = chrome.runtime.getManifest().version;

  // Mantenha a versão mais nova em cima. Frases curtas, do ponto de vista de quem usa.
  const NOVIDADES = {
    "2.3.0": [
      "🤖 <b>Fila do agente</b> (nova, primeira aba): cole uma lista de pedidos e a KbidFlow manda um por vez para o agente do Flow, esperando cada geração terminar.",
      "Se o agente fizer uma pergunta em vez de gerar, a fila pausa sozinha para você responder.",
      "📖 <b>Guia</b> rápido de uso dentro do painel (aba Guia).",
      "🔔 Aviso de <b>versão nova</b> no topo do painel, com o comando de atualização pronto para copiar.",
      "⬇ <b>Baixar</b> agora na segunda aba, com <b>destaque em cada vídeo</b>: azul = na fila, amarelo = baixando, verde = baixado, vermelho = erro.",
      "Antes de começar, 5 s para conferir os azuis. O <b>✕ tirar</b> em cada vídeo tira da fila (também durante o download); ↺ volta.",
    ],
  };

  const cmp = (a, b) => {
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
    return 0;
  };

  // ---------- novidades ----------
  function abrirNovidades() {
    const vs = Object.keys(NOVIDADES).sort((a, b) => cmp(b, a));
    $("newsVer").textContent = atual;
    $("newsBody").innerHTML = vs.map((v) => `<p><b>${v}</b></p><ul>${NOVIDADES[v].map((t) => `<li>${t}</li>`).join("")}</ul>`).join("");
    $("news").classList.remove("hidden");
  }
  const fecharNovidades = () => { $("news").classList.add("hidden"); chrome.storage.local.set({ kfNewsSeen: atual }); };
  $("newsOk").onclick = fecharNovidades;
  $("newsClose").onclick = fecharNovidades;
  $("openNews").onclick = abrirNovidades;
  $("openNews2").onclick = abrirNovidades;
  chrome.storage.local.get("kfNewsSeen").then(({ kfNewsSeen }) => { if (kfNewsSeen !== atual && NOVIDADES[atual]) abrirNovidades(); });

  // ---------- atualização ----------
  function mostrarAviso(tag) {
    $("updVer").textContent = tag;
    $("updCur").textContent = atual;
    $("upd").classList.remove("hidden");
  }
  $("updCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(CMD); $("updCopy").textContent = "✔ Copiado: cole no PowerShell"; }
    catch { prompt("Copie e cole no PowerShell:", CMD); }
  };
  $("updReload").onclick = () => chrome.runtime.reload();
  $("updLater").onclick = () => { $("upd").classList.add("hidden"); chrome.storage.local.set({ kfUpdSnooze: Date.now() }); };

  async function checar() {
    const { kfUpdCheck = 0, kfUpdLatest = "", kfUpdSnooze = 0 } = await chrome.storage.local.get(["kfUpdCheck", "kfUpdLatest", "kfUpdSnooze"]);
    let latest = kfUpdLatest;
    if (Date.now() - kfUpdCheck > 6 * 3600e3) {
      try {
        const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
        if (r.ok) {
          latest = String((await r.json()).tag_name || "").replace(/^v/, "");
          await chrome.storage.local.set({ kfUpdCheck: Date.now(), kfUpdLatest: latest });
        }
      } catch { /* sem internet: tenta na próxima abertura */ }
    }
    const adiado = Date.now() - kfUpdSnooze < 12 * 3600e3;
    if (latest && cmp(latest, atual) > 0 && !adiado) mostrarAviso(latest);
  }
  checar();
})();
