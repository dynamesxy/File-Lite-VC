import { useEffect, useMemo, useState } from "react";

import type { FtpConfig, Project } from "@/utils/api";
import { api } from "@/utils/api";

import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FtpDirPickerModal } from "@/components/settings/FtpDirPickerModal";
import { useI18n } from "@/i18n";

export function ProjectEditModal(props: {
  open: boolean;
  busy: boolean;
  project: Project | null;
  name: string;
  localPaths: string[];
  remotePath: string;
  scriptExtensions: string[];
  onClose: () => void;
  onSave: () => Promise<void>;
  onChange: (patch: { name?: string; localPaths?: string[]; remotePath?: string; scriptExtensions?: string[] }) => void;
}) {
  const { tx } = useI18n();
  const [pickBusy, setPickBusy] = useState(false);
  const [ftpCfg, setFtpCfg] = useState<FtpConfig | null>(null);
  const [ftpErr, setFtpErr] = useState<string | null>(null);
  const [ftpPickOpen, setFtpPickOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [customExt, setCustomExt] = useState("");
  const builtinExts = [".sql", ".java", ".vue", ".js", ".py", ".xml", ".txt"];
  const selectedExtSet = useMemo(() => new Set(props.scriptExtensions.map((x) => x.toLowerCase())), [props.scriptExtensions]);

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

  const browseCfg = useMemo<FtpConfig | null>(() => {
    if (!ftpCfg || ftpCfg.connectionMode !== "ftp") return null;
    return { ...ftpCfg, remoteRoot: "/" };
  }, [ftpCfg]);

  useEffect(() => {
    if (!props.open) return;
    setFtpErr(null);
    setFtpPickOpen(false);
    setPickBusy(false);
    setFtpCfg(null);
    setSubmitError(null);
    setCustomExt("");
  }, [props.open]);

  async function handleSave() {
    if (props.busy) return;
    setSubmitError(null);
    try {
      await props.onSave();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx("保存失败", "Save failed"));
    }
  }

  async function pickLocalDir() {
    if (pickBusy || props.busy) return;
    setPickBusy(true);
    setFtpErr(null);
    try {
      const initial = props.localPaths.length > 0 ? props.localPaths[props.localPaths.length - 1] : undefined;
      const r = await api.pickDirectory(initial);
      props.onChange({ localPaths: [...props.localPaths, r.path] });
    } catch (e) {
      setFtpErr(e instanceof Error ? e.message : tx("选择文件夹失败", "Failed to choose folder"));
    } finally {
      setPickBusy(false);
    }
  }

  async function ensureFtpCfg() {
    if (!props.project) {
      setFtpErr(tx("未选择项目", "No project selected"));
      return null;
    }
    if (ftpCfg) return ftpCfg;
    try {
      const r = await api.getFtp(props.project.id);
      setFtpCfg(r);
      return r;
    } catch (e) {
      setFtpErr(e instanceof Error ? e.message : tx("加载 FTP 配置失败，请先到“连接”保存 FTP 配置", 'Failed to load FTP settings. Please save FTP settings in "Connections" first.'));
      return null;
    }
  }

  async function openFtpPicker() {
    if (pickBusy || props.busy) return;
    setPickBusy(true);
    setFtpErr(null);
    try {
      const r = await ensureFtpCfg();
      if (!r) return;
      if (r.connectionMode === "local") {
        const picked = await api.pickDirectory(props.remotePath || undefined);
        props.onChange({ remotePath: picked.path });
        return;
      }
      setFtpPickOpen(true);
    } finally {
      setPickBusy(false);
    }
  }

  return (
    <Modal
      open={props.open}
      title={props.project ? tx(`编辑项目：${props.project.name}`, `Edit Project: ${props.project.name}`) : tx("编辑项目", "Edit Project")}
      onClose={() => {
        if (!props.busy) props.onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose} disabled={props.busy}>
            {tx("取消", "Cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={props.busy || !props.name.trim() || props.localPaths.map((x) => x.trim()).filter(Boolean).length === 0 || !props.remotePath.trim() || props.scriptExtensions.length === 0}
          >
            {tx("保存", "Save")}
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
        <div>
          <div className="text-xs text-zinc-600">{ftpCfg?.connectionMode === "local" ? tx("本地目标目录", "Local Target Directory") : tx("FTP 远端目录（绝对路径）", "FTP Remote Directory (Absolute Path)")}</div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={props.remotePath}
                onChange={(e) => props.onChange({ remotePath: e.target.value })}
                placeholder={ftpCfg?.connectionMode === "local" ? tx("例如：D:\\deploy\\sql", "Example: D:\\deploy\\sql") : tx("例如：/交付/数据库/项目A", "Example: /delivery/database/projectA")}
              />
            </div>
            <Button variant="secondary" onClick={openFtpPicker} disabled={props.busy || pickBusy}>
              {ftpCfg?.connectionMode === "local" ? tx("选择文件夹", "Choose Folder") : tx("选择目录", "Choose Directory")}
            </Button>
          </div>
        </div>
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
        {ftpErr ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{ftpErr}</div> : null}
        {submitError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</div> : null}
      </div>

      {browseCfg ? (
        <FtpDirPickerModal
          open={ftpPickOpen}
          busy={props.busy || pickBusy}
          cfg={browseCfg}
          onClose={() => setFtpPickOpen(false)}
          onPick={(_, full) => {
            props.onChange({ remotePath: full });
            setFtpPickOpen(false);
          }}
        />
      ) : null}
    </Modal>
  );
}
