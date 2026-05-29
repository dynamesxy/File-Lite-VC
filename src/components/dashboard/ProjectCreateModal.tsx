import { useState } from "react";

import { api } from "@/utils/api";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n";

export function ProjectCreateModal(props: {
  open: boolean;
  busy: boolean;
  name: string;
  localPath: string;
  remotePath: string;
  onClose: () => void;
  onCreate: () => Promise<void>;
  onChange: (patch: { name?: string; localPath?: string; remotePath?: string }) => void;
}) {
  const { tx } = useI18n();
  const [pickBusy, setPickBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
      const r = await api.pickDirectory(props.localPath || undefined);
      props.onChange({ localPath: r.path });
    } catch (e) {
      setPickError(e instanceof Error ? e.message : tx("选择文件夹失败", "Failed to choose folder"));
    } finally {
      setPickBusy(false);
    }
  }

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
          <Button onClick={handleCreate} disabled={props.busy || !props.name.trim() || !props.localPath.trim() || !props.remotePath.trim()}>
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
          <Input value={props.remotePath} onChange={(e) => props.onChange({ remotePath: e.target.value })} placeholder={tx("例如：/交付/数据库/项目A", "Example: /delivery/database/projectA")} />
        </div>
        {pickError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{pickError}</div> : null}
        {submitError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</div> : null}
      </div>
    </Modal>
  );
}

