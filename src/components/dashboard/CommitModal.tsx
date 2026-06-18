import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useI18n } from "@/i18n";
import type { Script } from "@/utils/api";

export function CommitModal(props: {
  open: boolean;
  busy: boolean;
  targets: Script[];
  message: string;
  onClose: () => void;
  onChangeMessage: (v: string) => void;
  onCommit: () => void;
}) {
  const { tx } = useI18n();
  const singleTarget = props.targets.length === 1 ? props.targets[0] : null;
  return (
    <Modal
      open={props.open}
      title={
        singleTarget
          ? tx(`提交版本：${singleTarget.relativePath}`, `Commit Version: ${singleTarget.relativePath}`)
          : props.targets.length > 1
            ? tx(`批量提交版本（${props.targets.length} 个文件）`, `Batch Commit (${props.targets.length} files)`)
            : tx("提交版本", "Commit Version")
      }
      onClose={() => {
        if (!props.busy) props.onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose} disabled={props.busy}>
            {tx("取消", "Cancel")}
          </Button>
          <Button onClick={props.onCommit} disabled={props.busy || !props.message.trim()}>
            {tx("提交", "Commit")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {props.targets.length > 1 ? (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            <div>{tx("本次会使用同一条提交说明，依次提交以下文件：", "The same commit message will be used for all files below:")}</div>
            <div className="mt-1 font-mono">
              {props.targets.slice(0, 5).map((item) => item.relativePath).join("；")}
              {props.targets.length > 5 ? tx(` 等 ${props.targets.length} 个文件`, ` and ${props.targets.length} files in total`) : ""}
            </div>
          </div>
        ) : null}
        <div className="text-xs text-zinc-600">{tx("提交说明", "Commit Message")}</div>
        <Textarea value={props.message} onChange={(e) => props.onChangeMessage(e.target.value)} placeholder={tx("本次修改目的、影响范围、回滚要点...", "Purpose, impact, and rollback notes for this change...")} />
        <div className="text-xs text-zinc-500">{tx("如果工作区内容与最新版本一致，将返回“无改动可提交”。", 'If the workspace matches the latest version, the result will be "no changes to commit".')}</div>
      </div>
    </Modal>
  );
}

