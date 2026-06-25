import { useEffect, useMemo, useState } from "react";

import { api } from "@/utils/api";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n";
import type { FtpProfile } from "@/utils/api";

export function ProjectCreateModal(props: {
  open: boolean;
  busy: boolean;
  name: string;
  localPaths: string[];
  remotePath: string;
  connectionMode: "ftp" | "local";
  ftpProfileId: string | null;
  scriptExtensions: string[];
  onClose: () => void;
  onCreate: () => Promise<void>;
  onChange: (patch: {
    name?: string;
    localPaths?: string[];
    remotePath?: string;
    connectionMode?: "ftp" | "local";
    ftpProfileId?: string | null;
    scriptExtensions?: string[];
  }) => void;
}) {
  const { tx } = useI18n();
  const [pickBusy, setPickBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [customExt, setCustomExt] = useState("");
  const [profiles, setProfiles] = useState<FtpProfile[]>([]);
  const [profilesBusy, setProfilesBusy] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const builtinExts = [".sql", ".java", ".vue", ".js", ".py", ".xml", ".txt"];
  const selectedExtSet = useMemo(() => new Set(props.scriptExtensions.map((x) => x.toLowerCase())), [props.scriptExtensions]);

  useEffect(() => {
    if (!props.open) return;
    setCustomExt("");
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    async function loadProfiles() {
      setProfilesBusy(true);
      setProfilesError(null);
      try {
        const rows = await api.listFtpProfiles();
        if (!cancelled) setProfiles(rows);
      } catch (e) {
        if (!cancelled) setProfilesError(e instanceof Error ? e.message : tx("加载 FTP 连接列表失败", "Failed to load FTP profile list"));
      } finally {
        if (!cancelled) setProfilesBusy(false);
      }
    }
    void loadProfiles();
    return () => {
      cancelled = true;
    };
  }, [props.open]);

  function normalizeExt(value: string) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return "";
    return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
  }

  function toggleExt(ext: string) {
    const set = new Set(props.scriptExtensions.map((x) => x.toLowerCase()));
    if (set.has(ext)) set.delete(ext);
    else set.add(ext);
    props.onChange({ scriptExtensions: Array.from(set) });
  }

  function addCustomExt() {
    const ext = normalizeExt(customExt);
    if (!ext) return;
    const set = new Set(props.scriptExtensions.map((x) => x.toLowerCase()));
    set.add(ext);
    props.onChange({ scriptExtensions: Array.from(set) });
    setCustomExt("");
  }

  function removeExt(ext: string) {
    props.onChange({ scriptExtensions: props.scriptExtensions.filter((x) => x.toLowerCase() !== ext.toLowerCase()) });
  }

  async function handleCreate() {
    if (props.busy) return;
    setSubmitError(null);
    try {
      await props.onCreate();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx("创建失败", "Create failed"));
    }
  }

  async function pickLocalDir() {
    if (pickBusy || props.busy) return;
    setPickBusy(true);
    setPickError(null);
    try {
      const initial = props.localPaths.length > 0 ? props.localPaths[props.localPaths.length - 1] : undefined;
      const r = await api.pickDirectory(initial);
      const next = [...props.localPaths, r.path];
      props.onChange({ localPaths: next });
    } catch (e) {
      setPickError(e instanceof Error ? e.message : tx("选择文件夹失败", "Failed to choose folder"));
    } finally {
      setPickBusy(false);
    }
  }

  async function pickTargetDir() {
    if (pickBusy || props.busy) return;
    setPickBusy(true);
    setPickError(null);
    try {
      const r = await api.pickDirectory(props.remotePath || undefined);
      props.onChange({ remotePath: r.path });
    } catch (e) {
      setPickError(e instanceof Error ? e.message : tx("选择文件夹失败", "Failed to choose folder"));
    } finally {
      setPickBusy(false);
    }
  }

  const effectiveLocalPaths = useMemo(() => props.localPaths.map((x) => x.trim()).filter(Boolean), [props.localPaths]);

  const canCreate =
    !props.busy &&
    Boolean(props.name.trim()) &&
    effectiveLocalPaths.length > 0 &&
    props.scriptExtensions.length > 0 &&
    (props.connectionMode === "local" ? Boolean(props.remotePath.trim()) : Boolean(props.ftpProfileId));

  return (
    <Modal
      open={props.open}
      title={tx("新建项目", "Create Project")}
      onClose={() => {
        if (!props.busy) props.onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose} disabled={props.busy}>
            {tx("取消", "Cancel")}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!canCreate}
          >
            {tx("创建", "Create")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="text-xs text-zinc-600">{tx("项目名", "Project Name")}</div>
          <Input value={props.name} onChange={(e) => props.onChange({ name: e.target.value })} placeholder={tx("例如：结算脚本", "Example: settlement scripts")} />
        </div>
        <div>
          <div className="text-xs text-zinc-600">{tx("连接类型", "Connection Type")}</div>
          <div className="mt-2 inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-1">
            <button
              type="button"
              className={props.connectionMode === "local" ? "rounded bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm" : "rounded px-3 py-1.5 text-sm text-zinc-600"}
              onClick={() => props.onChange({ connectionMode: "local", ftpProfileId: null })}
              disabled={props.busy}
            >
              {tx("本地目录", "Local Directory")}
            </button>
            <button
              type="button"
              className={props.connectionMode === "ftp" ? "rounded bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm" : "rounded px-3 py-1.5 text-sm text-zinc-600"}
              onClick={() => props.onChange({ connectionMode: "ftp" })}
              disabled={props.busy}
            >
              FTP
            </button>
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">{tx("本地工作区路径（可多选）", "Local Workspace Paths (Multiple)")}</div>
          <div className="mt-2 space-y-2">
            {props.localPaths.length === 0 ? (
              <div className="text-sm text-zinc-500">{tx("请添加至少一个本地目录", "Please add at least one local folder")}</div>
            ) : (
              props.localPaths.map((p, idx) => (
                <div key={`${idx}-${p}`} className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      value={p}
                      onChange={(e) => {
                        const next = [...props.localPaths];
                        next[idx] = e.target.value;
                        props.onChange({ localPaths: next });
                      }}
                      placeholder={tx("例如：D:\\work\\sql", "Example: D:\\work\\sql")}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const next = props.localPaths.filter((_, i) => i !== idx);
                      props.onChange({ localPaths: next });
                    }}
                    disabled={props.busy || pickBusy}
                  >
                    {tx("移除", "Remove")}
                  </Button>
                </div>
              ))
            )}
            <Button variant="secondary" onClick={pickLocalDir} disabled={props.busy || pickBusy}>
              {pickBusy ? tx("选择中...", "Choosing...") : tx("添加文件夹", "Add Folder")}
            </Button>
          </div>
        </div>
        {props.connectionMode === "local" ? (
          <div>
            <div className="text-xs text-zinc-600">{tx("本地目标目录", "Local Target Directory")}</div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Input value={props.remotePath} readOnly placeholder={tx("请点击右侧按钮选择文件夹", "Use the button on the right to pick a folder")} />
              </div>
              <Button variant="secondary" onClick={pickTargetDir} disabled={props.busy || pickBusy}>
                {pickBusy ? tx("选择中...", "Choosing...") : tx("选择文件夹", "Choose Folder")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-zinc-600">{tx("FTP 连接", "FTP Profile")}</div>
              <select
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm"
                value={props.ftpProfileId ?? ""}
                onChange={(e) => props.onChange({ ftpProfileId: e.target.value || null })}
                disabled={props.busy || profilesBusy}
              >
                <option value="">{tx("请选择（在“连接”页面可新建）", "Select (create in Connections page)")}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {profilesError ? <div className="mt-2 text-xs text-red-600">{profilesError}</div> : null}
            </div>
            <div>
              <div className="text-xs text-zinc-600">{tx("项目远端目录（可选）", "Project Remote Directory (Optional)")}</div>
              <Input
                value={props.remotePath}
                onChange={(e) => props.onChange({ remotePath: e.target.value })}
                placeholder={tx("例如：/交付/数据库/项目A（留空表示使用 remoteRoot）", "Example: /delivery/database/projectA (empty = remoteRoot)")}
              />
            </div>
          </div>
        )}
        <div>
          <div className="text-xs text-zinc-600">{tx("文件类型", "File Types")}</div>
          <div className="mt-1 flex flex-wrap gap-3 text-sm text-zinc-700">
            {builtinExts.map((ext) => (
              <label key={ext} className="inline-flex items-center gap-2">
                <input type="checkbox" checked={selectedExtSet.has(ext)} onChange={() => toggleExt(ext)} />
                {ext}
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={customExt}
                onChange={(e) => setCustomExt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomExt();
                  }
                }}
                placeholder={tx("输入自定义扩展名，例如：.ts 或 .xml", "Enter a custom extension, e.g. .ts or .xml")}
              />
            </div>
            <Button variant="secondary" size="sm" onClick={addCustomExt} disabled={!normalizeExt(customExt)}>
              {tx("添加", "Add")}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {props.scriptExtensions.map((ext) => (
              <button
                key={ext}
                type="button"
                className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                onClick={() => removeExt(ext)}
                title={tx("点击移除", "Click to remove")}
              >
                {ext} ×
              </button>
            ))}
          </div>
          <div className="mt-1 text-xs text-zinc-500">{tx("至少选择一种类型。", "Select at least one type.")}</div>
        </div>
        {pickError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{pickError}</div> : null}
        {submitError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</div> : null}
      </div>
    </Modal>
  );
}
