$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$stamp = Get-Date -Format "yyyyMMddHHmm"
$version = $null
try {
  $pkg = Get-Content -Path ".\package.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  $version = ($pkg.version | ForEach-Object { "$_" }).Trim()
} catch {
  $version = $null
}
if (-not $version) {
  $version = "0.0.0"
}

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

$outDir = Join-Path (Get-Location) ("release\File-Lite-VC-no-python_" + $version)
if (Test-Path $outDir) {
  Remove-Item -Recurse -Force $outDir
}
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Copy-Item -Force $exe (Join-Path $outDir "File-Lite-VC.exe")
Copy-Item -Force .\run.bat, .\run.ps1 (Join-Path $outDir ".")
Copy-Item -Force .\README.md (Join-Path $outDir "README.md")
if (Test-Path .\操作手册_sqlftpvc.md) { Copy-Item -Force .\操作手册_sqlftpvc.md (Join-Path $outDir "操作手册_sqlftpvc.md") }
if (Test-Path .\操作手册_sqlftpvc_en.md) { Copy-Item -Force .\操作手册_sqlftpvc_en.md (Join-Path $outDir "操作手册_sqlftpvc_en.md") }

Write-Host "Release folder created: $outDir"
