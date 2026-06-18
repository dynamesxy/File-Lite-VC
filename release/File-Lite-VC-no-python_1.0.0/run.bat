@echo off
setlocal

cd /d %~dp0

if exist File-Lite-VC.exe (
  File-Lite-VC.exe
  exit /b %errorlevel%
)

if exist sqlftpvc.exe (
  sqlftpvc.exe
  exit /b %errorlevel%
)

if exist PORTABLE (
  set PYTHONPATH=%cd%\api
  .venv\Scripts\python.exe -m sqlftpvc
  exit /b %errorlevel%
)

if not exist .venv (
  python -m venv .venv
)

call .venv\Scripts\activate.bat

python -m pip install --upgrade pip
if exist api\wheels (
  python -m pip install --no-index --find-links api\wheels -r api\requirements.txt
) else (
  python -m pip install -r api\requirements.txt
)

set PYTHONPATH=%cd%\api

python -m file_lite_vc
