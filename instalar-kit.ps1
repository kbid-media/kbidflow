# Kit da equipe: extensão KbidFlow + skill dos vídeos do Rodrigo e do Davi (repositório privado).
# Uso (PowerShell):
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/kbideditor1/kbidflow/main/instalar-kit.ps1)))
# Só conferir, sem instalar nada:  ... -Simular
# Nada secreto mora aqui: o acesso à skill vem do login do GitHub de quem roda, e a chave do ElevenLabs
# é colada na hora e fica só nas variáveis de usuário do Windows.

param(
    [string]$RepoSkill = "kbideditor1/ev-avatar-flow",
    [switch]$Simular
)

$ErrorActionPreference = "Continue"
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

# 2. Git e GitHub
Passo 2 "Git e login no GitHub"
if (-not (Tem git)) { Instalar "Git" "Git.Git" | Out-Null }
if (-not (Tem gh)) { Instalar "GitHub CLI" "GitHub.cli" | Out-Null }
if (Tem gh) {
    gh auth status *> $null
    if ($LASTEXITCODE -ne 0 -and -not $Simular) {
        Write-Host "  Vai abrir o navegador: entre no GitHub e clique em Authorize." -ForegroundColor Yellow
        gh auth login --web --git-protocol https --hostname github.com
    }
    gh auth status *> $null
    if ($LASTEXITCODE -eq 0) {
        if (-not $Simular) { gh auth setup-git *> $null }
        $resumo["Login no GitHub"] = "OK"
    } else { $resumo["Login no GitHub"] = "FALTA: rode de novo e faça o login" }
} else { $resumo["Login no GitHub"] = "FALTA: GitHub CLI não instalado" }

# 3. Skill dos vídeos do Rodrigo e do Davi
Passo 3 "Skill dos vídeos do Rodrigo e do Davi"
$item = Get-Item $skillDir -Force -ErrorAction SilentlyContinue
if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    $resumo["Skill Rodrigo/Davi"] = "OK (atalho para outra pasta, mantido)"
} elseif (Test-Path (Join-Path $skillDir ".git")) {
    if (-not $Simular) { git -C $skillDir pull --ff-only *> $null }
    $resumo["Skill Rodrigo/Davi"] = if ($LASTEXITCODE -eq 0 -or $Simular) { "OK (atualizada)" } else { "ERRO ao atualizar (git pull)" }
} elseif ($Simular) {
    $resumo["Skill Rodrigo/Davi"] = "simulado: clonaria $RepoSkill"
} else {
    New-Item -ItemType Directory -Force -Path (Split-Path $skillDir) | Out-Null
    gh repo clone $RepoSkill $skillDir *> $null
    $resumo["Skill Rodrigo/Davi"] = if (Test-Path (Join-Path $skillDir "SKILL.md")) { "OK" } else { "FALTA ACESSO: peça para a equipe te adicionar no repositório" }
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
if (-not $Simular) { Set-Clipboard -Value "$env:LOCALAPPDATA\KbidFlow\extensao" }
