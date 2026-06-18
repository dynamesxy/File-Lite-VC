import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/i18n";
import type { FtpProfileFull } from "@/utils/api";

export function FtpProfileModal(props: {
  open: boolean;
  busy: boolean;
  title: string;
  initial: Partial<FtpProfileFull> | null;
  onClose: () => void;
  onSave: (body: { name: string; host: string; port: number; username: string; password: string; passiveMode: boolean; remoteRoot: string; ftpEncoding: "auto" | "utf-8" | "gbk" }) => Promise<void>;
}) {
  const { tx } = useI18n();
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(21);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passiveMode, setPassiveMode] = useState(true);
  const [remoteRoot, setRemoteRoot] = useState("/");
  const [ftpEncoding, setFtpEncoding] = useState<"auto" | "utf-8" | "gbk">("auto");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setName(props.initial?.name ?? "");
    setHost(props.initial?.host ?? "");
    setPort(typeof props.initial?.port === "number" ? props.initial.port : 21);
    setUsername(props.initial?.username ?? "");
    setPassword(props.initial?.password ?? "");
    setPassiveMode(typeof props.initial?.passiveMode === "boolean" ? props.initial.passiveMode : true);
    setRemoteRoot(props.initial?.remoteRoot ?? "/");
    setFtpEncoding((props.initial?.ftpEncoding as "auto" | "utf-8" | "gbk" | undefined) ?? "auto");
  }, [props.open, props.initial]);

  async function save() {
    if (props.busy) return;
    setError(null);
    try {
      await props.onSave({
        name: name.trim(),
        host: host.trim(),
        port: Number(port || 21),
        username: username.trim(),
        password,
        passiveMode,
        remoteRoot: remoteRoot.trim() || "/",
        ftpEncoding,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("保存失败", "Save failed"));
    }
  }

  const canSave = Boolean(name.trim() && host.trim() && username.trim() && password);

  return (
    <Modal
      open={props.open}
      title={props.title}
      onClose={() => {
        if (!props.busy) props.onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose} disabled={props.busy}>
            {tx("取消", "Cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={props.busy || !canSave}>
            {tx("保存", "Save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="text-xs text-zinc-600">{tx("名称", "Name")}</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tx("例如：测试环境 FTP", "Example: Test FTP")} />
        </div>
        <div>
          <div className="text-xs text-zinc-600">Host</div>
          <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="10.0.0.12" />
        </div>
        <div>
          <div className="text-xs text-zinc-600">Port</div>
          <Input value={String(port)} onChange={(e) => setPort(Number(e.target.value || 21))} placeholder="21" />
        </div>
        <div>
          <div className="text-xs text-zinc-600">{tx("用户名", "Username")}</div>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <div className="text-xs text-zinc-600">{tx("密码", "Password")}</div>
          <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={passiveMode} onChange={(e) => setPassiveMode(e.target.checked)} />
            {tx("被动模式", "Passive Mode")}
          </label>
        </div>
        <div>
          <div className="text-xs text-zinc-600">remoteRoot</div>
          <Input value={remoteRoot} onChange={(e) => setRemoteRoot(e.target.value)} placeholder="/" />
        </div>
        <div>
          <div className="text-xs text-zinc-600">{tx("FTP 文件名编码", "FTP Filename Encoding")}</div>
          <select
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm"
            value={ftpEncoding}
            onChange={(e) => setFtpEncoding(e.target.value as "auto" | "utf-8" | "gbk")}
          >
            <option value="auto">{tx("自动（推荐）", "Auto (Recommended)")}</option>
            <option value="utf-8">UTF-8</option>
            <option value="gbk">{tx("GBK（常见老内网 FTP）", "GBK (common for legacy intranet FTP)")}</option>
          </select>
        </div>
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      </div>
    </Modal>
  );
}

