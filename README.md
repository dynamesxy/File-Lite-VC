# 可视化内网 SQL 脚本版本控制工具（sqlftpvc）

## 一键运行（推荐给内网使用）
- Windows：双击或执行 `run.bat`（或 `powershell -ExecutionPolicy Bypass -File run.ps1`）
- Linux/macOS：执行 `bash run.sh`

启动后访问 `http://127.0.0.1:8848/`。

说明：
- 如果目录内存在 `sqlftpvc.exe`（Windows）或 `sqlftpvc`（Linux/macOS），`run.*` 会优先直接运行可执行文件（目标机无需 Python）。
- 首次启动会创建 `.venv` 并安装 `api/requirements.txt` 里的依赖。
- 如果内网无法联网安装依赖：把对应 wheel 文件放到 `api/wheels/`，脚本会自动使用 `--no-index --find-links` 离线安装。

## 使用流程
1. 进入“连接与设置”，配置 FTP 并保存到当前项目。
2. 在“项目工作台”新建项目，配置本地工作区目录与远端目录。
3. 点击“拉取”预览差异，确认后执行拉取。
4. 本地修改 SQL 后，点击“提交版本”填写提交说明。
5. 进入“版本与对比”选择两版本或“工作区 vs 版本”查看差异。
6. 点击“上传”预览差异，确认后执行上传。

## 开发模式
1. 前端：`npm run dev`
2. 后端：
   - 创建虚拟环境并安装依赖：`python -m venv .venv && .\.venv\Scripts\python -m pip install -r api\requirements.txt`
   - 启动：`set PYTHONPATH=%cd%\api && .\.venv\Scripts\python -m sqlftpvc`

前端已在 `vite.config.ts` 配置了 `/api` 代理到 `http://127.0.0.1:8848`。

## 打包产物
- Windows：执行 `powershell -ExecutionPolicy Bypass -File package_release.ps1` 生成 `release/sqlftpvc.zip`
- Linux/macOS：执行 `bash package_release.sh` 生成 `release/sqlftpvc.tgz`

### 无 Python 环境包（目标机无需安装 Python）
- Windows：执行 `powershell -ExecutionPolicy Bypass -File package_release_no_python.ps1` 生成 `release/sqlftpvc-no-python.zip`
- Linux/macOS：执行 `bash package_release_no_python.sh` 生成 `release/sqlftpvc-no-python.tgz`

注意：无 Python 环境包需要在“有 Python/Node 的构建机”上生成，并在目标系统同架构同系统运行（例如 Windows 包需在 Windows 上构建）。

### 便携 Python 环境包（目标机无需安装 Python/Node）
如果你只有一台“构建机”有 Python+Node，内网目标机两者都没有，可以用便携包：
- Windows：执行 `powershell -ExecutionPolicy Bypass -File package_release_portable_windows.ps1` 生成 `release/sqlftpvc-portable.zip`

便携包特点：
- 压缩包内自带 `.venv`（包含 Python 解释器与依赖），目标机解压后直接运行 `run.bat`
- 不会在目标机安装依赖，也不需要联网

## 自测
- 前端：`npm run check`、`npm run lint`
- 后端：
  - Windows PowerShell：`$env:PYTHONPATH="$pwd\api"; .\\.venv\\Scripts\\python -m unittest discover -s api\\tests -p "test_*.py" -q`
