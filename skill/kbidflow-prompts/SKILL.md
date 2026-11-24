---
name: kbidflow-prompts
description: Escreve todos os prompts de uma série de vídeos para o Google Flow (Veo 3.1) a partir de um briefing e salva a fila pronta para a extensão KbidFlow, que gera tudo em sequência e baixa em 1080p sozinha. Use quando pedirem "gera os prompts dos vídeos", "monta a fila do Flow", "quero N vídeos de X no Flow", "prompts para a KbidFlow", "lote de takes no Flow" ou uma série de vídeos de texto para vídeo no Flow.
---

# KbidFlow Prompts: do briefing à fila pronta no Flow

A extensão KbidFlow (`D:\IA\KbidFlow`) digita cada prompt na caixa do Flow, respeita o limite de gerações ao mesmo tempo e, no fim, baixa os vídeos novos em 1080p, numerados na ordem da fila.
Esta skill escreve esses prompts e salva a fila em `D:\IA\KbidFlow\filas\`. O painel da extensão lista essa pasta e carrega com um clique.

A extensão envia texto + imagens (de referência e frame inicial) e troca sozinha a caixa entre Elementos e Frames. Modelo, proporção, duração e quantidade por prompt ficam como estiverem na caixa do Flow: diga ao usuário como deixar.
Take falado do Davi ou do Rodrigo com voz clonada continua sendo da `ev-avatar-flow`; para um lote deles, a fila pode usar o character sheet da ficha como imagem em todos os prompts.

## Etapa 1: briefing (até 6 perguntas, só o que faltar)

1. **Tema e objetivo**: o que a série mostra e para onde vai (Reels, anúncio, aula, B-roll).
2. **Quantos vídeos** e se cada um é uma cena diferente ou variações da mesma.
3. **Personagem**: quem aparece. Se for o mesmo em todos, peça ou monte uma descrição fixa (idade, rosto, cabelo, barba, óculos, roupa). Para Davi/Rodrigo, use a ficha em `D:\IA\Skills\ev-avatar-flow\personagens\<id>\ficha.json`.
4. **Formato**: 9:16 ou 16:9; duração 4, 6 ou 8 s; modelo (Veo 3.1 Fast é o padrão; Quality para hero shots).
5. **Fala**: com fala (qual texto, em português do Brasil?) ou só imagem com som ambiente.
6. **Imagens de referência** (se o usuário usa imagens + prompt): quais arquivos entram em **todos** os vídeos (ex.: character sheet) e quais só em vídeos específicos (cenário, produto). Peça os caminhos no computador. Um vídeo pode também ter um **frame inicial** próprio.

Se o usuário já mandou roteiro ou lista de cenas, não pergunte de novo: use o que veio.

## Etapa 2: escrever os prompts

Um prompt por vídeo, **numa linha só** (a fila separa por linha). Em português. Ordem fixa dos blocos:

1. **Plano e câmera**: enquadramento + formato + movimento. Ex.: "Plano médio vertical 9:16, câmera fixa na altura do peito com aproximação lenta e suave."
2. **Personagem**: o bloco fixo do briefing, **copiado igual em todos os prompts**, palavra por palavra. É isso que mantém a mesma pessoa entre vídeos.
3. **Cenário e luz**: lugar, hora do dia, luz (ex.: "escritório com estante de livros ao fundo, luz quente de fim de tarde vinda da janela").
4. **Ação**: o que acontece nos segundos do take, com gesto e expressão. Uma ação principal por take.
5. **Fala** (se houver): `Ele diz em português brasileiro, com calma e naturalidade: "…"`. Máximo de palavras: 4 s → 10, 6 s → 15, 8 s → 20. Se passar, divida em dois prompts seguidos.
6. **Regras de qualidade**: "Lábios sincronizados com a fala, piscadas naturais, mãos com cinco dedos e sem deformação, rosto de frente ou levemente diagonal, nunca de perfil. Plano único sem cortes, sem legenda, sem texto na tela, sem música."
   Sem fala, troque o início por "Sem fala, apenas som ambiente de …".

Variar entre os prompts: ação, enquadramento (close, médio, americano), ângulo e movimento de câmera. Ritmo do usuário: algo entra ou a câmera muda de foco a cada 2-3 s.
Não variar: personagem, roupa, cenário (quando é a mesma série), luz e regras.
Evite marcas, logos, texto escrito na cena e pessoas famosas reais.

Mostre os prompts ao usuário numa caixa de código, numerados, antes de salvar. Ajuste o que ele pedir.

## Etapa 3: salvar a fila

Monte o rascunho em `<scratchpad>/fila.json`:

```json
{
  "titulo": "Nome curto da série",
  "flow": {
    "modelo": "Veo 3.1 - Fast",
    "modo": "Texto para vídeo",
    "proporcao": "9:16",
    "duracao": "8s",
    "por_prompt": 1,
    "observacoes": "Sem imagem de referência anexada na caixa do Flow."
  },
  "kbidflow": {
    "quality": "1080p",
    "folder": "KbidFlow/nome-da-serie",
    "prefix": "",
    "startNumber": 1,
    "maxParallel": 2,
    "chainFrames": false,
    "thenDownload": true
  },
  "imagens": ["D:/caminho/sheet_rodrigo.jpg"],
  "prompts": [
    "prompt 1 numa linha",
    {"texto": "prompt 2 numa linha", "imagens": ["D:/caminho/escritorio.jpg"]},
    {"texto": "prompt 3 numa linha", "inicio": "D:/caminho/frame_inicial.png"}
  ]
}
```

**Ajustes por take** (dentro do objeto do prompt): `"nome": "v4_t03"` (o arquivo baixado leva esse nome), `"duracao": 8` (4, 6, 8 ou 10; a KbidFlow troca no menu do Flow antes de enviar) e `"continuar": true` (começa do último quadro do take anterior da fila, para os takes "b"). Para uma série que já tem roteiro e frames (ex.: `prompts_flow_v2.md` com "Imagem inicial"), monte um prompt por take com `nome`, `duracao`, `inicio` (o frame) ou `continuar`.

**Imagens (pacote):** `imagens` no topo entram em todos os prompts; `imagens` dentro de um prompt só naquele; `inicio` é o frame inicial daquele vídeo. Sem imagens, use só textos e apague as chaves. O script copia os arquivos para dentro da fila (nome = `<fila>_<arquivo>`, que vira o nome da mídia no Flow). Na hora de gerar, a KbidFlow sobe o que faltar no projeto (soltando o arquivo na caixa), troca a caixa sozinha para **Elementos** (imagens) ou **Frames** (início/último frame) e faz um vídeo por vez.
- O Flow não junta frame inicial com elementos no mesmo vídeo. Com imagens + `chainFrames`, o último frame entra como mais um elemento. Com imagens + `inicio`, vale o modo Elementos e o `inicio` é ignorado; avise o usuário e prefira um ou outro.
- Escreva o prompt sabendo que as imagens estão lá: "o homem da imagem de referência…", sem redescrever o rosto em detalhe.

Depois rode:

```bash
python D:/IA/Skills/kbidflow-prompts/scripts/salvar_fila.py "<scratchpad>/fila.json"
```

O script põe cada prompt numa linha e grava `filas\<data>_<slug>.json` + `filas/index.json` em toda KbidFlow instalada na máquina (`D:\IA\KbidFlow` e/ou `%LOCALAPPDATA%\KbidFlow\extensao`, a pasta do instalador). Também avisa sobre fala longa demais, prompt curto ou repetido. Corrija os avisos e salve de novo (a versão nova vira `-v2`; não apague a anterior).

`maxParallel`: 2 é o padrão seguro. 3 só se o usuário pedir pressa; 1 para Quality ou fila grande.

`chainFrames: true` (**continuar do último frame**): para uma cena contínua (plano-sequência, uma fala longa dividida em takes, a mesma ação seguindo). A KbidFlow gera um vídeo por vez; antes de cada prompt, salva o último quadro do vídeo anterior ("Salvar frame" do Flow) e o põe no **Início** da caixa. Nesse modo:
- escreva cada prompt como **continuação** do anterior: comece pela posição em que o take anterior terminou ("Continuando do mesmo plano, ele …") e não mude cenário, roupa nem luz;
- não descreva entrada em cena nem corte: o vídeo já começa naquele quadro;
- em `flow.observacoes`, peça para deixar a caixa no modo de vídeo com frames (Início/Fim visíveis) e, se quiser, já escolher o frame do primeiro vídeo no Início;
- o tempo total é maior (um por vez), então avise.

## Etapa 4: entregar (curto, no máximo 5 itens)

- Caminho completo da fila salva, como link.
- O que deixar na caixa do Flow: modelo · modo · proporção · duração · quantidade por prompt.
- No painel da KbidFlow: aba **Gerar** › **atualizar lista** › escolher a fila › **Carregar** › **Gerar fila**.
- Onde os vídeos vão cair: `Downloads\<folder>\001 - …mp4`.
- Créditos: estimativa = prompts × vídeos por prompt × custo do modelo no plano do usuário. Avise antes se a fila for grande.
