# `sqlftpvc` Operation Guide (Intranet Edition)

This tool manages SQL script versions in an intranet environment. It stores version snapshots locally, provides visual diff views, and synchronizes SQL files through FTP pull and push operations.

## 1. Quick Start

### 1.1 No-Python Package (Recommended)
Use `sqlftpvc-no-python.zip`:
1. Copy the package to the target intranet machine.
2. Extract it to any directory. Avoid protected system directories such as `C:\Program Files`.
3. Run `sqlftpvc.exe` directly.
4. Open `http://127.0.0.1:8848/` in the browser.

If the default port is occupied, set a custom port before launching:

```bat
set SQLFTPVC_PORT=8850
sqlftpvc.exe
```

### 1.2 Use Local `.venv` (Target Machine Has Python)
In the project root directory that contains `api\` and `dist\`, run:

CMD:

```bat
call .venv\Scripts\activate.bat
set PYTHONPATH=%cd%\api
python -m sqlftpvc
```

PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "$pwd\api"
python -m sqlftpvc
```

Then open `http://127.0.0.1:8848/`.

## 2. Core Concepts

### 2.1 Project
A project is a set of configuration values:
- Local workspace path: the local folder that stores `.sql` files
- FTP project directory: the target remote directory

After a project is created, the tool scans `.sql` files from the local workspace and maintains:
- Script list
- Version history
- Diff comparison

### 2.2 FTP Configuration (`remoteRoot` + project directory)
FTP configuration has two layers:
- `remoteRoot`: the root directory configured in FTP settings, for example `/` or `/delivery/database`
- Project directory (`Project.remotePath`): for example `projectA/scripts` or `/projectA/scripts`

The final remote path is built by joining `remoteRoot` and `remotePath`.

## 3. Recommended First-Time Workflow

### 3.1 Configure FTP First
Go to `Settings`:
1. Fill in Host, Port, Username, and Password.
2. Passive mode is usually recommended in intranet environments.
3. Set `remoteRoot` to the root directory you want the tool to enter.
4. Set FTP filename encoding to `Auto` by default. If Chinese directory names show `550` or garbled text, try `GBK`.
5. Click `Test Connection`.
6. Click `Browse Directories and Bind Project` to select a folder and bind it directly to the current project.
7. Or click `Save to Current Project` if you only want to save the FTP settings.

If connection testing succeeds but pull or upload still fails, review the remote directory rules in section 4.

### 3.2 Create a Project
Go to `Dashboard` > `Projects`:
1. Click `Create`.
2. Fill in:
   - Project name
   - Local workspace path
   - FTP remote directory
3. Click `Create`.
4. The page shows a success message and switches to the new project automatically.

### 3.3 Pull From FTP to Local
1. Make sure a current project is selected.
2. Click `Pull` to preview differences.
3. Confirm and run the pull.

### 3.4 Commit a Version
1. In the script list, click `Commit Version` on a script with changes.
2. Enter a commit message.
3. A new version number is generated, for example `v20260622-xy-001`.

### 3.5 View Versions and Diff
1. Open `Versions & Compare`.
2. Choose two versions, or choose `Workspace vs Version`.
3. Review the difference summary and line-by-line comparison.

### 3.6 Upload From Local to FTP
1. Click `Upload` to preview differences.
2. Confirm and run the upload.

## 4. Remote Directory Rules

### 4.1 Do Not Use URL-Encoded Paths
FTP paths are not URLs. Do not enter values such as `%E4%B8%AD%E6%96%87`.

Correct examples:
- `remoteRoot`: `/delivery/database`
- Project directory: `projectA/scripts`

If you only have a URL-encoded string, decode it first:

```powershell
[System.Uri]::UnescapeDataString("%E4%BA%A4%E4%BB%98/%E6%95%B0%E6%8D%AE%E5%BA%93")
```

### 4.2 Chinese Directory Issues
FTP filename encoding depends on the FTP server:
- Most modern servers support UTF-8
- Some legacy intranet servers still use GBK

If connection testing works but entering or listing Chinese directories fails, force GBK before startup:

CMD:

```bat
set SQLFTPVC_FTP_ENCODING=gbk
sqlftpvc.exe
```

PowerShell:

```powershell
$env:SQLFTPVC_FTP_ENCODING="gbk"
.\sqlftpvc.exe
```

## 5. Project Management

### 5.1 Project List
The top area of `Dashboard` shows the project list:
- Multi-select is supported
- Batch delete is supported
- Each project supports edit and delete
- Click a project name to switch the current project

### 5.2 Edit Project
Click `Edit` on a project row:
- Saving shows a success message
- The current script list refreshes automatically

### 5.3 Delete Project
Deleting a project removes only local metadata and snapshots managed by this tool. It does not delete your real local SQL files.

## 6. Troubleshooting

### 6.1 Connection Test Works But Pull or Upload Fails
Check:
- Whether `remoteRoot` is correct
- Whether the project `remotePath` is correct
- Whether the FTP encoding should be switched to `GBK`

### 6.2 Port Occupied

```bat
set SQLFTPVC_PORT=8850
sqlftpvc.exe
```

### 6.3 `exe` Closes Immediately
Capture logs:

```bat
sqlftpvc.exe > out.txt 2>&1
type out.txt
```

The tool also tries to write a crash log to:
`%USERPROFILE%\.sqlftpvc\crash.log`

### 6.4 Runtime Log File
The tool writes a real-time runtime log:
- `sqlftpvc-runtime.log`

If you run the no-Python package, the log file is in the same directory as `sqlftpvc.exe`.

The log records:
- Service startup
- Project create, edit, and delete
- FTP connection start and success
- FTP directory switching and listing
- FTP upload and download
- Detailed error messages

### 6.5 Troubleshooting FTP 550
Typical symptoms:
- FTP root works
- A deeper project directory fails with `550`

Recommended checks:
1. Review `sqlftpvc-runtime.log`
2. Confirm the path is not URL-encoded
3. Try `SQLFTPVC_FTP_ENCODING=gbk`
4. Make sure `remoteRoot` and project directory are not duplicated
5. Ask the FTP administrator to verify `CWD`, `LIST`, `RETR`, and `STOR` permissions for the account
