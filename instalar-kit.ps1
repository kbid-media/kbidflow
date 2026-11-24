# Kit da equipe: extensão KbidFlow + skill dos vídeos do Rodrigo e do Davi.
# Uso (PowerShell):
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/kbideditor1/kbidflow/main/instalar-kit.ps1)))
# Só conferir, sem instalar nada:  ... -Simular
# Nada secreto mora aqui: as fotos vêm num .zip mandado no privado e a chave do ElevenLabs
# é colada na hora (fica só nas variáveis de usuário do Windows).

param(
    [string]$RepoSkill = "kbideditor1/ev-avatar-flow",
    [string]$ZipFotos = "",
    [switch]$Simular
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$resumo = [ordered]@{}
$skillDir = Join-Path $env:USERPROFILE ".claude\skills\ev-avatar-flow"

function Passo($n, $t) { Write-Host ""; Write-Host "[$n/7] $t" -ForegroundColor Cyan }
function Tem($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function AtualizarPath {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function Instalar($nome, $id) {
    if ($Simular) { Write-Host "  (simulação) instalaria $nome"; return $false }
    if (-not (Tem winget)) { Write-Host "  Instale o $nome pela internet e rode este comando de novo." -ForegroundColor Yellow; return $false }
    Read-Host "  Vou instalar o $nome. Aperte Enter" | Out-Null
    winget install --id $id -e
    AtualizarPath
    return $true
}
function PythonOk {
    if (-not (Tem python)) { return $false }
    $v = & python -c "import sys; print(sys.version_info[0])" 2>$null
    return ($v -eq "3")
}
function FotosOk { Test-Path (Join-Path $skillDir "personagens\rodrigo\sheet.jpg") }

Write-Host "Kit da equipe KbidFlow: vou preparar tudo. Siga o que aparecer na tela." -ForegroundColor Green

# 1. Extensão KbidFlow
Passo 1 "Extensão KbidFlow"
try {
    if ($Simular) { Write-Host "  (simulação) baixaria a extensão do último Release"; $resumo["Extensão KbidFlow"] = "simulado" }
    else {
        & ([scriptblock]::Create((Invoke-RestMethod "https://raw.githubusercontent.com/kbideditor1/kbidflow/main/instalar.ps1")))
        $resumo["Extensão KbidFlow"] = "OK"
    }
} catch { $resumo["Extensão KbidFlow"] = "ERRO: $($_.Exception.Message)" }

# 2. Skill dos vídeos do Rodrigo e do Davi (repositório público, sem as fotos)
Passo 2 "Skill dos vídeos do Rodrigo e do Davi"
$item = Get-Item $skillDir -Force -ErrorAction SilentlyContinue
if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    $resumo["Skill Rodrigo/Davi"] = "OK (atalho para outra pasta, mantido)"
} elseif ($Simular) {
    $resumo["Skill Rodrigo/Davi"] = "simulado: baixaria $RepoSkill"
} else {
    try {
        $tmp = Join-Path $env:TEMP ("kbid-skill-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $tmp | Out-Null
        $zip = Join-Path $tmp "skill.zip"
        Invoke-WebRequest "https://codeload.github.com/$RepoSkill/zip/refs/heads/main" -OutFile $zip -UseBasicParsing
        Expand-Archive $zip -DestinationPath $tmp -Force
        $raiz = Get-ChildItem $tmp -Directory | Select-Object -First 1
        New-Item -ItemType Directory -Force -Path $skillDir | Out-Null
        # copia por cima: atualiza a skill e mantém as fotos que já estão lá
        Copy-Item (Join-Path $raiz.FullName "*") $skillDir -Recurse -Force
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
        $resumo["Skill Rodrigo/Davi"] = "OK"
    } catch { $resumo["Skill Rodrigo/Davi"] = "ERRO ao baixar: $($_.Exception.Message)" }
}

# 3. Fotos e sheets (zip mandado no privado)
Passo 3 "Fotos do Rodrigo e do Davi"
if (FotosOk) { $resumo["Fotos"] = "OK (já estavam)" }
elseif ($Simular) { $resumo["Fotos"] = "simulado: pediria o fotos_rodrigo_davi.zip" }
else {
    $caminho = $ZipFotos
    if (-not $caminho) {
        Write-Host "  Arraste aqui o arquivo fotos_rodrigo_davi.zip (que te mandaram no WhatsApp)" -ForegroundColor Yellow
        $caminho = Read-Host "  e aperte Enter (ou só Enter para pular)"
    }
    $caminho = $caminho.Trim().Trim('"').Trim("'")
    if ($caminho -and (Test-Path $caminho)) {
        Expand-Archive $caminho -DestinationPath $skillDir -Force
        $resumo["Fotos"] = if (FotosOk) { "OK" } else { "ERRO: o zip não tem personagens\rodrigo\sheet.jpg" }
    } else { $resumo["Fotos"] = "FALTA: rode de novo e arraste o fotos_rodrigo_davi.zip" }
}

# 4. Python e pacotes
Passo 4 "Python"
if (-not (PythonOk)) { Instalar "Python 3.12" "Python.Python.3.12" | Out-Null }
if (PythonOk) {
    $req = Join-Path $skillDir "requirements.txt"
    if ((Test-Path $req) -and -not $Simular) { python -m pip install --user --quiet -r $req }
    $resumo["Python"] = "OK"
} else { $resumo["Python"] = "FALTA: instale o Python 3.12 e rode de novo" }

# 5. FFmpeg
Passo 5 "FFmpeg"
if (-not (Tem ffmpeg)) { Instalar "FFmpeg" "Gyan.FFmpeg" | Out-Null }
$resumo["FFmpeg"] = if (Tem ffmpeg) { "OK" } else { "FALTA: feche e abra o PowerShell e rode de novo" }

# 6. Chave do ElevenLabs (voz clonada)
Passo 6 "Chave do ElevenLabs"
$chave = [Environment]::GetEnvironmentVariable("ELEVENLABS_API_KEY", "User")
if ($chave) { $resumo["Chave ElevenLabs"] = "OK (já estava salva)" }
elseif ($Simular) { $resumo["Chave ElevenLabs"] = "simulado: pediria a chave" }
else {
    $seg = Read-Host "  Cole a chave do ElevenLabs que a equipe te mandou (Enter para pular)" -AsSecureString
    $txt = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seg))
    if ($txt.Trim()) {
        [Environment]::SetEnvironmentVariable("ELEVENLABS_API_KEY", $txt.Trim(), "User")
        $resumo["Chave ElevenLabs"] = "OK"
    } else { $resumo["Chave ElevenLabs"] = "FALTA: rode de novo e cole a chave" }
}

# 7. Claude Code + Higgsfield
Passo 7 "Claude Code e Higgsfield"
if (Tem claude) {
    $lista = claude mcp list 2>$null | Out-String
    if ($lista -match "higgsfield") { $resumo["Higgsfield no Claude"] = "OK" }
    elseif ($Simular) { $resumo["Higgsfield no Claude"] = "simulado: adicionaria o Higgsfield" }
    else {
        claude mcp add --transport http --scope user higgsfield https://mcp.higgsfield.ai/mcp *> $null
        $resumo["Higgsfield no Claude"] = "FALTA LOGIN: no Claude Code digite /mcp, escolha higgsfield e entre"
    }
    $resumo["Claude Code"] = "OK"
} else {
    $resumo["Claude Code"] = "FALTA: instale em https://claude.com/claude-code e rode este comando de novo"
}

# Resumo
Write-Host ""
Write-Host "================ RESUMO ================" -ForegroundColor Green
foreach ($k in $resumo.Keys) {
    $v = $resumo[$k]
    $cor = if ($v -like "OK*") { "Green" } elseif ($v -like "simulad*") { "Gray" } else { "Yellow" }
    $marca = if ($v -like "OK*") { "[OK]" } else { "[!!]" }
    Write-Host ("{0} {1}: {2}" -f $marca, $k, $v) -ForegroundColor $cor
}
Write-Host ""
Write-Host "Falta só o Chrome (uma vez):" -ForegroundColor Cyan
Write-Host "  1. Abra chrome://extensions e ligue o Modo do desenvolvedor"
Write-Host "  2. Carregar sem compactação > cole o caminho (Ctrl+V): $env:LOCALAPPDATA\KbidFlow\extensao"
Write-Host "  3. Fixe o raio (KbidFlow) no Chrome"
Write-Host ""
Write-Host "Depois, abra o Claude Code e diga: quero um take do Rodrigo falando: ..." -ForegroundColor Green
if (-not $Simular) {
    Set-Clipboard -Value "$env:LOCALAPPDATA\KbidFlow\extensao"
    Write-Host "Abrindo o guia no navegador..." -ForegroundColor Cyan
    Start-Process "https://github.com/kbideditor1/ev-avatar-flow/blob/main/COMECE-AQUI.md"
}
