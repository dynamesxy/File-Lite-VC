# sqlftpvc 操作手册（内网版）

本工具用于在内网环境下管理 SQL 脚本版本（本地保存版本快照 + 可视化 diff），并通过 FTP 做脚本同步（拉取/上传）。

## 1. 快速启动

### 1.1 无 Python 环境包（推荐）
使用 `sqlftpvc-no-python.zip`：
1. 将压缩包拷贝到目标内网机
2. 解压到任意目录（建议不要放在系统盘受控目录，例如 `C:\Program Files`）
3. 直接运行 `sqlftpvc.exe`
4. 浏览器访问：`http://127.0.0.1:8848/`

如果端口被占用，可以在同目录用命令行设置端口后再运行：
```bat
set SQLFTPVC_PORT=8850
sqlftpvc.exe
```

### 1.2 使用本地 .venv（目标机有 Python）
在项目目录（能看到 `api\`、`dist\`）执行：

CMD：
```bat
call .venv\Scripts\activate.bat
set PYTHONPATH=%cd%\api
python -m sqlftpvc
```

PowerShell：
```powershell
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "$pwd\api"
python -m sqlftpvc
```

启动后访问：`http://127.0.0.1:8848/`

## 2. 基础概念

### 2.1 项目（Project）
一个“项目”就是一组配置：
- 本地工作区路径：你本机存放 `.sql` 文件的目录
- FTP 项目目录：远端目录（相对 remoteRoot 的子路径）

项目创建后，工具会根据“本地工作区路径”扫描 `.sql` 文件，并维护：
- 脚本列表
- 版本历史（每次提交会保存快照到本机）
- Diff 对比

### 2.2 FTP 配置（remoteRoot + 项目目录）
FTP 配置分两层：
- **remoteRoot（全局/项目级 FTP 设置里的根目录）**：例如 `/` 或 `/交付/数据库`
- **项目目录（Project.remotePath）**：例如 `项目A/脚本` 或 `/项目A/脚本`

最终远端路径 = `remoteRoot` + `remotePath`（自动拼接）

## 3. 首次使用流程（推荐顺序）

### 3.1 先配置 FTP 连接
进入【连接与设置】：
1. Host / Port / 用户名 / 密码
2. 被动模式：多数内网建议开启（默认开启）
3. remoteRoot：填写你希望工具“进入的根目录”
4. FTP 文件名编码：默认“自动”；如果中文目录有 550/乱码，选 “GBK”
4. 点击【测试连接】
5. 点击【浏览目录并关联项目】（推荐）：选择一个目录后会自动把 FTP 配置保存到当前项目，并将该目录关联为项目目录
6. 或者点击【保存到当前项目】仅保存 FTP 配置

如果【测试连接】成功，但后续【拉取/上传】失败，优先检查第 4 节“远端目录填写规则/中文目录”。

### 3.2 新建项目
进入【项目工作台】的【项目列表】：
1. 点击【新建】
2. 填写：
   - 项目名
   - 本地工作区路径（必须存在）
   - FTP 项目目录（相对 remoteRoot）
3. 点击【创建】
4. 页面顶部会提示“项目已创建”，并自动切换到新项目

### 3.3 拉取（从 FTP 到本地）
1. 确认已选择当前项目（项目列表中会标记“当前”）
2. 点击【拉取】（先预览差异）
3. 预览无误后点击【执行】

说明：
- 默认“安全策略”：本地存在未提交改动时，不建议覆盖；可在弹窗中开启覆盖（overwrite）

### 3.4 提交版本（本地保存版本快照）
1. 在脚本清单点击某个脚本的【提交版本】
2. 填写提交说明
3. 提交后会生成新版本号（例如 `v20260622-001`）

### 3.5 版本与对比（Diff）
1. 进入【版本与对比】
2. 选择两个版本，或选择“工作区 vs 版本”
3. 查看差异统计与逐行对比

### 3.6 上传（从本地到 FTP）
1. 点击【上传】（先预览差异）
2. 预览无误后点击【执行】

## 4. 远端目录填写规则（重点：中文目录 / URL 转码）

### 4.1 不要填 URL 编码（%E4%B8%AD%E6%96%87 这种）
FTP 路径不是 URL，不需要 `encodeURIComponent` 后的 `%E4%B8%AD...`。

正确示例（直接填中文）：
- remoteRoot：`/交付/数据库`
- 项目目录：`项目A/脚本`

