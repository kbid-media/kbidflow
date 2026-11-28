# KbidFlow - instala ou atualiza a extensão a partir do último Release do GitHub (repositório público, sem login).
# Uso (PowerShell):
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/kbid-media/kbidflow/main/instalar.ps1)))

param(
    [string]$Repo = "kbid-media/kbidflow",
    [string]$Pasta = "$env:LOCALAPPDATA\KbidFlow\extensao"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

$tmp = Join-Path $env:TEMP ("kbidflow-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    Write-Host "Baixando a versão mais nova de $Repo..."
    $rel = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "kbidflow-instalador" }
    $asset = $rel.assets | Where-Object { $_.name -like "KbidFlow-*.zip" } | Select-Object -First 1
    if (-not $asset) { throw "O Release $($rel.tag_name) não tem o arquivo KbidFlow-*.zip." }
    Invoke-WebRequest $asset.browser_download_url -OutFile (Join-Path $tmp $asset.name) -UseBasicParsing
    $zip = Get-Item (Join-Path $tmp $asset.name)

    $primeira = -not (Test-Path (Join-Path $Pasta "manifest.json"))
    $antes = if (-not $primeira) { (Get-Content (Join-Path $Pasta "manifest.json") -Raw | ConvertFrom-Json).version } else { $null }

    $novo = Join-Path $tmp "x"
    Expand-Archive -Path $zip.FullName -DestinationPath $novo -Force
    if (-not (Test-Path (Join-Path $novo "manifest.json"))) { throw "O .zip não parece ser a extensão (sem manifest.json)." }

    # Troca o conteúdo da pasta fixa pela versão nova.
    New-Item -ItemType Directory -Force -Path $Pasta | Out-Null
    Get-ChildItem $Pasta -Force | Remove-Item -Recurse -Force
    Copy-Item (Join-Path $novo "*") $Pasta -Recurse -Force

    $versao = (Get-Content (Join-Path $Pasta "manifest.json") -Raw | ConvertFrom-Json).version
    Write-Host ""
    if ($primeira) {
        Write-Host "KbidFlow $versao instalada em $Pasta" -ForegroundColor Green
        Write-Host "Agora, uma vez só:"
        Write-Host "  1. Abra chrome://extensions e ligue o Modo do desenvolvedor"
        Write-Host "  2. Carregar sem compactação > escolha: $Pasta"
        Set-Clipboard -Value $Pasta
        Write-Host "  (o caminho já está copiado, é só colar)"
    } else {
        Write-Host "KbidFlow atualizada: $antes -> $versao" -ForegroundColor Green
        Write-Host "Em chrome://extensions, clique no botão de recarregar da KbidFlow e dê F5 na aba do Flow."
    }
}
finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
