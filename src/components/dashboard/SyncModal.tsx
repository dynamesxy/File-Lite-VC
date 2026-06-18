import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n";
import type { PullPushResult } from "@/utils/api";

export function SyncModal(props: {
  open: boolean;
  mode: "pull" | "push";
  connectionMode: "ftp" | "local";
  busy: boolean;
  overwrite: boolean;
  result: PullPushResult | null;
  conflictSelections: Record<string, ("local" | "remote")[]>;
  onClose: () => void;
  onToggleOverwrite: (v: boolean) => void;
  onChangeConflictSelection: (relativePath: string, lineIndex: number, side: "local" | "remote") => void;
  onApply: () => Promise<void>;
}) {
  const { tx } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleApply() {
    if (props.busy) return;
    await props.onApply();
    setConfirmOpen(false);
  }

  const targetName = props.connectionMode === "local" ? tx("本地目标目录", "local target directory") : "FTP";
  const actionText = props.mode === "pull" ? tx(`从${targetName}拉取到本地`, `pull files from ${targetName} to local`) : tx(`上传本地文件到${targetName}`, `upload local files to ${targetName}`);
  const defaultPreferredSide = props.mode === "pull" ? "remote" : "local";

  return (
    <>
      <Modal
        open={props.open}
        title={
          props.mode === "pull"
            ? (props.connectionMode === "local" ? tx("本地目录拉取预览", "Local Pull Preview") : tx("FTP 拉取预览", "FTP Pull Preview"))
            : (props.connectionMode === "local" ? tx("本地目录上传预览", "Local Push Preview") : tx("FTP 上传预览", "FTP Push Preview"))
        }
        onClose={() => {
          if (!props.busy) props.onClose();
        }}
        footer={
          <>
            <label className="mr-auto flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={props.overwrite} onChange={(e) => props.onToggleOverwrite(e.target.checked)} />
              {tx("未逐行解决时，整体覆盖有差异文件", "Overwrite changed files when no per-line resolution is chosen")}
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
                  <div className="text-xs text-zinc-600">
                    {f.status}
                    {f.conflictCount > 0 ? tx(` · ${f.conflictCount} 行冲突`, ` · ${f.conflictCount} conflict lines`) : ""}
                  </div>
                </div>
                {f.conflictCount > 0 ? (
                  <div className="space-y-2 p-3">
                    <div className="text-xs text-zinc-600">
                      {tx("像 Git 处理冲突一样，为每一行选择保留本地还是远程内容。", "Choose local or remote content for each conflict line, similar to Git conflict resolution.")}
                    </div>
                    <div className="max-h-72 space-y-2 overflow-auto">
                      {f.conflictLines.map((line) => {
                        const selectedSide = props.conflictSelections[f.relativePath]?.[line.index] ?? line.selectedSide ?? defaultPreferredSide;
                        return (
                          <div key={`${f.relativePath}-${line.index}`} className="rounded-md border border-zinc-200 bg-zinc-50 p-2">
                            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-600">
                              <div>{tx(`冲突行 ${line.index + 1}`, `Conflict line ${line.index + 1}`)}</div>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={selectedSide === "local" ? "primary" : "secondary"}
                                  onClick={() => props.onChangeConflictSelection(f.relativePath, line.index, "local")}
                                >
                                  {tx("使用本地", "Use Local")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={selectedSide === "remote" ? "primary" : "secondary"}
                                  onClick={() => props.onChangeConflictSelection(f.relativePath, line.index, "remote")}
                                >
                                  {tx("使用远程", "Use Remote")}
                                </Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                              <div className="rounded border border-zinc-200 bg-white p-2">
                                <div className="mb-1 text-[11px] text-zinc-500">
                                  {tx("本地", "Local")} {line.localNo ? `#${line.localNo}` : tx("(无)", "(none)")}
                                </div>
                                <pre className="overflow-auto whitespace-pre-wrap break-all text-xs text-zinc-800">{line.localText || tx("(空)", "(empty)")}</pre>
                              </div>
                              <div className="rounded border border-zinc-200 bg-white p-2">
                                <div className="mb-1 text-[11px] text-zinc-500">
                                  {tx("远程", "Remote")} {line.remoteNo ? `#${line.remoteNo}` : tx("(无)", "(none)")}
                                </div>
                                <pre className="overflow-auto whitespace-pre-wrap break-all text-xs text-zinc-800">{line.remoteText || tx("(空)", "(empty)")}</pre>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <pre className="max-h-56 overflow-auto bg-zinc-50 p-3 text-xs text-zinc-800">{f.diffPreview || tx("(无差异)", "(no diff)")}</pre>
                )}
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
        <div className="text-sm text-zinc-700">{tx(`确认执行${actionText}吗？已选择的冲突行会按你的本地/远程决策生成最终内容。`, `Are you sure you want to ${actionText}? Selected conflict lines will be merged using your local/remote choices.`)}</div>
      </Modal>
    </>
  );
}

