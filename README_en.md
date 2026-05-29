# Visual Intranet SQL Script Version Control Tool (`sqlftpvc`)

## One-Click Run
- Windows: double-click or execute `run.bat` (or `powershell -ExecutionPolicy Bypass -File run.ps1`)
- Linux/macOS: execute `bash run.sh`

After startup, open `http://127.0.0.1:8848/`.

Notes:
- If `sqlftpvc.exe` (Windows) or `sqlftpvc` (Linux/macOS) exists in the current directory, the `run.*` script starts that executable first, so the target machine does not need Python.
- On first launch, the tool creates `.venv` and installs dependencies from `api/requirements.txt`.
- If the intranet machine cannot access the internet, put wheel files into `api/wheels/`. The scripts automatically switch to `--no-index --find-links` offline installation.

## Basic Workflow
1. Go to `Settings`, configure FTP, and save it to the current project.
2. In `Dashboard`, create a project and set the local workspace path and remote path.
3. Click `Pull` to preview differences, then confirm and apply.
4. After changing local SQL files, click `Commit Version` and enter a commit message.
5. Open `Versions & Compare` to compare two versions or `Workspace vs Version`.
6. Click `Upload` to preview differences, then confirm and apply.

## Development Mode
1. Frontend: `npm run dev`
2. Backend:
   - Create a virtual environment and install dependencies: `python -m venv .venv && .\.venv\Scripts\python -m pip install -r api\requirements.txt`
   - Start: `set PYTHONPATH=%cd%\api && .\.venv\Scripts\python -m sqlftpvc`

The frontend already proxies `/api` to `http://127.0.0.1:8848` in `vite.config.ts`.

## Build Artifacts
- Windows: run `powershell -ExecutionPolicy Bypass -File package_release.ps1` to generate `release/sqlftpvc.zip`
- Linux/macOS: run `bash package_release.sh` to generate `release/sqlftpvc.tgz`

### No-Python Package
- Windows: run `powershell -ExecutionPolicy Bypass -File package_release_no_python.ps1` to generate `release/sqlftpvc-no-python.zip`
- Linux/macOS: run `bash package_release_no_python.sh` to generate `release/sqlftpvc-no-python.tgz`

Notes:
- The no-Python package must be built on a machine that has Python and Node installed.
- The generated package should run on a target machine with the same operating system and architecture.

### Portable Python Package
If only the build machine has Python and Node, and the target intranet machine has neither, use the portable package:
- Windows: run `powershell -ExecutionPolicy Bypass -File package_release_portable_windows.ps1` to generate `release/sqlftpvc-portable.zip`

Portable package features:
- The archive contains `.venv`, including the Python interpreter and dependencies.
- The target machine only needs to extract and run `run.bat`.
- No dependency installation or internet access is required on the target machine.

## Self Check
- Frontend: `npm run check`, `npm run lint`
- Backend:
  - Windows PowerShell: `$env:PYTHONPATH="$pwd\api"; .\\.venv\\Scripts\\python -m unittest discover -s api\\tests -p "test_*.py" -q`
