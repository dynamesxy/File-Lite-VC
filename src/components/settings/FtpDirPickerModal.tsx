import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/i18n";
import type { FtpBrowseResult, FtpConfig, FtpDir } from "@/utils/api";
import { api } from "@/utils/api";

function parentPath(p: string): string {
  if (!p || p === "/") return "/";
  const parts = p.split("/").filter(Boolean);
  parts.pop();
  return "/" + parts.join("/");
}

function normalizePosix(p: string): string {
  if (!p) return "/";
  let x = p.replace(/\\/g, "/");
  if (!x.startsWith("/")) x = "/" + x;
  x = x.replace(/\/+/g, "/");
  if (x.length > 1 && x.endsWith("/")) x = x.slice(0, -1);
  return x;
}

function joinPosix(a: string, b: string): string {
  const a2 = normalizePosix(a);
  const b2 = normalizePosix(b);
  if (b2 === "/") return a2;
  if (a2 === "/") return b2;
  return normalizePosix(a2 + "/" + b2.slice(1));
}

export function FtpDirPickerModal(props: {
  open: boolean;
  busy: boolean;
  cfg: FtpConfig;
  onClose: () => void;
  onPick: (relativePath: string, fullPath: string) => void;
}) {
  const { tx } = useI18n();
  const [path, setPath] = useState("/");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FtpBrowseResult | null>(null);

  const dirs = useMemo<FtpDir[]>(() => data?.dirs ?? [], [data]);

  useEffect(() => {
    if (!props.open) return;
    setPath("/");
    setData(null);
    setError(null);
    setSubmitting(false);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const r = await api.browseFtp(props.cfg, path);
        if (!cancelled) setData(r);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : tx("加载目录失败", "Failed to load directories"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [props.open, path, props.cfg]);

  return (
    <Modal
      open={props.open}
      title={tx("选择 FTP 目录", "Choose FTP Directory")}
      onClose={() => {
        if (!props.busy && !loading) props.onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose} disabled={props.busy || loading}>
            {tx("取消", "Cancel")}
          </Button>
          <Button
            onClick={() => {
              if (submitting) return;
              setSubmitting(true);
              props.onPick(path, joinPosix(props.cfg.remoteRoot, path));
            }}
            disabled={props.busy || loading || submitting}
          >
            {tx("选择当前目录", "Select Current Directory")}
          </Button>
        </>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-zinc-600">
          {tx("当前（完整）：", "Current (Full):")}<span className="font-mono text-zinc-900">{joinPosix(props.cfg.remoteRoot, path)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setPath(parentPath(path))} disabled={loading || path === "/"}>
            {tx("上级", "Up")}
          </Button>
          <Button variant="secondary" onClick={() => setPath("/")} disabled={loading || path === "/"}>
            {tx("根目录", "Root")}
          </Button>
        </div>
      </div>

      {error ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="mt-3 overflow-auto rounded-md border border-zinc-200">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-600">
            <tr>
              <th className="px-3 py-2">{tx("目录", "Directory")}</th>
              <th className="px-3 py-2">{tx("路径", "Path")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={2} className="border-t border-zinc-100 px-3 py-3 text-sm text-zinc-600">
                  {tx("加载中...", "Loading...")}
                </td>
              </tr>
            ) : dirs.length === 0 ? (
              <tr>
                <td colSpan={2} className="border-t border-zinc-100 px-3 py-3 text-sm text-zinc-600">
                  {tx("无子目录", "No subdirectories")}
                </td>
              </tr>
            ) : (
              dirs.map((d) => (
                <tr key={d.path} className="border-t border-zinc-100">
                  <td className="px-3 py-2">
                    <button className="text-left text-sm text-zinc-900 hover:underline" onClick={() => setPath(d.path)}>
                      {d.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-700">{d.path}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-zinc-500">
        {tx("说明：点击目录进入下级；“根目录”表示 remoteRoot 本身。若中文目录报 550/乱码，优先在设置里把“FTP 文件名编码”切到 GBK，并查看 sqlftpvc-runtime.log。", 'Tips: click a directory to enter it; "Root" means the remoteRoot itself. If Chinese directories return 550 or garbled text, switch "FTP filename encoding" to GBK in Settings and inspect sqlftpvc-runtime.log.')}
      </div>
    </Modal>
  );
}
