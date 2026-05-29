$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (Test-Path ".\sqlftpvc.exe") {
  & .\sqlftpvc.exe
  exit $LASTEXITCODE
}

if (Test-Path ".\PORTABLE") {
  $env:PYTHONPATH = "$(Get-Location)\api"
  & .\.venv\Scripts\python.exe -m sqlftpvc
  exit $LASTEXITCODE
}

if (-not (Test-Path ".venv")) {
  python -m venv .venv
}

& .\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
if (Test-Path ".\api\wheels") {
  python -m pip install --no-index --find-links .\api\wheels -r .\api\requirements.txt
} else {
  python -m pip install -r .\api\requirements.txt
}

$env:PYTHONPATH = "$(Get-Location)\api"

python -m sqlftpvc

