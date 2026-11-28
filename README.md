# ⚡ KbidFlow

Duas ferramentas para o **Google Flow**, em abas no mesmo painel:

- **⬇ Baixar:** baixa os vídeos em **1080p**, um por vez, esperando o upscale de cada um.
- **🤖 Fila do agente:** manda uma lista de pedidos para o **agente do Flow**, um por vez, esperando cada geração terminar. Passo a passo completo (personagens, persona do artista, formato dos pedidos): **[docs/AGENTE.md](docs/AGENTE.md)**.

---

## 1 · Instalar (uma vez, 2 minutos)

**a)** Abra o **PowerShell** (tecla Windows, digite `powershell`, Enter) e cole:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/kbid-media/kbidflow/main/instalar.ps1)))
```

**b)** No Chrome, abra `chrome://extensions` e ligue o **Modo do desenvolvedor** (canto de cima, à direita).

**c)** Clique em **Carregar sem compactação**, cole (Ctrl+V) e clique em **Selecionar pasta**.

**d)** Clique no 🧩 do Chrome e fixe o ⚡ **KbidFlow**.

---

## 2 · 🤖 Fila do agente (gerar em série)

**a)** Uma vez por projeto: crie os **personagens** com as fotos e cole a **persona do artista** nas instruções do agente ([modelo](docs/PERSONA_MODELO.md)).

**b)** Abra o projeto com o painel do agente aberto, clique no ⚡ › aba **🤖 Fila do agente** › **Testar aba**.

**c)** Cole os pedidos (cada um começa com `MODO: IMAGEM ESTÁTICA` ou `MODO: VÍDEO`) › **Adicionar à fila** › **▶ Iniciar fila**.

Regras e exemplos de pedido: **[docs/AGENTE.md](docs/AGENTE.md)**.

---

## 3 · ⬇ Baixar

**a)** Abra o projeto no Flow e clique no ⚡.

**b)** Clique em **Baixar vídeos**.

**c)** Deixe a aba do Flow na frente até terminar. Os vídeos caem em `Downloads\KbidFlow\`.

Quer só alguns? Ligue **Escolher os vídeos** e marque a caixinha de cada um.
**Pular o que eu já baixei** vem ligado: rodar de novo baixa só o que faltou.

---

## 4 · 🔔 Atualizar

Quando sair uma versão nova, o painel mostra um aviso amarelo no topo:

**a)** Clique **1 · Copiar comando** e cole no **PowerShell**. Espere aparecer "KbidFlow atualizada".

**b)** Clique **2 · Recarregar a KbidFlow** e dê F5 na aba do Flow. Pronto: na primeira abertura aparecem as **novidades** da versão.

---

## 🆘 Deu algo errado?

| O que aconteceu | O que fazer |
|---|---|
| O painel diz "sem aba do Flow" | Abra o projeto no Flow e dê F5 |
| Parou no meio | Deixe a aba do Flow na frente: ela pausa quando você troca de aba |
| Aparece "1080p não está liberado agora" | Normal: o Flow segura o upscale às vezes. Ela espera e tenta de novo sozinha |
| Linha vermelha ❌ no Registro | Tire um print do **Registro** (fim do painel) e mande para a equipe |
| Atualizar a extensão | Rode o comando do passo 1a de novo, clique no ↻ da KbidFlow em `chrome://extensions` e dê F5 no Flow |

Se tiver outra extensão que baixa vídeos do Flow, desligue enquanto usa a KbidFlow.

---

<details>
<summary><b>Ajustes e detalhes</b></summary>

- **Ajustes** (no painel): qualidade (720p, 1080p, 4K, GIF), quantos baixar, pasta, prefixo e numeração do arquivo, espera máxima por vídeo, baixar também as imagens.
- Para cada vídeo ela abre ⋮ › Download › 1080p, espera o Flow fazer o upscale e o Chrome começar o arquivo, e só então passa ao próximo.
- Se o 1080p ficar bloqueado por um tempo, ela espera e tenta de novo (30 s, 1, 2 e 4 min). Só baixa em 720p se você ligar isso nos Ajustes.
- 4K gasta créditos: ela só confirma a pergunta do Flow se **Permitir confirmar créditos** estiver ligado.
- Ela rola a galeria do Flow até o fim, então pega projetos grandes inteiros.

### Publicar uma versão nova (quem mantém)
1. Suba `"version"` no `manifest.json`, faça o commit e o `git push`.
2. `git tag vX.Y.Z` e `git push origin vX.Y.Z`. O GitHub Actions publica o Release com o `.zip`.
3. A equipe atualiza rodando o comando do passo 1a.

</details>
