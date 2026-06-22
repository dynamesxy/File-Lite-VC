# File-Lite-VC（轻量级的文件管理工具）

[中文](README.md) | [English](README_en.md)

本工具用于在内网环境下管理脚本/文件版本：
- 本地保存版本快照 + 可视化 Diff
- 支持同步：FTP（拉取/上传）或本地目录（拉取/上传到指定目标文件夹）
- 支持冲突逐行解决（类似 Git：每个冲突行可选“使用本地/使用远端”）
- 版本回退仅影响本地工作区（不会回退/覆盖远端）

网页入口：`http://127.0.0.1:8848/`
说明：
- 推荐使用新命令启动：`python -m file_lite_vc`（已做兼容）
- 旧命令 `python -m sqlftpvc` 仍可用（兼容历史脚本）

---

## 1. 一键运行（推荐给内网使用）

### 1.1 已打包产物（目标机无需 Python）
使用构建输出目录 `release/File-Lite-VC-no-python_<版本号>/`（版本号来自 `package.json` 的 `version` 字段）：
1. 将压缩包拷贝到目标内网机
2. 直接拷贝该目录到目标内网机任意位置（建议不要放在 `C:\Program Files`）
3. Windows 运行 `run.bat` 或直接双击 `File-Lite-VC.exe`
4. 浏览器打开 `http://127.0.0.1:8848/`

端口被占用时可设置端口再启动：
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

## 2. 从项目拉取后如何本地开发运行（前后端）

### 2.1 前置要求
- Node.js：建议 18+（Vite 需要较新版本）
- Python：建议 3.10+

### 2.2 安装依赖
前端：
```powershell
npm install
```

后端（运行环境 `.venv`，用于本地启动/便携包）：
```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r api\requirements.txt
```

### 2.3 启动（开发模式）
1) 启动后端（FastAPI）：
```powershell
$env:PYTHONPATH="$pwd\api"
.\.venv\Scripts\python -m file_lite_vc
```

2) 启动前端（Vite）：
```powershell
npm run dev
```

说明：前端已在 `vite.config.ts` 配置 `/api` 代理到 `http://127.0.0.1:8848`。

---

## 3. 打包（执行结束如何生成发布包）

### 3.1 打包前置
- 构建机需要同时具备：Node + Python
- 打包环境（`.venv-build`，用于 PyInstaller）

Windows PowerShell：
```powershell
python -m venv .venv-build
.\.venv-build\Scripts\python -m pip install --upgrade pip
.\.venv-build\Scripts\python -m pip install -r api\requirements.txt
.\.venv-build\Scripts\python -m pip install pyinstaller
```

### 3.2 产物类型
当前仓库内置打包脚本：
- 无 Python 环境包（推荐分发到内网目标机）：`powershell -ExecutionPolicy Bypass -File package_release_no_python.ps1` → `release/File-Lite-VC-no-python_<版本号>/`

---

## 4. 运行后如何操作（按页面）

页面导航分为：**项目 / 提交 / 连接 / 设置**。

### 4.1 连接（Connections）：管理 FTP 连接列表 / 本地目录模式
FTP 模式建议先创建一个可复用的“FTP 连接（Profile）”：
1. 进入【连接】
2. 在“FTP 连接”处点击【新建】，填写 Host/Port/用户名/密码/remoteRoot/编码，保存
3. 下拉选择该连接，可点击【测试连接】验证
4. 点击【保存到当前项目】把“连接模式 + Profile 引用”保存到当前项目

本地目录模式：
1. 进入【连接】切换为【本地目录】
2. 点击【文件夹选择】选择“本地目标目录”（绝对路径）
3. 点击【保存】或【保存到当前项目】

### 4.2 项目（Projects）：创建/编辑项目
创建项目时需选择连接类型：
- **本地目录**：创建时直接选择“本地目标目录”（绝对路径）
- **FTP**：选择一个已保存的“FTP 连接（Profile）”，项目远端目录（remotePath）可选填

字段说明：
- 项目名：用于展示
- 本地工作区路径：你的脚本/文件所在目录（工具会扫描并维护脚本清单）
- 文件类型：内置 `.sql/.java/.vue/.js`，并支持自定义扩展名

### 4.3 提交（Commits）：同步（拉取/上传）、脚本清单、提交版本
同步（Pull/Push）：
1. 确保已选择当前项目
2. 点击【拉取】或【上传】会先进入预览
3. 如出现冲突，弹窗会显示冲突行，可逐行选择“使用本地/使用远端”
4. 确认后点击【执行】

提交版本：
- 在脚本清单中对单个脚本提交版本，或多选后批量提交（统一提交说明）

### 4.4 版本与对比（Diff）
- 支持对比任意两版本
- 支持“工作区 vs 某版本”

### 4.5 回退（Rollback）
- 回退只会回退**本地工作区**文件
- 不会影响 FTP/本地目标目录（远端不被回退）

---

## 5. 常见问题与排查

### 5.1 “测试连接成功，但拉取/上传失败”
重点检查：
- `remoteRoot` 是否正确且有权限进入
- 项目远端目录（remotePath）是否正确（相对 remoteRoot，或以 `/` 开头的绝对路径）
- 中文目录编码问题：在连接中把“FTP 文件名编码”切到 `GBK`

### 5.2 不要填写 URL 编码的路径（%E4%B8%AD...）
FTP 路径不是 URL，应直接填写中文目录名。

### 5.3 运行日志文件
工具会在运行目录实时写入：
- `sqlftpvc-runtime.log`

崩溃日志（如有）：
- `%USERPROFILE%\.sqlftpvc\crash.log`

### 5.4 exe 一闪而过
用重定向抓输出：
```bat
File-Lite-VC.exe > out.txt 2>&1
type out.txt
```

---

## 6. 自测
- 前端：`npm run check`、`npm run lint`
- 后端（Windows PowerShell）：
```powershell
$env:PYTHONPATH="$pwd\api"
.\.venv\Scripts\python -m unittest discover -s api\tests -p "test_*.py" -q
```

---

## 7. 赞助 / 众筹
如果这个工具对你有帮助，欢迎赞助支持后续迭代与维护。

### 7.1 支付宝
![支付宝赞助](docs/sponsor/alipay.png)
