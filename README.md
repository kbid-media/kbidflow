# KbidFlow

Extensão do Chrome para o Google Flow: gera vídeos em fila e baixa em 1080p, um por vez.
Gratuita e de código aberto: sem licença, servidor externo nem telemetria. Funciona pelos próprios botões do Flow, como se fosse você clicando.

## Instalar e atualizar (o mesmo comando)
Cole no PowerShell (não precisa de login nem de conta no GitHub):

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/kbideditor1/kbidflow/main/instalar.ps1)))
```

- **Primeira vez:** o comando instala em `%LOCALAPPDATA%\KbidFlow\extensao` e copia esse caminho. Abra `chrome://extensions`, ligue o **Modo do desenvolvedor**, clique em **Carregar sem compactação** e cole o caminho.
- **Para atualizar:** rode o mesmo comando, clique no ↻ da KbidFlow em `chrome://extensions` e dê F5 na aba do Flow. As filas salvas são mantidas.
- **Sem PowerShell:** baixe o `KbidFlow-x.y.z.zip` em **Releases**, extraia numa pasta fixa e carregue essa pasta.

A versão instalada aparece no topo do painel.

### Publicar uma versão nova (quem mantém)
1. Suba `"version"` no `manifest.json` (ex.: `1.0.1`) e faça o commit.
2. `git push`, depois `git tag v1.0.1` e `git push origin v1.0.1`.
3. O GitHub Actions cria o Release com o `.zip`. Para testar o pacote localmente: `empacotar.ps1`.
4. Fixe o ícone ⚡. Clicar nele abre o painel lateral.
5. Se tiver outra extensão que baixa vídeos do Flow, desative-a enquanto usa a KbidFlow, para uma não pegar o download da outra.

## Gerar
1. Abra o projeto no Flow e deixe a aba na frente.
2. Na caixa do próprio Flow, escolha modelo, proporção (9:16 ou 16:9), duração e quantidade por prompt.
3. No painel, aba **Gerar**: cole os prompts (um por linha), escolha a velocidade e clique em **Gerar fila**.
4. A extensão digita cada prompt e clica em enviar, respeitando o limite de gerações ao mesmo tempo.
5. **Continuar do último frame** (opcional): gera um vídeo por vez e, antes de cada prompt, salva o último quadro do vídeo anterior ("Salvar frame" do Flow) e o põe no **Início** da caixa. Serve para cenas contínuas. A caixa do Flow precisa estar no modo que mostra **Início** e **Fim**.
6. Com **Baixar os vídeos gerados quando terminar**, ela espera tudo ficar pronto e baixa só os vídeos novos, numerados pela ordem dos prompts (`001 - …`, `002 - …`; variações viram `001b`, `001c`).

## Fila pronta (skill kbidflow-prompts)
Peça ao Claude "monta a fila do Flow para N vídeos de …". A skill escreve os prompts e salva em `D:\IA\KbidFlow\filas\`.
No painel: **Gerar** › **atualizar lista** › escolha a fila › **Carregar**. O quadro amarelo diz como deixar a caixa do Flow (modelo, proporção, duração). Depois clique em **Gerar fila**.
Também dá para abrir um `.json` ou `.txt` (um prompt por linha) com **abrir arquivo…**.

A skill está em `skill/kbidflow-prompts`. O instalador já a coloca no Claude Code (`%USERPROFILE%\.claude\skills\`) de quem tem o Claude Code instalado.
As filas são gravadas em toda KbidFlow instalada na máquina; para outra pasta, use `--pasta <pasta-da-extensão>\filas`.

## Baixar
Aba **Baixar** › **Baixar vídeos**. Para cada vídeo: ⋮ › Download › 1080p. Ela espera o upscale do Flow e o Chrome começar o arquivo, e só então passa ao próximo.
Os arquivos vão para `Downloads\KbidFlow\` (a pasta pode ser mudada em Ajustes).
**Pular o que já baixei** lembra o que foi salvo em cada projeto.
**Escolher os vídeos no Flow**: aparece uma caixinha no canto de cada vídeo. Marque os que quer e clique em **Baixar N marcados**. Sem nenhum marcado, baixa todos.
Se o Flow bloquear o 1080p por um tempo (limite de upscale), ela espera 30 s, 1, 2 e 4 min e tenta de novo. Só baixa em 720p se a opção estiver ligada em Ajustes; senão pula e avisa no registro.

## Bom saber
- A aba do Flow precisa ficar visível. Se você trocar de aba, ela pausa e continua quando você voltar.
- 4K gasta créditos. Ela só confirma a pergunta do Flow se **Permitir confirmar créditos** estiver marcado.
- Se o prompt não for detectado (✗ no topo do painel), use **Ajustes › Calibrar**.
- Para ver os detalhes de um problema: F12 › Console, linhas que começam com `[KbidFlow]`.
