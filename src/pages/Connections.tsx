import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FtpDirPickerModal } from "@/components/settings/FtpDirPickerModal";
import { FtpProfileModal } from "@/components/settings/FtpProfileModal";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/store/appStore";
import { api, type FtpConfig, type FtpProfileFull } from "@/utils/api";

export default function ConnectionsPage() {
  const { tx, isEn } = useI18n();
  const { projects, activeProjectId, refreshProjects } = useAppStore();
  const activeProject = useMemo(() => projects.find((p) => p.id === activeProjectId) ?? null, [projects, activeProjectId]);

  const [cfg, setCfg] = useState<FtpConfig>({
    connectionMode: "ftp",
    ftpProfileId: null,
    host: "",
    port: 21,
    username: "",
    password: "",
    passiveMode: true,
    remoteRoot: "/",
    ftpEncoding: "auto",
  });
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [profilesBusy, setProfilesBusy] = useState(false);
  const [profilesMsg, setProfilesMsg] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalTitle, setProfileModalTitle] = useState("");
  const [profileModalInitial, setProfileModalInitial] = useState<Partial<FtpProfileFull> | null>(null);
  const profileModalModeRef = useRef<"create" | "edit">("create");
  const editingProfileIdRef = useRef<string | null>(null);
  const [localTargetPath, setLocalTargetPath] = useState("");
  const [localPickSource, setLocalPickSource] = useState<"system" | "browser" | null>(null);
  const browserDirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const browserDirInputRef = useRef<HTMLInputElement | null>(null);
  const [browserPickedFolderName, setBrowserPickedFolderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const bindLockRef = useRef(false);

  useEffect(() => {
    setLocalTargetPath(activeProject?.remotePath ?? "");
    setLocalPickSource(null);
    browserDirHandleRef.current = null;
    setBrowserPickedFolderName("");
  }, [activeProject?.remotePath, activeProjectId]);

  useEffect(() => {
    const el = browserDirInputRef.current;
    if (!el) return;
    el.setAttribute("webkitdirectory", "");
    el.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadProfiles() {
      setProfilesBusy(true);
      setProfilesMsg(null);
      try {
        const rows = await api.listFtpProfiles();
        if (cancelled) return;
        setProfiles(rows.map((x) => ({ id: x.id, name: x.name })));
      } catch (e) {
        if (cancelled) return;
        setProfilesMsg(e instanceof Error ? e.message : tx("加载 FTP 连接列表失败", "Failed to load FTP profile list"));
      } finally {
        if (!cancelled) setProfilesBusy(false);
      }
    }
    void loadProfiles();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    async function loadCfg() {
      setTestOk(false);
      if (!activeProjectId) return;
      try {
        const r = await api.getFtp(activeProjectId);
        setCfg(r);
        setMsg(null);
      } catch (e) {
        setCfg({ connectionMode: "ftp", ftpProfileId: null, host: "", port: 21, username: "", password: "", passiveMode: true, remoteRoot: "/", ftpEncoding: "auto" });
        const m = e instanceof Error ? e.message : tx("加载配置失败", "Failed to load settings");
        if (m.includes("ftp setting not configured")) setMsg(tx("该项目尚未保存连接配置", "Connection settings have not been saved for this project"));
      }
    }
    void loadCfg();
  }, [activeProjectId]);

  async function applyProfileToCfg(profileId: string) {
    setBusy(true);
    setMsg(null);
    setTestOk(false);
    try {
      const full = await api.getFtpProfile(profileId);
      setCfg({
        connectionMode: "ftp",
        ftpProfileId: profileId,
        host: full.host,
        port: full.port,
        username: full.username,
        password: full.password,
        passiveMode: full.passiveMode,
        remoteRoot: full.remoteRoot,
        ftpEncoding: full.ftpEncoding,
      });
      setMsg(isEn ? `Loaded profile: ${full.name}` : `已加载连接：${full.name}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : tx("加载 FTP 连接失败", "Failed to load FTP profile"));
    } finally {
      setBusy(false);
    }
  }

  function openCreateProfile() {
    profileModalModeRef.current = "create";
    editingProfileIdRef.current = null;
    setProfileModalTitle(tx("新建 FTP 连接", "Create FTP Profile"));
    setProfileModalInitial({ name: "", host: "", port: 21, username: "", password: "", passiveMode: true, remoteRoot: "/", ftpEncoding: "auto" });
    setProfileModalOpen(true);
  }

  async function openEditProfile() {
    if (!cfg.ftpProfileId) {
      setMsg(tx("请先选择一个 FTP 连接", "Please select a FTP profile first"));
      return;
    }
    profileModalModeRef.current = "edit";
    editingProfileIdRef.current = cfg.ftpProfileId;
    setProfileModalTitle(tx("编辑 FTP 连接", "Edit FTP Profile"));
    setBusy(true);
    setMsg(null);
    try {
      const full = await api.getFtpProfile(cfg.ftpProfileId);
      setProfileModalInitial(full);
      setProfileModalOpen(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : tx("加载失败", "Load failed"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteProfile() {
    const pid = cfg.ftpProfileId;
    if (!pid) {
      setMsg(tx("请先选择一个 FTP 连接", "Please select a FTP profile first"));
      return;
    }
    const ok = window.confirm(tx("确认删除该 FTP 连接？已绑定项目会自动回退到项目内保存的连接信息。", "Delete this FTP profile? Projects bound to it will fall back to the project's saved fields."));
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.deleteFtpProfile(pid);
      const rows = await api.listFtpProfiles();
      setProfiles(rows.map((x) => ({ id: x.id, name: x.name })));
      setCfg((s) => ({ ...s, ftpProfileId: null }));
      setMsg(tx("已删除", "Deleted"));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : tx("删除失败", "Delete failed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(body: { name: string; host: string; port: number; username: string; password: string; passiveMode: boolean; remoteRoot: string; ftpEncoding: "auto" | "utf-8" | "gbk" }) {
    setBusy(true);
    setMsg(null);
    try {
      if (profileModalModeRef.current === "create") {
        const created = await api.createFtpProfile(body);
        const rows = await api.listFtpProfiles();
        setProfiles(rows.map((x) => ({ id: x.id, name: x.name })));
        await applyProfileToCfg(created.id);
      } else {
        const pid = editingProfileIdRef.current;
        if (!pid) throw new Error(tx("未选择要编辑的连接", "No profile selected"));
        await api.updateFtpProfile(pid, body);
        const rows = await api.listFtpProfiles();
        setProfiles(rows.map((x) => ({ id: x.id, name: x.name })));
        await applyProfileToCfg(pid);
      }
      setProfileModalOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (cfg.connectionMode !== "ftp") return;
    setBusy(true);
    setMsg(null);
    setTestOk(false);
    try {
      const r = await api.testFtp(cfg);
      setMsg(r.ok ? `连接成功，PWD=${r.pwd ?? ""}` : "连接失败");
      setTestOk(Boolean(r.ok));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : tx("连接失败", "Connection failed"));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!activeProjectId) {
      setMsg(tx("请先选择项目", "Please select a project first"));
      return;
    }
    if (cfg.connectionMode === "local" && !localTargetPath.trim()) {
      setMsg(tx("请先选择本地目标目录", "Please choose a local target directory first"));
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api.saveFtp(activeProjectId, cfg);
      if (cfg.connectionMode === "local" && localTargetPath.trim()) {
        await api.updateProject(activeProjectId, { remotePath: localTargetPath.trim() });
        await refreshProjects();
      }
      setMsg(tx("已保存", "Saved"));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : tx("保存失败", "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function pickAndBindProject(path: string, fullPath: string) {
    if (bindLockRef.current) return;
    bindLockRef.current = true;
    if (!activeProjectId) {
      setMsg(tx("请先选择项目", "Please select a project first"));
      bindLockRef.current = false;
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const nextCfg = { ...cfg, remoteRoot: fullPath };
      setCfg(nextCfg);
      await api.saveFtp(activeProjectId, nextCfg);
      await api.updateProject(activeProjectId, { remotePath: fullPath });
      await refreshProjects();
      setMsg(isEn ? `Project directory linked: ${fullPath}` : `已关联项目目录：${fullPath}`);
      setPickOpen(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : tx("关联失败", "Binding failed"));
    } finally {
      setBusy(false);
      bindLockRef.current = false;
    }
  }

  async function pickLocalTargetPathSystem() {
    if (!activeProjectId) {
      setMsg(tx("请先选择项目", "Please select a project first"));
      return;
    }
    if (busy || bindLockRef.current) {
      return;
    }
    bindLockRef.current = true;
    setBusy(true);
    setMsg(tx("正在打开系统文件夹选择窗口…", "Opening system folder picker…"));
    try {
      const result = await api.pickDirectory(localTargetPath || activeProject?.remotePath || undefined);
      setLocalTargetPath(result.path);
      setLocalPickSource("system");
      browserDirHandleRef.current = null;
      setBrowserPickedFolderName("");
      setMsg(isEn ? `Selected: ${result.path}` : `已选择：${result.path}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : tx("选择失败", "Pick failed"));
    } finally {
      setBusy(false);
      bindLockRef.current = false;
    }
  }

  function handleBrowserDirInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const rel = files[0]?.webkitRelativePath ?? "";
    const folder = rel ? rel.split("/")[0] : "";
    if (!folder) {
      setMsg(tx("未选择文件夹", "No folder selected"));
      return;
    }
    setLocalPickSource("browser");
    browserDirHandleRef.current = null;
    setBrowserPickedFolderName(folder);
    setLocalTargetPath(folder);
    setMsg(isEn ? `Selected folder: ${folder}` : `已选择文件夹：${folder}`);
  }

  async function saveLocalTargetPath() {
    if (!activeProjectId) {
      setMsg(tx("请先选择项目", "Please select a project first"));
      return;
    }
    if (busy || bindLockRef.current) {
      return;
    }
    if (!localTargetPath.trim()) {
      setMsg(tx("请先选择本地目标目录", "Please choose a local target directory first"));
      return;
    }
    bindLockRef.current = true;
    setBusy(true);
    setMsg(null);
    try {
      if (localPickSource === "browser") {
        const handle = browserDirHandleRef.current;
        if (handle) {
          await new Promise<void>((resolve, reject) => {
            const req = indexedDB.open("sqlftpvc", 1);
            req.onupgradeneeded = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains("dirHandles")) {
                db.createObjectStore("dirHandles");
              }
            };
            req.onsuccess = () => {
              const db = req.result;
              const txo = db.transaction("dirHandles", "readwrite");
              txo.oncomplete = () => {
                db.close();
                resolve();
              };
              txo.onerror = () => {
                db.close();
                reject(txo.error);
              };
              txo.objectStore("dirHandles").put(handle, activeProjectId);
            };
            req.onerror = () => reject(req.error);
          });
          setMsg(
            tx(
              "已保存浏览器文件夹授权（仅当前浏览器可用）。注意：浏览器无法获取绝对路径，后端本地同步/发布需要绝对路径。",
              "Browser folder permission saved (this browser only). Note: browsers cannot access absolute paths; backend local sync/publish needs an absolute path."
            )
          );
        } else {
          localStorage.setItem(`sqlftpvc.browserFolder.${activeProjectId}`, browserPickedFolderName || localTargetPath.trim());
          setMsg(
            tx(
              "已保存浏览器选择结果（仅用于当前浏览器内记录，无法获取绝对路径）。后端本地同步/发布需要绝对路径。",
              "Browser selection saved (this browser only; absolute path is unavailable). Backend local sync/publish needs an absolute path."
            )
          );
        }
      } else {
        await api.updateProject(activeProjectId, { remotePath: localTargetPath.trim() });
        await refreshProjects();
        setMsg(isEn ? `Saved: ${localTargetPath.trim()}` : `已保存：${localTargetPath.trim()}`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : tx("保存失败", "Save failed"));
    } finally {
      setBusy(false);
      bindLockRef.current = false;
    }
  }

  return (
    <div className="px-6 py-6">
      <div>
        <div className="text-base font-semibold text-zinc-900">{tx("连接", "Connections")}</div>
        <div className="mt-1 text-sm text-zinc-600">{tx("配置 FTP 连接或本地目录模式", "Configure FTP connection or local directory mode")}</div>
      </div>

      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="text-sm font-semibold text-zinc-900">{tx("连接模式", "Connection Mode")}</div>
        <div className="mt-3 inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-1">
          <button
            type="button"
            className={cfg.connectionMode === "ftp" ? "rounded bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm" : "rounded px-3 py-1.5 text-sm text-zinc-600"}
            onClick={() => {
              setCfg((s) => ({ ...s, connectionMode: "ftp" }));
              setMsg(null);
              setTestOk(false);
            }}
          >
            FTP
          </button>
          <button
            type="button"
            className={cfg.connectionMode === "local" ? "rounded bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm" : "rounded px-3 py-1.5 text-sm text-zinc-600"}
            onClick={() => {
              setCfg((s) => ({ ...s, connectionMode: "local", ftpProfileId: null }));
              setMsg(null);
              setTestOk(false);
            }}
          >
            {tx("本地目录", "Local Directory")}
          </button>
        </div>

        {cfg.connectionMode === "ftp" ? (
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <div className="text-xs text-zinc-600">{tx("FTP 连接", "FTP Profile")}</div>
              <div className="flex items-center gap-2">
                <select
                  className="h-10 flex-1 rounded-md border border-zinc-200 bg-white px-2 text-sm"
                  value={cfg.ftpProfileId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      setCfg((s) => ({ ...s, ftpProfileId: null }));
                      setMsg(null);
                      setTestOk(false);
                      return;
                    }
                    void applyProfileToCfg(v);
                  }}
                  disabled={busy || profilesBusy}
                >
                  <option value="">{tx("（手动输入）", "(Manual)")}</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" onClick={openCreateProfile} disabled={busy}>
                  {tx("新建", "New")}
                </Button>
                <Button variant="secondary" onClick={() => void openEditProfile()} disabled={busy || !cfg.ftpProfileId}>
                  {tx("编辑", "Edit")}
                </Button>
                <Button variant="secondary" onClick={() => void deleteProfile()} disabled={busy || !cfg.ftpProfileId}>
                  {tx("删除", "Delete")}
                </Button>
              </div>
              {profilesMsg ? <div className="mt-2 text-xs text-red-600">{profilesMsg}</div> : null}
            </div>
            <div>
              <div className="text-xs text-zinc-600">Host</div>
              <Input value={cfg.host} onChange={(e) => setCfg((s) => ({ ...s, host: e.target.value, ftpProfileId: null }))} placeholder="10.0.0.12" />
            </div>
            <div>
              <div className="text-xs text-zinc-600">Port</div>
              <Input value={String(cfg.port)} onChange={(e) => setCfg((s) => ({ ...s, port: Number(e.target.value || 21), ftpProfileId: null }))} placeholder="21" />
            </div>
            <div>
              <div className="text-xs text-zinc-600">{tx("用户名", "Username")}</div>
              <Input value={cfg.username} onChange={(e) => setCfg((s) => ({ ...s, username: e.target.value, ftpProfileId: null }))} />
            </div>
            <div>
              <div className="text-xs text-zinc-600">{tx("密码", "Password")}</div>
              <Input value={cfg.password} onChange={(e) => setCfg((s) => ({ ...s, password: e.target.value, ftpProfileId: null }))} type="password" />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" checked={cfg.passiveMode} onChange={(e) => setCfg((s) => ({ ...s, passiveMode: e.target.checked, ftpProfileId: null }))} />
                {tx("被动模式", "Passive Mode")}
              </label>
            </div>
            <div>
              <div className="text-xs text-zinc-600">remoteRoot</div>
              <Input value={cfg.remoteRoot} onChange={(e) => setCfg((s) => ({ ...s, remoteRoot: e.target.value, ftpProfileId: null }))} placeholder="/" />
            </div>
            <div>
              <div className="text-xs text-zinc-600">{tx("FTP 文件名编码", "FTP Filename Encoding")}</div>
              <select
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm"
                value={cfg.ftpEncoding}
                onChange={(e) => setCfg((s) => ({ ...s, ftpEncoding: e.target.value as FtpConfig["ftpEncoding"], ftpProfileId: null }))}
              >
                <option value="auto">{tx("自动（推荐）", "Auto (Recommended)")}</option>
                <option value="utf-8">UTF-8</option>
                <option value="gbk">{tx("GBK（常见老内网 FTP）", "GBK (common for legacy intranet FTP)")}</option>
              </select>
              <div className="mt-1 text-xs text-zinc-500">{tx("中文目录出现 550/乱码时优先试试 GBK。", "If Chinese directories show 550 or garbled text, try GBK first.")}</div>
            </div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <div className="text-xs text-zinc-600">{tx("本地目标目录", "Local Target Directory")}</div>
              <div className="flex items-center gap-2">
                <input ref={browserDirInputRef} type="file" className="hidden" multiple onChange={handleBrowserDirInputChange} />
                <div className="flex-1">
                  <Input value={localTargetPath} readOnly placeholder={tx("请点击右侧按钮选择文件夹", "Use the button on the right to pick a folder")} />
                </div>
                <Button variant="secondary" onClick={() => void pickLocalTargetPathSystem()} disabled={busy}>
                  {tx("文件夹选择", "Choose Folder")}
                </Button>
                <Button onClick={() => void saveLocalTargetPath()} disabled={busy || !localTargetPath.trim()}>
                  {tx("保存", "Save")}
                </Button>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {tx("本地模式下，项目的“目标目录”会作为上传目标位置。版本回退只会影响本地工作区。", "In local mode, the project target directory is used for upload only. Version rollback only affects the local workspace.")}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          {cfg.connectionMode === "ftp" ? (
            <>
              <Button variant="secondary" onClick={test} disabled={busy || !cfg.host || !cfg.username}>
                {tx("测试连接", "Test Connection")}
              </Button>
              <Button variant="secondary" onClick={() => setPickOpen(true)} disabled={busy || !testOk || !cfg.host || !cfg.username || !cfg.password}>
                {tx("浏览目录并关联项目", "Browse Directories and Bind Project")}
              </Button>
            </>
          ) : null}
          <Button onClick={save} disabled={busy || !activeProjectId || (cfg.connectionMode === "ftp" ? !cfg.host || !cfg.username || !cfg.password : !localTargetPath.trim())}>
            {tx("保存到当前项目", "Save to Current Project")}
          </Button>
        </div>

        <div className="mt-3 text-xs text-zinc-500">{tx("当前项目：", "Current Project: ")}{activeProject ? activeProject.name : tx("未选择", "Not Selected")}</div>
        <div className="mt-1 text-xs text-zinc-500">
          {tx("当前目标目录：", "Current Target Directory: ")}
          {activeProject?.remotePath || tx("未设置", "Not set")}
        </div>
        {msg ? <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">{msg}</div> : null}
      </div>

      {cfg.connectionMode === "ftp" ? (
        <FtpDirPickerModal open={pickOpen} busy={busy} cfg={cfg} onClose={() => setPickOpen(false)} onPick={pickAndBindProject} />
      ) : null}

      <FtpProfileModal
        open={profileModalOpen}
        busy={busy}
        title={profileModalTitle}
        initial={profileModalInitial}
        onClose={() => setProfileModalOpen(false)}
        onSave={saveProfile}
      />
    </div>
  );
}
