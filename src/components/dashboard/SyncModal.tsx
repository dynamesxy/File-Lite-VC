import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n";
import type { PullPushResult } from "@/utils/api";

export function SyncModal(props: {
  open: boolean;
  mode: "pull" | "push";
  busy: boolean;
  overwrite: boolean;
  result: PullPushResult | null;
  onClose: () => void;
  onToggleOverwrite: (v: boolean) => void;
  onApply: () => Promise<void>;
}) {
  const { tx } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleApply() {
    if (props.busy) return;
    await props.onApply();
    setConfirmOpen(false);
  }

  const actionText = props.mode === "pull" ? tx("从 FTP 拉取到本地", "pull files from FTP to local") : tx("上传本地文件到 FTP", "upload local files to FTP");

  return (
    <>
      <Modal
        open={props.open}
        title={props.mode === "pull" ? tx("FTP 拉取预览", "FTP Pull Preview") : tx("FTP 上传预览", "FTP Push Preview")}
        onClose={() => {
          if (!props.busy) props.onClose();
        }}
        footer={
          <>
            <label className="mr-auto flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={props.overwrite} onChange={(e) => props.onToggleOverwrite(e.target.checked)} />
              {tx("覆盖已存在且有差异的文件", "Overwrite existing files with differences")}
            </label>
            <Button variant="secondary" onClick={props.onClose} disabled={props.busy}>
              {tx("关闭", "Close")}
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={props.busy}>
              {tx("执行", "Run")}
            </Button>
          </>
        }
      >
        {props.busy ? (
          <div className="animate-pulse rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">{tx("加载中...", "Loading...")}</div>
        ) : !props.result ? (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">{tx("无结果", "No result")}</div>
        ) : (
          <div className="space-y-3">
            {props.result.files.map((f, idx) => (
              <div key={idx} className="rounded-md border border-zinc-200 bg-white">
                <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
                  <div className="font-mono text-xs text-zinc-800">{f.relativePath || tx("(错误)", "(error)")}</div>
                  <div className="text-xs text-zinc-600">{f.status}</div>
                </div>
                <pre className="max-h-56 overflow-auto bg-zinc-50 p-3 text-xs text-zinc-800">{f.diffPreview || tx("(无差异)", "(no diff)")}</pre>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={confirmOpen}
        title={tx("确认执行", "Confirm Action")}
        onClose={() => {
          if (!props.busy) setConfirmOpen(false);
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={props.busy}>
              {tx("取消", "Cancel")}
            </Button>
            <Button onClick={() => void handleApply()} disabled={props.busy}>
              {tx("确认执行", "Confirm")}
            </Button>
          </>
        }
      >
        <div className="text-sm text-zinc-700">{tx(`确认执行${actionText}吗？执行后会按当前预览结果同步文件。`, `Are you sure you want to ${actionText}? Files will be synchronized according to the current preview.`)}</div>
      </Modal>
    </>
  );
}

