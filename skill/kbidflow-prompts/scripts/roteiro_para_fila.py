"""Transforma um roteiro de takes (formato do prompts_flow_v2.md) numa fila da KbidFlow, só com o que falta no Flow.

Uso:
    python roteiro_para_fila.py ROTEIRO.md --titulos titulos.txt [--frames PASTA] [--titulo "Nome"]
                                [--download KbidFlow/nome] [--so v4_t03,v4_t07] [--imagens a.jpg,b.jpg] [--simular]

Formato do roteiro (cada take):
    ## v4_t03 · 8 s
    Imagem inicial: `v4_t03_frame_v1.png`          (ou: `último quadro do take v4_t04a`, ou sem essa linha)
    ```
    prompt do take, pode ter várias linhas
    ```

--titulos: o texto copiado no painel da KbidFlow ("📋 copiar títulos do projeto"). Takes que já aparecem lá ficam de fora.
Sem --titulos, entram todos os takes do roteiro.
Gera o rascunho e chama salvar_fila.py, que copia os frames e grava a fila em toda KbidFlow instalada.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

TAKE_RE = re.compile(
    r"^##\s+(?P<nome>[\w.-]+)\s*·\s*(?P<dur>\d+)\s*s\b.*?$"  # ## v4_t03 · 8 s
    r"(?P<corpo>.*?)"
    r"^```[^\n]*\n(?P<prompt>.*?)\n```",
    re.S | re.M,
)
INICIO_RE = re.compile(r"Imagem inicial:\s*`([^`]+)`", re.I)
ULTIMO_RE = re.compile(r"último quadro do take\s+([\w.-]+)", re.I)


def ler_roteiro(md: str) -> list[dict]:
    takes = []
    for m in TAKE_RE.finditer(md):
        inicio = INICIO_RE.search(m.group("corpo"))
        ref = inicio.group(1).strip() if inicio else None
        ultimo = ULTIMO_RE.search(ref or "")
        takes.append(
            {
                "nome": m.group("nome"),
                "duracao": int(m.group("dur")),
                "frame": None if (ultimo or not ref) else ref,
                "continua_de": ultimo.group(1) if ultimo else None,
                "texto": re.sub(r"\s+", " ", m.group("prompt")).strip(),
            }
        )
    return takes


def existentes(texto: str, nomes: list[str]) -> set[str]:
    return {n for n in nomes if re.search(rf"(?<![\w.-]){re.escape(n)}(?![\w.-])", texto)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("roteiro", type=Path)
    ap.add_argument("--titulos", type=Path, help="arquivo com o texto copiado no painel (📋 copiar títulos do projeto)")
    ap.add_argument("--frames", type=Path, help="pasta dos frames (padrão: <pasta do roteiro>/frames)")
    ap.add_argument("--titulo", help="nome da fila no painel")
    ap.add_argument("--download", help="pasta em Downloads (padrão: KbidFlow/<nome do roteiro>)")
    ap.add_argument("--so", help="só estes takes, separados por vírgula")
    ap.add_argument("--imagens", help="imagens que entram em todos os takes (caminhos separados por vírgula)")
    ap.add_argument("--simular", action="store_true", help="só mostra o que entraria, sem salvar")
    a = ap.parse_args()

    md = a.roteiro.read_text(encoding="utf-8")
    takes = ler_roteiro(md)
    if not takes:
        raise SystemExit("ERRO: não achei nenhum take no formato '## nome · N s' + bloco ``` no roteiro.")
    frames = a.frames or a.roteiro.parent / "frames"
    ja = existentes(a.titulos.read_text(encoding="utf-8"), [t["nome"] for t in takes]) if a.titulos else set()
    so = {s.strip() for s in a.so.split(",")} if a.so else None

    escolhidos = [t for t in takes if t["nome"] not in ja and (so is None or t["nome"] in so)]
    if not escolhidos:
        print("Nada a fazer: todos os takes do roteiro já estão no Flow.")
        return

    nomes_na_fila = [t["nome"] for t in escolhidos]
    prompts, linhas = [], []
    for i, t in enumerate(escolhidos):
        item = {"nome": t["nome"], "texto": t["texto"], "duracao": t["duracao"]}
        if t["frame"]:
            f = frames / t["frame"]
            if not f.exists():
                raise SystemExit(f"ERRO: o frame {f} não existe (take {t['nome']}).")
            item["inicio"] = str(f)
            origem = t["frame"]
        elif t["continua_de"]:
            anterior = nomes_na_fila[i - 1] if i > 0 else None
            if anterior == t["continua_de"]:
                item["continuar"] = True
                origem = f"último quadro do {t['continua_de']} (gerado logo antes, nesta fila)"
            elif t["continua_de"] in ja:
                item["continuar_de"] = t["continua_de"]
                origem = f"último quadro do {t['continua_de']} (que já está no Flow)"
            else:
                raise SystemExit(
                    f"ERRO: {t['nome']} continua do {t['continua_de']}, que não está no Flow nem logo antes na fila. "
                    f"Inclua o {t['continua_de']} na fila (--so) ou gere-o antes."
                )
        else:
            origem = "só texto"
        prompts.append(item)
        linhas.append(f"  {t['nome']:<10} {t['duracao']:>2} s  <- {origem}")

    print(f"Já no Flow: {', '.join(sorted(ja)) or 'nenhum'}")
    print(f"Entram na fila ({len(prompts)}):")
    print("\n".join(linhas))
    if a.simular:
        return

    base = a.roteiro.stem
    fila = {
        "titulo": a.titulo or f"{base} - takes que faltam",
        "flow": {
            "modo": "Vídeo",
            "proporcao": "9:16",
            "duracao": "por take",
            "por_prompt": 1,
            "observacoes": "Deixe Vídeo, a proporção da série e x1. A KbidFlow põe o frame de cada take e troca a duração sozinha.",
        },
        "kbidflow": {
            "quality": "1080p",
            "folder": a.download or f"KbidFlow/{re.sub(r'[^a-zA-Z0-9]+', '-', base).strip('-').lower()}",
            "maxParallel": 1,
            "thenDownload": True,
        },
        "prompts": prompts,
    }
    if a.imagens:
        fila["imagens"] = [s.strip() for s in a.imagens.split(",") if s.strip()]
    rascunho = Path(tempfile.gettempdir()) / f"kbidflow_{base}.json"
    rascunho.write_text(json.dumps(fila, ensure_ascii=False, indent=2), encoding="utf-8")
    r = subprocess.run([sys.executable, str(Path(__file__).with_name("salvar_fila.py")), str(rascunho)])
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
