# KbidFlow - gera dist\KbidFlow-<versão>.zip só com os arquivos da extensão.
# Uso: powershell -ExecutionPolicy Bypass -File empacotar.ps1
$ErrorActionPreference = "Stop"
$raiz = $PSScriptRoot
$versao = (Get-Content (Join-Path $raiz "manifest.json") -Raw | ConvertFrom-Json).version
$dist = Join-Path $raiz "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$saida = Join-Path $dist "KbidFlow-$versao.zip"
if (Test-Path $saida) { Remove-Item $saida -Force }
$itens = @("manifest.json", "background.js", "content.js", "sidepanel.html", "sidepanel.css", "sidepanel.js", "agente.js", "agente-panel.js", "novidades.js", "icons", "docs", "README.md") |
    ForEach-Object { Join-Path $raiz $_ }
Compress-Archive -Path $itens -DestinationPath $saida
Write-Host "OK: $saida"
