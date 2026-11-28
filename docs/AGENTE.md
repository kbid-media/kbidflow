# 🤖 Fila do agente: gerar imagens e vídeos em série no Google Flow

A aba **Fila do agente** da KbidFlow manda uma lista de pedidos para o **agente do Flow** (o chat do lado direito do projeto), **um por vez**:
cola o pedido, clica em enviar, espera a geração terminar e só então manda o próximo. Você deixa rodando e confere no fim.

O método tem 4 partes. As 3 primeiras você faz **uma vez por projeto**.

| # | O quê | Onde | Quando |
|---|---|---|---|
| 1 | Criar o projeto e os **personagens** com as fotos | Flow › Personagens | 1 vez por projeto |
| 2 | Dar ao agente a **persona do artista** (estilo, regras, personagens) | painel do agente › configurações | 1 vez por projeto |
| 3 | Testar **1 pedido** à mão | caixa do agente | 1 vez |
| 4 | Rodar a **fila** | KbidFlow › 🤖 Fila do agente | sempre |

---

## 1 · Projeto e personagens (referências)

1. Crie um projeto novo no Flow para o anúncio (um projeto por série de anúncios).
2. No menu da esquerda, abra **Personagens** e crie um personagem para cada pessoa que aparece.
   - Suba as fotos **originais**: rosto de frente em alta, corpo inteiro em pé e, se tiver, o character sheet.
   - Dê ao personagem o **nome completo** da pessoa. É por esse nome que os pedidos chamam a referência.
3. Nunca use quadro de vídeo gerado por IA como foto de referência: o rosto deriva.

## 2 · A persona do artista (o "diretor de fotografia" do agente)

O agente segue melhor quando tem um **papel fixo**: um artista com nome, estilo e regras. Ele vale para todas as imagens e vídeos do projeto, para o visual não mudar de um take para o outro.

1. Abra o painel do agente (lado direito do projeto) e as **configurações/instruções** do agente.
2. Cole a persona. Modelo genérico: [`PERSONA_MODELO.md`](PERSONA_MODELO.md). A equipe tem a versão pronta com os personagens no kit.
3. Confira se a persona tem os 5 blocos:
   - **Quem ele é** (nome do artista e referências de estilo);
   - **Estilo visual** (formato, luz, lente, cor, composição com espaço para legenda, nada de texto na imagem);
   - **Personagens** (aparência, roupa, jeito, cuidados de proporção e pronúncia);
   - **Modo imagem** e **modo vídeo** (o que muda em cada um);
   - **O que ele nunca faz**.

## 3 · Como escrever um pedido

Cada pedido é um bloco de texto que **começa pelo modo**. É assim que o agente (e a fila) sabem se é foto ou vídeo.

```text
MODO: IMAGEM ESTÁTICA
Personagem: <Nome completo> (use as referências padrão dele)
Código: t01
Intenção do plano: <o que este plano conta no roteiro>
Pose/ação: <o que ele faz>

FICHA TÉCNICA DA IMAGEM
- Tipo: foto estática fotorrealista (NÃO é vídeo)
- Formato: vertical 9:16, maior resolução disponível
- Enquadramento: <close / médio / americano / conjunto>
- Ângulo de câmera: <altura dos olhos / plongée / contra-plongée / zenital> e ONDE a câmera está (ex.: apoiada no tampo da mesa)
- Lente e abertura: <ex.: 35 mm, f/1.8>
- Camadas: FRENTE <objeto e distância da lente> · MEIO <pessoa, nítida> · FUNDO <ambiente>
- Luz: <fonte principal e contorno>
- Expressão: boca FECHADA (o vídeo anima a fala a partir desta foto)
- A câmera é invisível: ninguém segura nem aponta objetos para a câmera, não é selfie
- Quantidade: 1 imagem
```

```text
MODO: VÍDEO
Personagem: <Nome completo> (use as referências padrão dele)
Código: t01
Frame inicial: t01 (a imagem do projeto com este nome)
Tom: <ex.: sério, pausado>
Fala (dizer exatamente assim, em português brasileiro): "<até ~20 palavras>"

FICHA TÉCNICA DO VÍDEO
- Tipo: VÍDEO animado a partir do frame inicial indicado (NÃO é imagem)
- Quantidade: 1 (UMA única saída). NÃO gere variações
- Modelo: <o modelo escolhido>. Não troque de modelo
- Formato: vertical 9:16, 720p
- Duração: 4, 6 ou 8 s (a menor que caiba a fala; nunca 10 s)
- Movimento de câmera: <rack focus / travelling / push-in / crane...>
- Áudio: só a voz; SEM música, SEM efeito sonoro
- Tela: SEM legenda, SEM texto, SEM logo
```

### Regras que aprendemos rodando

1. **Primeiro todas as imagens, depois os vídeos.** Confira as imagens (rosto, mãos, ângulo) antes de gastar créditos de vídeo.
2. **O vídeo acha o frame pelo nome.** Por isso o `Código` da imagem e o `Frame inicial` do vídeo têm de ser iguais.
3. **Nada de "continuar do último quadro".** O agente volta para o primeiro frame da cena anterior e a continuidade quebra. Se a fala é longa, divida em **dois planos diferentes** (outro ângulo no mesmo lugar), cada um com a sua imagem.
4. **Descreva onde a câmera está e a que distância fica o objeto da frente.** "Celular desfocado em primeiro plano" vira selfie; "celular deitado no tampo, a 20 cm da lente, câmera apoiada na mesa" funciona.
5. **Peça 1 saída por geração** e a duração certa: economiza créditos.

## 4 · Rodar a fila

1. Abra o projeto no Flow com o **painel do agente aberto** e dê F5.
2. Clique no ⚡ KbidFlow › aba **🤖 Fila do agente** › **Testar aba**. Tem que aparecer "caixa do agente: achei".
3. Cole os pedidos em **Colar pedidos**:
   - em JSON: `[{"cod":"t01","tipo":"imagem","texto":"MODO: IMAGEM ESTÁTICA ..."}]`;
   - ou em texto, com os pedidos separados por uma linha `=====`.
4. **Adicionar à fila** › **▶ Iniciar fila**. Deixe a aba do Flow aberta e **não digite na caixa do agente** enquanto roda.
5. Para cada pedido a fila espera: o agente responder, os cards da galeria pararem de gerar e uns 12 s sem nada mudar.
   - ✔ = gerou. ⚠ = o agente respondeu **sem gerar** (fez uma pergunta): a fila pausa, você responde no Flow e clica **repetir ⚠/✖**.
   - ✖ = falhou ou passou do limite (5 min por imagem, 15 min por vídeo, dá para mudar em Ajustes).
6. Com **"Ao terminar a fila, baixar os vídeos que ela gerou"** ligado (padrão), a fila termina e já chama o ⬇ Baixar só com os vídeos novos: no começo ela guarda o que já existia na galeria e, no fim, baixa o que é novo. Em **projeto novo** isso é exato. Sem a opção, baixe na aba **⬇ Baixar**.
7. Imagens e vídeos podem ir **numa fila só** (imagens primeiro): cada vídeo usa a imagem do mesmo código.

Se algo sair estranho, mande um print do **Registro da fila** para a equipe.
