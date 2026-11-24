---
name: kbidflow-prompts
description: Monta a fila (prompts + imagens) para a extensão KbidFlow gerar vídeos no Google Flow sozinha e baixar em 1080p. Dois caminhos - a partir de um roteiro de takes que já existe (pega só os takes que faltam no projeto) ou do zero, a partir de uma ideia. Use quando pedirem "monta a fila do Flow", "gera os prompts dos vídeos", "faz o pacote dos takes que faltam", "quero N vídeos de X no Flow", "prompts para a KbidFlow" ou colarem a lista "Títulos no projeto do Flow".
---

# KbidFlow Prompts: a fila pronta para o Flow

A KbidFlow (extensão do Chrome, https://github.com/kbideditor1/kbidflow) faz no Flow, sozinha: sobe as imagens, põe frame inicial ou imagens de referência, troca a duração, envia cada prompt, espera, e baixa em 1080p. Esta skill prepara a **fila** que ela usa.

## Jeito de conversar (vale para tudo)

Quem usa quer começar rápido e ler pouco:
- **Uma pergunta por vez**, com opções numeradas para responder com um número. Nada de lista de 6 perguntas.
- Frases curtas. Sem termos técnicos (nada de "JSON", "script", "parâmetro" para a pessoa).
- Sempre termine dizendo **o próximo clique**, numa linha só.
- Mostre progresso curto: "✅ roteiro lido · ✅ 7 takes faltando · ⏳ montando a fila".
- Se algo falhar, diga o que fazer em uma frase, não o erro inteiro.

## Primeiro: qual caminho?

Pergunte só isto (a não ser que já esteja claro):

> Vamos montar a fila. Você já tem um roteiro com os takes, ou vamos criar do zero?
> 1. Tenho um roteiro (arquivo com os takes)
> 2. Do zero, a partir de uma ideia

## Caminho 1: do roteiro (só o que falta)

O roteiro tem, para cada take, este formato (é o que a `ev-avatar-flow` e os roteiros da Kbid usam):

~~~
## v4_t03 · 8 s
Imagem inicial: `v4_t03_frame_v1.png`        (ou `último quadro do take v4_t04a`, ou sem a linha)
```
o prompt do take
```
~~~

Passos:
1. Peça o arquivo do roteiro (a pessoa pode arrastar o arquivo para a conversa ou colar o caminho). Os frames ficam numa pasta `frames` ao lado; se não, pergunte onde estão.
2. Peça a lista do que já existe no Flow:
   > No painel da KbidFlow (aba **Gerar**), clique em **📋 copiar títulos do projeto** e cole aqui.
   Se a pessoa não tiver, siga sem: entram todos os takes.
3. Salve o texto colado num arquivo temporário e rode primeiro a simulação:
   ```bash
   python <skill>/scripts/roteiro_para_fila.py "ROTEIRO.md" --titulos "<tmp>/titulos.txt" --simular
   ```
   Mostre a tabela que sai (take · duração · de onde começa) e pergunte: "Monto com esses? 1. Sim 2. Tirar algum".
4. Rode sem `--simular` (com `--so v4_t03,v4_t07` se a pessoa escolheu alguns). O script copia os frames, grava a fila e diz a pasta para mandar a alguém.

Regras que o script já aplica: take "b" que começa do último quadro do "a" vira **continuar** (se o "a" vem antes na fila) ou **continuar_de** (se o "a" já está no Flow). Se o "a" não existe em lugar nenhum, ele para e avisa: inclua o "a".

## Caminho 2: do zero

Uma pergunta por vez, com opções:
1. **O que mostra e para onde vai** (Reels, anúncio, aula, B-roll).
2. **Quantos vídeos** (sugira 3 a 6).
3. **Quem aparece**: uma pessoa com fotos de referência? Peça as imagens (arrastar para a conversa ou caminho). Imagens de rosto/corpo entram em todos os vídeos.
4. **Formato**: 1. Vertical 9:16 · 2. Horizontal 16:9. **Duração**: 4, 6, 8 ou 10 s.
5. **Fala**: 1. Com fala (qual texto?) · 2. Sem fala, só som ambiente.

Escreva um prompt por vídeo, em português, nesta ordem:
1. **Plano e câmera**: "Plano médio vertical 9:16, câmera fixa na altura do peito com aproximação lenta e suave."
2. **Pessoa**: com imagens de referência, "o homem das imagens de referência" + roupa (igual em todos). Sem imagens, uma descrição fixa copiada igual em todos.
3. **Cenário e luz.**
4. **Ação**: uma ação principal, com gesto e expressão.
5. **Fala**: `Ele diz em português brasileiro, com calma e naturalidade: "…"`. Máximo: 4 s → 10 palavras, 6 s → 15, 8 s → 20, 10 s → 25.
6. **Regras**: "Lábios sincronizados com a fala, piscadas naturais, mãos com cinco dedos e sem deformação, rosto de frente ou levemente diagonal, nunca de perfil. Plano único sem cortes, sem legenda, sem texto na tela, sem música." (Sem fala: "Sem fala, apenas som ambiente de …".)

Varie ação, enquadramento e câmera; não varie pessoa, roupa, luz e regras. Nada de marcas, logos, texto na cena ou famosos.

Mostre os prompts numerados e pergunte: "1. Pode montar · 2. Quero mudar algo".

Monte o rascunho em `<tmp>/fila.json` e salve:

```json
{
  "titulo": "Nome curto",
  "flow": {"modo": "Vídeo", "proporcao": "9:16", "duracao": "8s", "por_prompt": 1, "observacoes": "Deixe Vídeo, 9:16 e x1."},
  "kbidflow": {"quality": "1080p", "folder": "KbidFlow/nome-curto", "maxParallel": 1, "thenDownload": true},
  "imagens": ["C:/caminho/rosto.jpg"],
  "prompts": [
    {"nome": "take01", "texto": "prompt 1 numa linha", "duracao": 8},
    {"nome": "take02", "texto": "prompt 2", "duracao": 6, "imagens": ["C:/caminho/cenario.jpg"]},
    {"nome": "take03", "texto": "prompt 3", "duracao": 8, "continuar": true}
  ]
}
```

```bash
python <skill>/scripts/salvar_fila.py "<tmp>/fila.json"
```

Campos de cada prompt: `nome` (nome do arquivo baixado), `duracao` (4/6/8/10), `inicio` (frame inicial), `imagens` (referências só daquele vídeo), `continuar` (começa do último quadro do vídeo anterior da fila), `continuar_de` (do último quadro de um vídeo que já está no Flow, pelo título). `imagens` no topo entram em todos.

O Flow não junta frame inicial com imagens de referência no mesmo vídeo: com os dois, valem as imagens (e o último frame entra como mais uma imagem). Avise e prefira um ou outro.

## No fim (curto, sempre igual)

```
✅ Fila pronta: <nome> (<N> vídeos)
1. No Flow: deixe Vídeo · <proporção> · x1
2. Painel da KbidFlow › Gerar › atualizar lista › escolha "<nome>" › Carregar
3. Clique em Gerar fila e deixe a aba do Flow na frente
Os vídeos caem em Downloads\<pasta>
```

Se a fila foi feita para **outra pessoa** gerar: diga para zipar a pasta que o script mostrou ("PARA MANDAR A ALGUÉM") e que quem recebe usa **abrir pasta** no painel.

Créditos: avise antes se forem muitos vídeos (o Flow mostra o custo no menu da caixa).
