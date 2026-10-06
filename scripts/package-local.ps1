param([string]$Python = "backend/.venv/Scripts/python.exe", [string]$Node = "node", [string]$DistPath = "release/npcs-ai-studio-preview")
$ErrorActionPreference = "Stop"
$TaskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $TaskRoot
$TaskDist = [System.IO.Path]::GetFullPath((Join-Path $TaskRoot $DistPath))
$TaskTarget = Join-Path $TaskDist "NPCsAIStudio"
if (-not $TaskTarget.StartsWith(($TaskRoot + [System.IO.Path]::DirectorySeparatorChar), [System.StringComparison]::OrdinalIgnoreCase)) { throw "Package output must stay inside the workspace" }
$TaskLauncher = Join-Path $TaskTarget "NPCsAIStudio.exe"
if (Test-Path -LiteralPath $TaskLauncher) {
    try { $TaskProbe = [System.IO.File]::Open($TaskLauncher, 'Open', 'ReadWrite', 'None'); $TaskProbe.Dispose() }
    catch { throw "The existing package is running or locked. Use -DistPath release/npcs-ai-studio-next to build a separate copy." }
}
& $Node node_modules/vite/bin/vite.js build --logLevel error
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
& $Node scripts/prepare-sites-build.mjs
if ($LASTEXITCODE -ne 0) { throw "Prototype output preparation failed" }
& $Node scripts/generate-help-guide.mjs --check
if ($LASTEXITCODE -ne 0) { throw "Bilingual help guides are out of sync" }
$TaskFrontend = Join-Path $TaskRoot "dist/client"
$TaskExamples = Join-Path $TaskRoot "docs/examples"
$TaskVersion = Join-Path $TaskRoot "scripts/windows-version.txt"
& $Python scripts/package-skills.py
if ($LASTEXITCODE -ne 0) { throw "Skill assets preparation failed" }
& $Python -m PyInstaller --noconfirm --name NPCsAIStudio --version-file $TaskVersion --onedir --console --distpath $TaskDist --workpath .local-build/pyinstaller --specpath .local-build --hidden-import ludo_npc.api.app --add-data "${TaskFrontend};frontend" --add-data "${TaskExamples};examples" backend/launcher.py
if ($LASTEXITCODE -ne 0) { throw "Windows package build failed" }
Copy-Item -LiteralPath (Join-Path $TaskRoot "docs/windows-preview-guide.md") -Destination (Join-Path $TaskTarget "README.md")
Copy-Item -LiteralPath (Join-Path $TaskRoot "docs/skill-collaboration-guide.md") -Destination (Join-Path $TaskTarget "skill-collaboration-guide.md")
foreach ($TaskGuideLanguage in @("zh", "en")) {
    Copy-Item -LiteralPath (Join-Path $TaskRoot "docs/user-guide-$TaskGuideLanguage.md") -Destination (Join-Path $TaskTarget "user-guide-$TaskGuideLanguage.md")
}
$TaskSkillsTarget = Join-Path $TaskTarget "skills"
New-Item -ItemType Directory -Path $TaskSkillsTarget -Force | Out-Null
foreach ($TaskSkillName in @("npcs-ai-studio-zh", "npcs-ai-studio-en")) {
    Copy-Item -LiteralPath (Join-Path $TaskRoot "skills/$TaskSkillName") -Destination $TaskSkillsTarget -Recurse -Force
}
Write-Output "Built $TaskTarget/NPCsAIStudio.exe (keep the entire NPCsAIStudio folder together)"
