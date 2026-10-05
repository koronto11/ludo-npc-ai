param([string]$Python = "backend/.venv/Scripts/python.exe", [string]$Node = "node")
$ErrorActionPreference = "Stop"
$TaskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $TaskRoot
& $Node node_modules/vite/bin/vite.js build --logLevel error
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
& $Node scripts/prepare-sites-build.mjs
if ($LASTEXITCODE -ne 0) { throw "Prototype output preparation failed" }
$TaskFrontend = Join-Path $TaskRoot "dist/client"
$TaskExamples = Join-Path $TaskRoot "docs/examples"
& $Python -m PyInstaller --noconfirm --name LudoNPC --onedir --console --distpath release --workpath .local-build/pyinstaller --specpath .local-build --hidden-import ludo_npc.api.app --add-data "${TaskFrontend};frontend" --add-data "${TaskExamples};examples" backend/launcher.py
if ($LASTEXITCODE -ne 0) { throw "Windows package build failed" }
Write-Output "Built release/LudoNPC/LudoNPC.exe (keep the entire LudoNPC folder together)"
