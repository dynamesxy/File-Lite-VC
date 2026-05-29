import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useI18n } from "@/i18n";
import type { Script } from "@/utils/api";

export function CommitModal(props: {
  open: boolean;
  busy: boolean;
  target: Script | null;
  message: string;
  onClose: () => void;
  onChangeMessage: (v: string) => void;
  onCommit: () => void;
}) {
  const { tx } = useI18n();
  return (
    <Modal
      open={props.open}
      title={props.target ? tx(`提交版本：${props.target.relativePath}`, `Commit Version: ${props.target.relativePath}`) : tx("提交版本", "Commit Version")}
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
        <div className="text-xs text-zinc-600">{tx("提交说明", "Commit Message")}</div>
        <Textarea value={props.message} onChange={(e) => props.onChangeMessage(e.target.value)} placeholder={tx("本次修改目的、影响范围、回滚要点...", "Purpose, impact, and rollback notes for this change...")} />
        <div className="text-xs text-zinc-500">{tx("如果工作区内容与最新版本一致，将返回“无改动可提交”。", 'If the workspace matches the latest version, the result will be "no changes to commit".')}</div>
      </div>
    </Modal>
  );
}

