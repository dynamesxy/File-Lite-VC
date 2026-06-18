# File-Lite-VC Operation Guide (Intranet)

File-Lite-VC is a lightweight file management tool for intranet environments:
- Local version snapshots + visual Diff
- Sync modes: FTP (pull/push) or Local Directory (pull/push to a target folder)
- Line-by-line conflict resolver (choose Local/Remote per conflict line)
- Rollback is **local-workspace only** (remote is never rolled back)

Web UI: `http://127.0.0.1:8848/`

Note:
- Recommended new startup command: `python -m file_lite_vc`
- The legacy command `python -m sqlftpvc` is still supported for compatibility

---

## 1. Quick Start (Target Machine)

### 1.1 No-Python Package (Recommended)
Use `release/File-Lite-VC-no-python.zip`:
1. Copy it to the target intranet machine
2. Extract to any directory (avoid protected directories like `C:\Program Files`)
3. Windows: run `run.bat` or double-click `File-Lite-VC.exe`
4. Open `http://127.0.0.1:8848/`

If the port is occupied:
```bat
set FILE_LITE_VC_PORT=8850
File-Lite-VC.exe
```

### 1.2 Source / Unpackaged (Target Has Python)
In the repo root (contains `api\` and `dist\`):

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

## 2. After Git Pull: How to Run (Dev/Build Machine)

### 2.1 Requirements
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

### 2.3 Start (Frontend & Backend)
Backend:
```powershell
$env:PYTHONPATH="$pwd\api"
.\.venv\Scripts\python -m file_lite_vc
```

Frontend:
```powershell
npm run dev
```

---

## 3. Packaging

Script included in this repo:
- `package_release_no_python.ps1` → `release/File-Lite-VC-no-python.zip`

Run at repo root:
```powershell
powershell -ExecutionPolicy Bypass -File package_release_no_python.ps1
```

---

## 4. How to Use the Web UI

Navigation: **Projects / Commits / Connections / Settings**.

### 4.1 Connections
FTP Profiles:
1. Go to `Connections`
2. Click `New` and fill Host/Port/User/Password/remoteRoot/Encoding
3. Select a profile and click `Test Connection`
4. Click `Save to Current Project` to bind it to the current project

Local Directory mode:
1. Switch to `Local Directory`
2. Click `Choose Folder` to select an absolute local target directory
3. Click `Save`

### 4.2 Projects
When creating a project, choose a connection type:
- Local Directory: choose an absolute local target directory during creation
- FTP: select an FTP Profile; project `remotePath` is optional

Workspace and file types:
- Local workspace path: the folder to scan scripts/files
- Built-in file types `.sql/.java/.vue/.js`, plus custom extensions

### 4.3 Commits
Sync (Pull/Push):
1. Select a current project
2. Click `Pull` or `Push` to preview changes, then apply
3. If conflicts exist, resolve them line-by-line (choose Local/Remote per line), then apply

Commit versions:
- Commit a single script, or multi-select and commit with one message

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
- whether project `remotePath` is correct (relative to `remoteRoot` or absolute starting with `/`)
- Chinese directory issues: try `GBK` in “FTP Filename Encoding”

### 5.2 Logs
Runtime log in the working directory:
- `sqlftpvc-runtime.log`

Crash log (if any):
- `%USERPROFILE%\.sqlftpvc\crash.log`

### 5.3 `exe` exits immediately
Capture stdout/stderr:
```bat
File-Lite-VC.exe > out.txt 2>&1
type out.txt
```
