# ⚡ KbidFlow

Faz o Google Flow trabalhar sozinho:
- 🎬 **gera** os vídeos da fila, um atrás do outro;
- 🖼️ põe as **imagens** e o **frame inicial** de cada vídeo;
- ⬇️ **baixa** tudo em **1080p**, com o nome certo.

Você monta a fila conversando com o **Claude**. A KbidFlow faz o resto.

---

## 1 · Instalar (uma vez, 2 minutos)

**a)** Abra o **PowerShell** (tecla Windows, digite `powershell`, Enter) e cole:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/kbideditor1/kbidflow/main/instalar.ps1)))
```

**b)** No Chrome, abra `chrome://extensions` → ligue **Modo do desenvolvedor** (canto de cima, à direita).

**c)** Clique em **Carregar sem compactação** → cole (Ctrl+V) → **Selecionar pasta**.

**d)** Clique no 🧩 do Chrome e fixe o ⚡ **KbidFlow**.

Pronto. Se você usa o Claude Code, a skill de montar filas também já foi instalada.

---

## 2 · Usar com o Claude (o jeito do dia a dia)

**a)** Abra o projeto no Flow → clique no ⚡ → aba **Gerar** → **📋 copiar títulos do projeto**.

**b)** No Claude, cole e peça. Exemplos:
> monta a fila dos takes que faltam deste roteiro *(arraste o arquivo do roteiro)*

> quero 4 vídeos verticais de 8 s do Rodrigo explicando cartão de crédito *(arraste as fotos dele)*

O Claude pergunta o que faltar, uma coisa por vez, e no fim diz **"✅ Fila pronta"**.

**c)** No painel: **atualizar lista** → escolha a fila → **Carregar** → **Gerar fila**.
Deixe a aba do Flow na frente. Os vídeos caem em `Downloads\KbidFlow\…`.

---

## 3 · Só baixar vídeos que já estão no Flow

Painel → aba **Baixar** → **Baixar vídeos**.
- Quer só alguns? Ligue **Escolher os vídeos no Flow** e marque as caixinhas.
- **Pular o que já baixei** evita baixar de novo.

---

## 🆘 Deu algo errado?

| O que aconteceu | O que fazer |
|---|---|
| O painel diz "sem aba do Flow" | Abra o projeto no Flow e dê F5 |
| Parou no meio | Deixe a aba do Flow na frente: ela pausa quando você troca de aba |
| Veio uma fila de alguém (arquivo .zip) | Descompacte → no painel, **abrir pasta (prompts + imagens)…** → escolha a pasta |
| Linha vermelha ❌ no Registro | Tire um print do **Registro** (fim do painel) e mande para o Claude ou para a equipe |
| Atualizar a extensão | Rode o comando do passo 1a de novo → ↻ da KbidFlow em `chrome://extensions` → F5 no Flow |

Se tiver outra extensão que baixa vídeos do Flow, desligue enquanto usa a KbidFlow.

---

<details>
<summary><b>Detalhes (para quem quer saber como funciona)</b></summary>

### O que acontece quando você clica em Gerar fila
1. Sobe ao projeto as imagens da fila que ainda não estão lá (soltando o arquivo na caixa do Flow).
2. Para cada vídeo: troca a caixa para **Frames** (frame inicial / último quadro) ou **Elementos** (imagens de referência), ajusta a duração, escreve o prompt e envia.
3. Um vídeo por vez quando a fila tem imagens ou ajustes por take; senão, até 3 ao mesmo tempo (Velocidade).
4. No fim, baixa os vídeos novos em 1080p: ⋮ › Download › 1080p, esperando o upscale de cada um.

### Formato da fila (`fila.json`)
```json
{
  "titulo": "Nome da fila",
  "imagens": ["rosto.jpg"],
  "kbidflow": {"folder": "KbidFlow/nome", "quality": "1080p", "thenDownload": true},
  "prompts": [
    "texto simples",
    {"nome": "v4_t03", "texto": "…", "duracao": 8, "inicio": "v4_t03_frame.jpg"},
    {"nome": "v4_t04b", "texto": "…", "duracao": 8, "continuar": true},
    {"nome": "v5_t02b", "texto": "…", "continuar_de": "v5_t02a"},
    {"nome": "cena2", "texto": "…", "imagens": ["cenario.jpg"]}
  ]
}
```
- `imagens` no topo: em todos os vídeos. Dentro de um prompt: só naquele.
- `inicio`: frame inicial. `continuar`: começa do último quadro do vídeo anterior da fila. `continuar_de`: do último quadro de um vídeo que já está no Flow (pelo título).
- `duracao`: 4, 6, 8 ou 10 s. `nome`: nome do arquivo baixado.
- O Flow não junta frame inicial com imagens de referência no mesmo vídeo: com os dois, valem as imagens e o último quadro entra como mais uma imagem.
- Uma pasta com `fila.json` (ou `prompts.txt`, um prompt por linha) + as imagens pode ser aberta com **abrir pasta**. Sem lista de imagens no arquivo, todas as imagens da pasta entram em todos os vídeos.

### Outras opções do painel
- **Continuar do último frame**: cada vídeo começa onde o anterior terminou.
- **Ajustes**: qualidade (720p, 1080p, 4K), pasta, prefixo do arquivo, tempo máximo por vídeo.
- Se o 1080p ficar bloqueado por um tempo, ela espera e tenta de novo (30 s, 1, 2, 4 min). Só baixa em 720p se você ligar isso em Ajustes.
- 4K gasta créditos: ela só confirma a pergunta do Flow se **Permitir confirmar créditos** estiver ligado.

### A skill (para o Claude Code)
Fica em `skill/kbidflow-prompts`; o instalador copia para `%USERPROFILE%\.claude\skills\`. Scripts:
- `roteiro_para_fila.py ROTEIRO.md --titulos titulos.txt [--simular]`: monta a fila só com os takes que faltam.
- `salvar_fila.py fila.json`: copia as imagens (PNG grande vira JPG), grava a fila na KbidFlow e cria a pasta para mandar a alguém.

### Publicar uma versão nova (quem mantém)
1. Suba `"version"` no `manifest.json` e faça o commit e o `git push`.
2. `git tag vX.Y.Z` e `git push origin vX.Y.Z`. O GitHub Actions publica o Release com o `.zip`.
3. A equipe atualiza rodando o comando do passo 1a.

</details>
