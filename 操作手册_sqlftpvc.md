# File-Lite-VC 操作手册（内网版）

File-Lite-VC 是一款轻量级的文件管理工具，用于在内网环境下对脚本/文件做版本管理与同步：
- 本地保存版本快照 + 可视化 Diff
- 支持同步：FTP（拉取/上传）或本地目录（拉取/上传到指定目标文件夹）
- 支持冲突逐行解决（每个冲突行可选“使用本地/使用远端”）
- 版本回退仅影响本地工作区（不会回退/覆盖远端）

网页入口：`http://127.0.0.1:8848/`

说明：
- 推荐使用新命令启动：`python -m file_lite_vc`
- 旧命令 `python -m sqlftpvc` 仍可用（兼容历史脚本）

---

## 1. 快速启动（目标机使用）

### 1.1 无 Python 环境包（推荐）
使用 `release/File-Lite-VC-no-python.zip`：
1. 将压缩包拷贝到目标内网机
2. 解压到任意目录（建议不要放在系统盘受控目录，例如 `C:\Program Files`）
3. Windows 运行 `run.bat` 或直接双击 `File-Lite-VC.exe`
4. 浏览器访问：`http://127.0.0.1:8848/`

端口被占用时（同目录执行）：
```bat
set FILE_LITE_VC_PORT=8850
File-Lite-VC.exe
```

### 1.2 源码/未打包（目标机有 Python）
在项目根目录（能看到 `api\`、`dist\`）执行：

CMD：
```bat
call .venv\Scripts\activate.bat
set PYTHONPATH=%cd%\api
python -m file_lite_vc
```

PowerShell：
```powershell
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "$pwd\api"
python -m file_lite_vc
```

---

## 2. 从仓库拉取后如何执行（开发/构建机）

### 2.1 前置要求
- Node.js：建议 18+
- Python：建议 3.10+

### 2.2 安装依赖
前端：
```powershell
npm install
```

后端（运行环境 `.venv`）：
```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r api\requirements.txt
```

### 2.3 启动（前后端）
后端：
```powershell
$env:PYTHONPATH="$pwd\api"
.\.venv\Scripts\python -m file_lite_vc
```

前端：
```powershell
npm run dev
```

---

## 3. 打包发布（构建机生成可分发产物）

仓库内置脚本：
- `package_release_no_python.ps1`：生成 `release/File-Lite-VC-no-python.zip`

在仓库根目录执行：
```powershell
powershell -ExecutionPolicy Bypass -File package_release_no_python.ps1
```

---

## 4. 运行后如何操作（按页面）

页面导航：**项目 / 提交 / 连接 / 设置**。

### 4.1 连接（Connections）

FTP 连接列表（Profile）：
1. 进入【连接】
2. 在“FTP 连接”处点击【新建】，填写 Host/Port/用户名/密码/remoteRoot/编码，保存
3. 下拉选择该连接后点击【测试连接】
4. 点击【保存到当前项目】把连接保存到当前项目

本地目录模式：
1. 在【连接】切换为【本地目录】
2. 点击【文件夹选择】选择本地目标目录（必须是绝对路径）
3. 点击【保存】或【保存到当前项目】

### 4.2 项目（Projects）
创建项目时需选择连接类型：
- 本地目录：创建时选择“本地目标目录”（绝对路径）
- FTP：选择一个已保存的 FTP 连接（Profile），项目远端目录（remotePath）可选填

工作区与文件类型：
- 本地工作区路径：你本机存放脚本/文件的目录
- 文件类型：内置 `.sql/.java/.vue/.js`，支持自定义扩展名

### 4.3 提交（Commits）
同步（拉取/上传）：
1. 确认已选择当前项目
2. 点击【拉取】或【上传】先预览差异
3. 如出现冲突，弹窗会显示冲突行，可逐行选择“使用本地/使用远端”
4. 确认后点击【执行】

提交版本：
- 支持单个提交或多选批量提交（统一提交说明）

### 4.4 版本与对比（Diff）
- 支持任意两版本对比
- 支持“工作区 vs 某版本”

### 4.5 回退（Rollback）
- 回退只影响本地工作区
- 不会影响 FTP/本地目标目录（远端不被回退）

---

## 5. 常见问题排查

### 5.1 “测试连接成功，但拉取/上传失败”
重点检查：
- `remoteRoot` 是否正确（是否有权限进入）
- 项目远端目录（remotePath）是否正确（相对 remoteRoot 或以 `/` 开头的绝对路径）
- 中文目录编码问题：在连接中把“FTP 文件名编码”切到 `GBK`

### 5.2 运行日志
运行目录实时写入：
- `sqlftpvc-runtime.log`

崩溃日志（如有）：
- `%USERPROFILE%\.sqlftpvc\crash.log`

### 5.3 exe 一闪而过
用重定向抓输出：
```bat
File-Lite-VC.exe > out.txt 2>&1
type out.txt
```
