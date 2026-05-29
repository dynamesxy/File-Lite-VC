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
  localPath: string;
  remotePath: string;
  onClose: () => void;
  onSave: () => Promise<void>;
  onChange: (patch: { name?: string; localPath?: string; remotePath?: string }) => void;
}) {
  const { tx } = useI18n();
  const [pickBusy, setPickBusy] = useState(false);
  const [ftpCfg, setFtpCfg] = useState<FtpConfig | null>(null);
  const [ftpErr, setFtpErr] = useState<string | null>(null);
  const [ftpPickOpen, setFtpPickOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const browseCfg = useMemo<FtpConfig | null>(() => {
    if (!ftpCfg) return null;
    return { ...ftpCfg, remoteRoot: "/" };
  }, [ftpCfg]);

  useEffect(() => {
    if (!props.open) return;
    setFtpErr(null);
    setFtpPickOpen(false);
    setPickBusy(false);
    setFtpCfg(null);
    setSubmitError(null);
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
      const r = await api.pickDirectory(props.localPath || undefined);
      props.onChange({ localPath: r.path });
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
      setFtpErr(e instanceof Error ? e.message : tx("加载 FTP 配置失败，请先到“连接与设置”保存 FTP 配置", 'Failed to load FTP settings. Please save FTP settings in "Settings" first.'));
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
          <Button onClick={handleSave} disabled={props.busy || !props.name.trim() || !props.localPath.trim() || !props.remotePath.trim()}>
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
          <div className="text-xs text-zinc-600">{tx("本地工作区路径", "Local Workspace Path")}</div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input value={props.localPath} onChange={(e) => props.onChange({ localPath: e.target.value })} placeholder={tx("例如：D:\\work\\sql", "Example: D:\\work\\sql")} />
            </div>
            <Button variant="secondary" onClick={pickLocalDir} disabled={props.busy || pickBusy}>
              {pickBusy ? tx("选择中...", "Choosing...") : tx("选择文件夹", "Choose Folder")}
            </Button>
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-600">{tx("FTP 远端目录（绝对路径）", "FTP Remote Directory (Absolute Path)")}</div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input value={props.remotePath} onChange={(e) => props.onChange({ remotePath: e.target.value })} placeholder={tx("例如：/交付/数据库/项目A", "Example: /delivery/database/projectA")} />
            </div>
            <Button variant="secondary" onClick={openFtpPicker} disabled={props.busy || pickBusy}>
              {tx("选择目录", "Choose Directory")}
            </Button>
          </div>
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
