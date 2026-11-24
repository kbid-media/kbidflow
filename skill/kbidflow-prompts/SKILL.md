---
name: kbidflow-prompts
description: Escreve todos os prompts de uma série de vídeos para o Google Flow (Veo 3.1) a partir de um briefing e salva a fila pronta para a extensão KbidFlow, que gera tudo em sequência e baixa em 1080p sozinha. Use quando pedirem "gera os prompts dos vídeos", "monta a fila do Flow", "quero N vídeos de X no Flow", "prompts para a KbidFlow", "lote de takes no Flow" ou uma série de vídeos de texto para vídeo no Flow.
---

# KbidFlow Prompts: do briefing à fila pronta no Flow

A extensão KbidFlow (`D:\IA\KbidFlow`) digita cada prompt na caixa do Flow, respeita o limite de gerações ao mesmo tempo e, no fim, baixa os vídeos novos em 1080p, numerados na ordem da fila.
Esta skill escreve esses prompts e salva a fila em `D:\IA\KbidFlow\filas\`. O painel da extensão lista essa pasta e carrega com um clique.

Limite da extensão: ela só envia **texto**. Modelo, proporção, duração, quantidade por prompt e imagem de referência ficam como estiverem na caixa do Flow.
Take com frame inicial do Davi ou do Rodrigo continua sendo da `ev-avatar-flow`.

## Etapa 1: briefing (até 5 perguntas, só o que faltar)

1. **Tema e objetivo**: o que a série mostra e para onde vai (Reels, anúncio, aula, B-roll).
2. **Quantos vídeos** e se cada um é uma cena diferente ou variações da mesma.
3. **Personagem**: quem aparece. Se for o mesmo em todos, peça ou monte uma descrição fixa (idade, rosto, cabelo, barba, óculos, roupa). Para Davi/Rodrigo, use a ficha em `D:\IA\Skills\ev-avatar-flow\personagens\<id>\ficha.json`.
4. **Formato**: 9:16 ou 16:9; duração 4, 6 ou 8 s; modelo (Veo 3.1 Fast é o padrão; Quality para hero shots).
5. **Fala**: com fala (qual texto, em português do Brasil?) ou só imagem com som ambiente.

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
    "thenDownload": true
  },
  "prompts": ["prompt 1 numa linha", "prompt 2 numa linha"]
}
```

Depois rode:

```bash
python D:/IA/Skills/kbidflow-prompts/scripts/salvar_fila.py "<scratchpad>/fila.json"
```

O script põe cada prompt numa linha, grava `D:\IA\KbidFlow\filas\<data>_<slug>.json`, atualiza `filas/index.json` e avisa sobre fala longa demais, prompt curto ou repetido. Corrija os avisos e salve de novo (a versão nova vira `-v2`; não apague a anterior).

`maxParallel`: 2 é o padrão seguro. 3 só se o usuário pedir pressa; 1 para Quality ou fila grande.

## Etapa 4: entregar (curto, no máximo 5 itens)

- Caminho completo da fila salva, como link.
- O que deixar na caixa do Flow: modelo · modo · proporção · duração · quantidade por prompt.
- No painel da KbidFlow: aba **Gerar** › **atualizar lista** › escolher a fila › **Carregar** › **Gerar fila**.
- Onde os vídeos vão cair: `Downloads\<folder>\001 - …mp4`.
- Créditos: estimativa = prompts × vídeos por prompt × custo do modelo no plano do usuário. Avise antes se a fila for grande.
