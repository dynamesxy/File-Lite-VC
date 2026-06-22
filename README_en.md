# File-Lite-VC (Lightweight file management tool)

[English](README_en.md) | [中文](README.md)

This tool manages scripts/files in intranet environments:
- Local version snapshots + visual Diff
- Sync modes: FTP (pull/push) or Local Directory (pull/push to a target folder)
- Line-by-line conflict resolver (choose Local/Remote per conflict line)
- Rollback is **local-workspace only** (remote is never rolled back)

Web UI: `http://127.0.0.1:8848/`

---

## 1. One-Click Run (Recommended for Intranet Users)

### 1.1 Packaged Build (No Python Required on Target)
Use the output folder `release/File-Lite-VC-no-python_<version>/` (the version is read from `package.json` → `version`):
1. Copy to the target intranet machine
2. Copy the folder to any directory (avoid protected directories like `C:\Program Files`)
3. Windows: run `run.bat` or double-click `File-Lite-VC.exe`
4. Open `http://127.0.0.1:8848/` in the browser

If the port is occupied:
```bat
set FILE_LITE_VC_PORT=8850
File-Lite-VC.exe
```

### 1.2 Source / Unpackaged (Target Has Python)
In the repository root (contains `api\` and `dist\`):

CMD:
```bat
call .venv\Scripts\activate.bat
set PYTHONPATH=%cd%\api
python -m file_lite_vc
```

PowerShell:
```powershell
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "$pwd\api"
python -m file_lite_vc
```

---

## 2. After Git Pull: How to Run Frontend & Backend (Dev Mode)

### 2.1 Prerequisites
- Node.js: 18+ recommended
- Python: 3.10+ recommended

### 2.2 Install Dependencies
Frontend:
```powershell
npm install
```

Backend runtime venv (`.venv`):
```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r api\requirements.txt
```

### 2.3 Start Services
Backend:
```powershell
$env:PYTHONPATH="$pwd\api"
.\.venv\Scripts\python -m file_lite_vc
```

Frontend:
```powershell
npm run dev
```

Note: the frontend proxies `/api` to `http://127.0.0.1:8848` in `vite.config.ts`.

---

## 3. Packaging (How to Build Release Artifacts)

### 3.1 Build venv (`.venv-build`)
Windows PowerShell:
```powershell
python -m venv .venv-build
.\.venv-build\Scripts\python -m pip install --upgrade pip
.\.venv-build\Scripts\python -m pip install -r api\requirements.txt
.\.venv-build\Scripts\python -m pip install pyinstaller
```

### 3.2 Artifact Types
Packaging script included in this repo:
- No-Python package (recommended): `powershell -ExecutionPolicy Bypass -File package_release_no_python.ps1` → `release/File-Lite-VC-no-python_<version>/`

---

## 4. How to Use the Web UI

Navigation: **Projects / Commits / Connections / Settings**.

### 4.1 Connections: FTP Profile List / Local Directory Mode
FTP mode is managed via reusable “FTP Profiles”:
1. Go to `Connections`
2. Click `New` to create a profile (Host/Port/User/Password/remoteRoot/Encoding)
3. Select the profile and click `Test Connection`
4. Click `Save to Current Project` to bind the connection to the current project

Local Directory mode:
1. Switch to `Local Directory`
2. Click `Choose Folder` to select an absolute local target directory
3. Click `Save`

### 4.2 Projects: Create / Edit Projects
When creating a project, choose a connection type:
- Local Directory: choose an absolute local target directory during creation
- FTP: select an existing FTP Profile; project `remotePath` is optional

Fields:
- Local workspace path: the folder to scan scripts/files
- File types: built-in `.sql/.java/.vue/.js`, plus custom extensions

### 4.3 Commits: Pull/Push, Script List, Commit Versions
Sync:
1. Select a current project
2. Click `Pull` or `Push` to preview changes, then apply
3. If conflicts exist, resolve them line-by-line (choose Local/Remote per line), then apply

Commit versions:
- Commit a single script, or multi-select and commit as one version message

### 4.4 Versions & Compare (Diff)
- Compare any two versions
- Compare “Workspace vs Version”

### 4.5 Rollback (Local Only)
- Rollback updates the local workspace file only
- Remote (FTP / local target directory) is not rolled back

---

## 5. Troubleshooting

### 5.1 Test works, but pull/push fails
Check:
- whether `remoteRoot` is correct and permitted
- whether project `remotePath` is correct (relative to `remoteRoot`, or absolute starting with `/`)
- Chinese directory issues: try `GBK` in `Connections` → “FTP Filename Encoding”

### 5.2 Do not use URL-encoded FTP paths
FTP paths are not URLs. Do not enter `%E4%B8%AD...` strings.

### 5.3 Logs
Runtime log in the working directory:
- `sqlftpvc-runtime.log`

Crash log (if any):
- `%USERPROFILE%\.sqlftpvc\crash.log`

### 5.4 `exe` exits immediately
Capture stdout/stderr:
```bat
File-Lite-VC.exe > out.txt 2>&1
type out.txt
```

---

## 6. Self Check
- Frontend: `npm run check`, `npm run lint`
- Backend (Windows PowerShell):
```powershell
$env:PYTHONPATH="$pwd\api"
.\.venv\Scripts\python -m unittest discover -s api\tests -p "test_*.py" -q
```

---

## 7. Sponsor / Crowdfunding
If this project helps you, consider sponsoring to support maintenance and future improvements.
- https://ko-fi.com/dynamesxy
