"""Salva uma fila de prompts para a extensão KbidFlow e atualiza o índice que o painel lê.

Uso:
    python salvar_fila.py rascunho.json
    python salvar_fila.py rascunho.json --pasta D:/IA/KbidFlow/filas

O rascunho é um JSON com:
{
  "titulo": "Economia Viva - dicas de cartão",
  "flow": {"modelo": "Veo 3.1 - Fast", "modo": "Texto para vídeo", "proporcao": "9:16",
           "duracao": "8s", "por_prompt": 1, "observacoes": "..."},
  "kbidflow": {"quality": "1080p", "folder": "KbidFlow/dicas-cartao", "prefix": "",
               "startNumber": 1, "maxParallel": 2, "thenDownload": true},
  "prompts": ["prompt 1", "prompt 2"]
}
Grava filas/<AAAA-MM-DD>_<slug>.json e acrescenta a fila em filas/index.json.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import unicodedata
from pathlib import Path

PASTA_PADRAO = Path("D:/IA/KbidFlow/filas")
PALAVRAS_POR_SEGUNDO = 2.6  # fala natural em português; acima disso o Veo corta ou acelera


def slug(texto: str) -> str:
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    return t[:50] or "fila"


def uma_linha(p: str) -> str:
    return re.sub(r"\s+", " ", str(p)).strip()


def segundos(duracao: str | int | None) -> int | None:
    m = re.search(r"\d+", str(duracao or ""))
    return int(m.group()) if m else None


def conferir(fila: dict) -> list[str]:
    avisos: list[str] = []
    prompts = fila["prompts"]
    if not prompts:
        raise SystemExit("ERRO: a fila não tem prompts.")
    dur = segundos(fila.get("flow", {}).get("duracao"))
    for i, p in enumerate(prompts, 1):
        if len(p) < 40:
            avisos.append(f"prompt {i}: muito curto ({len(p)} caracteres)")
        if len(p) > 1800:
            avisos.append(f"prompt {i}: muito longo ({len(p)} caracteres), o Flow pode cortar")
        falas = re.findall(r"[\"“]([^\"”]+)[\"”]", p)
        if falas and dur:
            palavras = sum(len(f.split()) for f in falas)
            limite = int(dur * PALAVRAS_POR_SEGUNDO)
            if palavras > limite:
                avisos.append(f"prompt {i}: fala com {palavras} palavras para {dur}s (máximo ~{limite})")
    repetidos = {p for p in prompts if prompts.count(p) > 1}
    if repetidos:
        avisos.append(f"{len(repetidos)} prompt(s) repetido(s) na fila")
    return avisos


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rascunho", type=Path)
    ap.add_argument("--pasta", type=Path, default=PASTA_PADRAO)
    args = ap.parse_args()

    fila = json.loads(args.rascunho.read_text(encoding="utf-8"))
    fila["titulo"] = uma_linha(fila.get("titulo") or args.rascunho.stem)
    fila["prompts"] = [uma_linha(p) for p in fila.get("prompts", []) if uma_linha(p)]
    fila.setdefault("flow", {})
    k = fila.setdefault("kbidflow", {})
    k.setdefault("quality", "1080p")
    k.setdefault("folder", f"KbidFlow/{slug(fila['titulo'])}")
    k.setdefault("thenDownload", True)
    k.setdefault("maxParallel", 2)
    hoje = dt.date.today().isoformat()
    fila["criada"] = hoje

    avisos = conferir(fila)

    args.pasta.mkdir(parents=True, exist_ok=True)
    nome = f"{hoje}_{slug(fila['titulo'])}.json"
    destino = args.pasta / nome
    n = 2
    while destino.exists():
        nome = f"{hoje}_{slug(fila['titulo'])}-v{n}.json"
        destino = args.pasta / nome
        n += 1
    destino.write_text(json.dumps(fila, ensure_ascii=False, indent=2), encoding="utf-8")

    idx_path = args.pasta / "index.json"
    idx = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else {"filas": []}
    idx.setdefault("filas", []).append(
        {"arquivo": nome, "titulo": fila["titulo"], "criada": hoje, "prompts": len(fila["prompts"])}
    )
    idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"OK: {destino}")
    print(f"{len(fila['prompts'])} prompts · pasta de download: Downloads/{k['folder']}")
    for a in avisos:
        print("AVISO:", a)
    sys.exit(0)


if __name__ == "__main__":
    main()