错误示例（不要这样填）：
- remoteRoot：`/%E4%BA%A4%E4%BB%98/%E6%95%B0%E6%8D%AE%E5%BA%93`

如果你手里只有 URL 编码字符串，可以用 PowerShell 转回中文后再填写：
```powershell
[System.Uri]::UnescapeDataString("%E4%BA%A4%E4%BB%98/%E6%95%B0%E6%8D%AE%E5%BA%93")
```

另外：当前版本后端已对 `remoteRoot/remotePath` 做了自动 `URL decode`（即使你误填了 `%E4...`，也会尽量自动还原）。

### 4.2 中文目录无法访问/列目录失败怎么办？
FTP 的“文件名编码”取决于 FTP 服务器设置：
- 多数现代服务器支持 UTF-8
- 少数老服务器可能使用 GBK

如果你遇到“FTP 测试能通过，但进入某个中文目录/列文件失败”，尝试强制指定 FTP 编码：

在启动前设置环境变量：

CMD：
```bat
set SQLFTPVC_FTP_ENCODING=gbk
sqlftpvc.exe
```

PowerShell：
```powershell
$env:SQLFTPVC_FTP_ENCODING="gbk"
.\sqlftpvc.exe
```

可选值常用：`utf-8`（默认）、`gbk`

## 5. 项目管理

### 5.1 项目列表
【项目工作台】首页上方有“项目列表”：
- 勾选支持多选
- 支持【批量删除】
- 支持单个【编辑/删除】
- 点击项目名可切换“当前项目”

### 5.2 编辑项目
点击某行【编辑】：
- 保存后会提示“项目已保存”
- 会自动刷新当前项目脚本列表

### 5.3 删除项目
删除只会删除本工具的元数据与快照，不会删除你的本地工作区文件：
- 数据库元数据：项目/脚本/版本/日志/FTP 设置
- 快照目录：`%USERPROFILE%\.sqlftpvc\snapshots\{projectId}\...`

## 6. 常见问题排查

### 6.1 “测试连接成功，但拉取/上传失败”
重点检查：
- remoteRoot 是否正确（是否真的有权限进入）
- 项目目录 remotePath 是否正确（是否相对 remoteRoot）
- 中文目录编码问题（见 4.2，尝试 `SQLFTPVC_FTP_ENCODING=gbk`）

### 6.2 端口占用
```bat
set SQLFTPVC_PORT=8850
sqlftpvc.exe
```

### 6.3 exe 一闪而过
用重定向抓日志：
```bat
sqlftpvc.exe > out.txt 2>&1
type out.txt
```

工具也会尝试写崩溃日志到：
`%USERPROFILE%\.sqlftpvc\crash.log`

### 6.4 运行日志文件（新增）
从当前版本开始，工具会在运行目录实时写入日志文件：
- `sqlftpvc-runtime.log`

如果你运行的是无 Python 包里的 `sqlftpvc.exe`，这个日志文件就在：
- `sqlftpvc.exe` 同目录

日志里会记录：
- 服务启动
- 项目新增/编辑/删除
- FTP 连接开始/成功
- FTP 切换目录、列目录
- FTP 上传/下载
- 详细错误信息

### 6.5 排查 FTP 550（测试连接成功，但项目目录失败）
典型现象：
- FTP 根目录/最外层节点测试通过
- 配置到下一级或更深中文目录后报 `550`

建议按下面顺序排查：

1. 查看 `sqlftpvc-runtime.log`
   重点关注这些字段：
   - `remoteRoot=...`
   - `projectRemote=...`
   - `resolvedRemoteDir=...`
   - `ftp.list_sql.start base=...`
   - `ftp.list_sql.mlsd.error ...`

2. 检查目录是否填成了 URL 编码
   - 错误：`/%E4%B8%AD%E6%96%87/...`
   - 正确：`/中文/...`

3. 尝试切换 FTP 编码为 `gbk`
   ```bat
   set SQLFTPVC_FTP_ENCODING=gbk
   sqlftpvc.exe
   ```

4. 确认 `remoteRoot` 与 `项目目录` 不要重复
   例如：
   - remoteRoot：`/交付`
   - 项目目录：`数据库/项目A`
   - 最终路径：`/交付/数据库/项目A`

   不要写成：
   - remoteRoot：`/交付/数据库`
   - 项目目录：`/交付/数据库/项目A`

5. 让 FTP 管理员确认该账号是否对该中文目录有 `CWD/LIST/RETR/STOR` 权限
