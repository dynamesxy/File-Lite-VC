$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$stamp = Get-Date -Format "yyyyMMddHHmm"

if (-not (Test-Path "node_modules")) {
  npm install
}

npm run build

if (-not (Test-Path ".venv-build")) {
  python -m venv .venv-build
}

& .\.venv-build\Scripts\Activate.ps1

python -m pip install --upgrade pip
python -m pip install -r .\api\requirements.txt
python -m pip install pyinstaller

python .\api\build_exe.py

$exePathFile = Join-Path (Get-Location) "release\bin\last_exe_path.txt"
$exe = $null
if (Test-Path $exePathFile) {
  $exe = Get-Content -Path $exePathFile -Raw
  $exe = $exe.Trim()
}
if (-not $exe) {
  $exe = Join-Path (Get-Location) "release\bin\File-Lite-VC.exe"
}
if (-not (Test-Path $exe)) {
  throw "Build failed: exe not found ($exe)"
}

$outDir = Join-Path (Get-Location) ("release\File-Lite-VC-no-python-" + $stamp)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Copy-Item -Force $exe (Join-Path $outDir "File-Lite-VC.exe")
Copy-Item -Force .\run.bat, .\run.ps1 (Join-Path $outDir ".")
Copy-Item -Force .\README.md (Join-Path $outDir "README.md")

$zipPath = Join-Path (Get-Location) ("release\File-Lite-VC-no-python-" + $stamp + ".zip")
$latestZipPath = Join-Path (Get-Location) "release\File-Lite-VC-no-python.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
if (Test-Path $latestZipPath) { Remove-Item -Force $latestZipPath }

Compress-Archive -Path $outDir\* -DestinationPath $zipPath
Copy-Item -Force $zipPath $latestZipPath

try { Remove-Item -Recurse -Force $outDir } catch { }

Write-Host "Release created: $zipPath"
Write-Host "Latest copy: $latestZipPath"
