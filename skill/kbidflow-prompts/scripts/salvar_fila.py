"""Salva uma fila (pacote) de prompts e imagens para a extensão KbidFlow e atualiza o índice que o painel lê.

Uso:
    python salvar_fila.py rascunho.json            (grava em todas as KbidFlow instaladas)
    python salvar_fila.py rascunho.json --pasta D:/IA/KbidFlow/filas

O rascunho é um JSON com:
{
  "titulo": "Economia Viva - dicas de cartão",
  "flow": {"modelo": "Veo 3.1 - Fast", "modo": "Elementos", "proporcao": "9:16",
           "duracao": "8s", "por_prompt": 1, "observacoes": "..."},
  "kbidflow": {"quality": "1080p", "folder": "KbidFlow/dicas-cartao", "prefix": "",
               "startNumber": 1, "maxParallel": 2, "chainFrames": false, "thenDownload": true},
  "imagens": ["D:/IA/.../sheet_rodrigo.jpg"],              (opcional: entram em todos os prompts)
  "prompts": [
    "prompt só de texto",
    {"texto": "prompt com imagens", "imagens": ["C:/fotos/escritorio.jpg"], "inicio": "C:/fotos/frame1.png"}
  ]
}
Caminhos de imagem podem ser absolutos ou relativos ao rascunho. As imagens são copiadas para
filas/<id>/ com o prefixo da fila (o nome vira o nome da mídia no Flow) e a fila grava "pasta": "<id>".
Grava filas/<id>.json e acrescenta a fila em filas/index.json.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import sys
import unicodedata
from pathlib import Path

# Onde a extensão pode estar instalada: a pasta do repositório e a pasta do instalador (instalar.ps1).
# A fila é gravada em todas as que existirem. KBIDFLOW_FILAS força uma pasta específica.
EXTENSOES = [Path("D:/IA/KbidFlow"), Path(os.environ.get("LOCALAPPDATA", "")) / "KbidFlow" / "extensao"]
PALAVRAS_POR_SEGUNDO = 2.6  # fala natural em português; acima disso o Veo corta ou acelera
EXT_IMAGEM = {".png", ".jpg", ".jpeg", ".webp"}


def pastas_padrao() -> list[Path]:
    if os.environ.get("KBIDFLOW_FILAS"):
        return [Path(os.environ["KBIDFLOW_FILAS"])]
    achadas = [e / "filas" for e in EXTENSOES if (e / "manifest.json").exists()]
    if not achadas:
        raise SystemExit("ERRO: não achei a KbidFlow instalada. Use --pasta <pasta-da-extensão>/filas.")
    return achadas


def slug(texto: str) -> str:
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    return t[:50] or "fila"


def uma_linha(p: str) -> str:
    return re.sub(r"\s+", " ", str(p)).strip()


def segundos(duracao: str | int | None) -> int | None:
    m = re.search(r"\d+", str(duracao or ""))
    return int(m.group()) if m else None


def texto_de(p) -> str:
    return uma_linha(p if isinstance(p, str) else (p.get("texto") or p.get("text") or ""))


def lista(v) -> list[str]:
    return [str(x) for x in (v if isinstance(v, list) else [v] if v else [])]


def conferir(fila: dict) -> list[str]:
    avisos: list[str] = []
    textos = [texto_de(p) for p in fila["prompts"]]
    if not textos:
        raise SystemExit("ERRO: a fila não tem prompts.")
    dur_padrao = segundos(fila.get("flow", {}).get("duracao"))
    for i, (p, bruto) in enumerate(zip(textos, fila["prompts"]), 1):
        dur_take = segundos(bruto.get("duracao")) if isinstance(bruto, dict) and bruto.get("duracao") else dur_padrao
        if len(p) < 40:
            avisos.append(f"prompt {i}: muito curto ({len(p)} caracteres)")
        if len(p) > 1800:
            avisos.append(f"prompt {i}: muito longo ({len(p)} caracteres), o Flow pode cortar")
        falas = re.findall(r"[\"“]([^\"”]+)[\"”]", p)
        if falas and dur_take:
            palavras = sum(len(f.split()) for f in falas)
            limite = int(dur_take * PALAVRAS_POR_SEGUNDO)
            if palavras > limite:
                avisos.append(f"prompt {i}: fala com {palavras} palavras para {dur_take}s (máximo ~{limite})")
    repetidos = {p for p in textos if textos.count(p) > 1}
    if repetidos:
        avisos.append(f"{len(repetidos)} prompt(s) repetido(s) na fila")
    return avisos


def copiar_imagem(origem: Path, destino: Path) -> None:
    """Copia a imagem; PNG que virou .jpg é convertido (Pillow, ou o PowerShell do Windows se não houver Pillow)."""
    if not (origem.suffix.lower() == ".png" and destino.suffix == ".jpg"):
        shutil.copy2(origem, destino)
        return
    try:
        from PIL import Image

        Image.open(origem).convert("RGB").save(destino, "JPEG", quality=95)
        return
    except ImportError:
        pass
    import subprocess

    ps = (
        "Add-Type -AssemblyName System.Drawing;"
        f"$i=[System.Drawing.Image]::FromFile('{origem}');"
        "$c=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|?{$_.MimeType -eq 'image/jpeg'};"
        "$p=New-Object System.Drawing.Imaging.EncoderParameters 1;"
        "$p.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]95);"
        f"$i.Save('{destino}',$c,$p);$i.Dispose()"
    )
    r = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True)
    if r.returncode != 0 or not destino.exists():
        shutil.copy2(origem, destino.with_suffix(".png"))
        raise SystemExit(f"ERRO: não consegui converter {origem.name} para JPG. Instale o Pillow: pip install pillow")


def coletar_imagens(fila: dict, base: Path, prefixo: str) -> tuple[dict[str, Path], list[str]]:
    """Troca os caminhos das imagens por nomes do pacote. Devolve {nome_no_pacote: arquivo_original} e avisos."""
    origem: dict[str, Path] = {}
    avisos: list[str] = []

    def nome_para(caminho: str) -> str:
        p = Path(caminho)
        if not p.is_absolute():
            p = (base / p).resolve()
        if not p.exists():
            raise SystemExit(f"ERRO: imagem não encontrada: {p}")
        if p.suffix.lower() not in EXT_IMAGEM:
            raise SystemExit(f"ERRO: {p.name} não é PNG, JPG ou WEBP")
        if p.stat().st_size > 15 * 1024 * 1024:
            avisos.append(f"{p.name} tem mais de 15 MB; o envio ao Flow pode demorar")
        # PNG grande vira JPG 95: o pacote vai inteiro numa mensagem do Chrome (limite de 64 MB)
        ext = ".jpg" if p.suffix.lower() == ".png" and p.stat().st_size > 4 * 1024 * 1024 else p.suffix.lower()
        nome = f"{prefixo}_{slug(p.stem)[:40]}{ext}"
        n = 2
        while nome in origem and origem[nome] != p:
            nome = f"{prefixo}_{slug(p.stem)[:40]}-{n}{ext}"
            n += 1
        origem[nome] = p
        return nome

    fila["imagens"] = [nome_para(c) for c in lista(fila.get("imagens") or fila.get("images"))]
    fila.pop("images", None)
    novos = []
    for p in fila["prompts"]:
        if isinstance(p, str):
            novos.append(uma_linha(p))
            continue
        item = {"texto": texto_de(p)}
        imgs = [nome_para(c) for c in lista(p.get("imagens") or p.get("images"))]
        if imgs:
            item["imagens"] = imgs
        if p.get("inicio") or p.get("start"):
            item["inicio"] = nome_para(p.get("inicio") or p.get("start"))
        # ajustes por take: nome do arquivo, duração (4/6/8/10 s) e continuar do último frame do take anterior
        if p.get("nome"):
            item["nome"] = str(p["nome"])
        if p.get("duracao"):
            item["duracao"] = int(re.search(r"\d+", str(p["duracao"])).group())
        if p.get("continuar"):
            item["continuar"] = True
        if p.get("continuar_de"):
            item["continuar_de"] = str(p["continuar_de"])
        novos.append(item if len(item) > 1 else item["texto"])
    fila["prompts"] = novos
    if not fila["imagens"]:
        fila.pop("imagens")
    return origem, avisos


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rascunho", type=Path)
    ap.add_argument("--pasta", type=Path, default=None, help="pasta filas/ de uma KbidFlow (padrão: todas as instaladas)")
    args = ap.parse_args()
    pastas = [args.pasta] if args.pasta else pastas_padrao()

    fila = json.loads(args.rascunho.read_text(encoding="utf-8"))
    fila["titulo"] = uma_linha(fila.get("titulo") or args.rascunho.stem)
    fila["prompts"] = [p for p in fila.get("prompts", []) if texto_de(p)]
    fila.setdefault("flow", {})
    k = fila.setdefault("kbidflow", {})
    k.setdefault("quality", "1080p")
    k.setdefault("folder", f"KbidFlow/{slug(fila['titulo'])}")
    k.setdefault("thenDownload", True)
    k.setdefault("maxParallel", 2)
    hoje = dt.date.today().isoformat()
    fila["criada"] = hoje

    avisos = conferir(fila)
    origem, avisos_img = coletar_imagens(fila, args.rascunho.resolve().parent, slug(fila["titulo"])[:20])
    avisos += avisos_img

    pastas_prontas: list[Path] = []
    for pasta in pastas:
        pasta.mkdir(parents=True, exist_ok=True)
        ident = f"{hoje}_{slug(fila['titulo'])}"
        n = 2
        while (pasta / f"{ident}.json").exists():
            ident = f"{hoje}_{slug(fila['titulo'])}-v{n}"
            n += 1
        saida = dict(fila)
        # Pasta autocontida: imagens + fila.json. Dá para zipar e mandar; quem recebe usa "abrir pasta" no painel.
        destino_img = pasta / ident
        destino_img.mkdir(parents=True, exist_ok=True)
        for nome, arquivo in origem.items():
            copiar_imagem(arquivo, destino_img / nome)
        if origem:
            saida["pasta"] = ident
        destino = pasta / f"{ident}.json"
        destino.write_text(json.dumps(saida, ensure_ascii=False, indent=2), encoding="utf-8")
        avulsa = {k2: v for k2, v in saida.items() if k2 != "pasta"}
        (destino_img / "fila.json").write_text(json.dumps(avulsa, ensure_ascii=False, indent=2), encoding="utf-8")
        pastas_prontas.append(destino_img)

        idx_path = pasta / "index.json"
        idx = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else {"filas": []}
        idx.setdefault("filas", []).append(
            {"arquivo": destino.name, "titulo": fila["titulo"], "criada": hoje, "prompts": len(fila["prompts"]),
             "imagens": len(origem)}
        )
        idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"OK: {destino}" + (f"  (+{len(origem)} imagens em {destino.parent / ident})" if origem else ""))

    print(f"{len(fila['prompts'])} prompts · pasta de download: Downloads/{k['folder']}")
    print(f"PARA MANDAR A ALGUÉM: zipe a pasta {pastas_prontas[0]} (quem recebe descompacta e usa 'abrir pasta' no painel)")
    for a in avisos:
        print("AVISO:", a)
    sys.exit(0)


if __name__ == "__main__":
    main()
