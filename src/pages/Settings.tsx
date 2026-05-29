import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { FtpDirPickerModal } from "@/components/settings/FtpDirPickerModal";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/store/appStore";
import { api, type AuditLog, type FtpConfig } from "@/utils/api";

export default function SettingsPage() {
  const { tx, isEn } = useI18n();
  const { projects, activeProjectId, refreshProjects } = useAppStore();
  const activeProject = useMemo(() => projects.find((p) => p.id === activeProjectId) ?? null, [projects, activeProjectId]);

  const [cfg, setCfg] = useState<FtpConfig>({
    host: "",
    port: 21,
    username: "",
    password: "",
    passiveMode: true,
    remoteRoot: "/",
    ftpEncoding: "auto",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const bindLockRef = useRef(false);
  const [previewLogs, setPreviewLogs] = useState<AuditLog[]>([]);
  const [detailLogs, setDetailLogs] = useState<AuditLog[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsBusy, setLogsBusy] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [logActor, setLogActor] = useState("");
  const [logAction, setLogAction] = useState("");
  const [logResult, setLogResult] = useState("");
  const [logStartAt, setLogStartAt] = useState("");
  const [logEndAt, setLogEndAt] = useState("");

  const LOG_PREVIEW_LIMIT = 10;
  const LOG_PAGE_SIZE = 10;
  const logTotalPages = Math.max(1, Math.ceil(logTotal / LOG_PAGE_SIZE));

  const actionOptions = useMemo(() => {
    const values = Array.from(new Set(previewLogs.map((item) => item.action).filter(Boolean)));
    values.sort();
    return values;
  }, [previewLogs]);

  function toApiDateTime(value: string, endOfMinute: boolean): string | undefined {
    if (!value) return undefined;
    return `${value}${endOfMinute ? ":59" : ":00"}Z`;
  }

  async function loadLogs(params?: { detail?: boolean; page?: number }) {
    const detail = params?.detail ?? false;
    const page = params?.page ?? 1;
    try {
      const result = await api.logs({
        projectId: activeProjectId ?? undefined,
        actorUsername: detail ? logActor.trim() || undefined : undefined,
        action: detail ? logAction || undefined : undefined,
        result: detail ? logResult || undefined : undefined,
        startAt: detail ? toApiDateTime(logStartAt, false) : undefined,
        endAt: detail ? toApiDateTime(logEndAt, true) : undefined,
        offset: detail ? (page - 1) * LOG_PAGE_SIZE : 0,
        limit: detail ? LOG_PAGE_SIZE : LOG_PREVIEW_LIMIT,
      });
      if (detail) {
        setDetailLogs(result.items);
        setLogTotal(result.total);
      } else {
        setPreviewLogs(result.items);
      }
    } catch {
      if (detail) {
        setDetailLogs([]);
        setLogTotal(0);
      } else {
        setPreviewLogs([]);
      }
      if (detail) {
        setLogTotal(0);
      }
    }
  }

  useEffect(() => {
    async function loadCfg() {
      setTestOk(false);
      if (!activeProjectId) return;
      try {
        const r = await api.getFtp(activeProjectId);
        setCfg(r);
        setMsg(null);
      } catch (e) {
        setCfg({ host: "", port: 21, username: "", password: "", passiveMode: true, remoteRoot: "/", ftpEncoding: "auto" });
        const m = e instanceof Error ? e.message : tx("加载 FTP 配置失败", "Failed to load FTP settings");
        if (m.includes("ftp setting not configured")) setMsg(tx("该项目尚未保存 FTP 配置", "FTP settings have not been saved for this project"));
      }
    }
    loadCfg();
  }, [activeProjectId]);

  useEffect(() => {
    void loadLogs();
  }, [activeProjectId]);

  async function test() {
    setBusy(true);
    setMsg(null);
    setTestOk(false);
    try {
      const r = await api.testFtp(cfg);
      setMsg(r.ok ? `连接成功，PWD=${r.pwd ?? ""}` : "连接失败");
      setTestOk(Boolean(r.ok));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : tx("连接失败", "Connection failed"));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!activeProjectId) {
      setMsg(tx("请先选择项目", "Please select a project first"));
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api.saveFtp(activeProjectId, cfg);
      setMsg(tx("已保存", "Saved"));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : tx("保存失败", "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function pickAndBindProject(path: string, fullPath: string) {
    if (bindLockRef.current) return;
    bindLockRef.current = true;
    if (!activeProjectId) {
      setMsg(tx("请先选择项目", "Please select a project first"));
      bindLockRef.current = false;
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const nextCfg = { ...cfg, remoteRoot: fullPath };
      setCfg(nextCfg);
      await api.saveFtp(activeProjectId, nextCfg);
      await api.updateProject(activeProjectId, { remotePath: fullPath });
      await refreshProjects();
      setMsg(isEn ? `Project directory linked: ${fullPath}` : `已关联项目目录：${fullPath}`);
      setPickOpen(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : tx("关联失败", "Binding failed"));
    } finally {
      setBusy(false);
      bindLockRef.current = false;
    }
  }

  async function openLogsDetail() {
    setLogsOpen(true);
    setLogPage(1);
    setLogsBusy(true);
    try {
      await loadLogs({ detail: true, page: 1 });
    } finally {
      setLogsBusy(false);
    }
  }

  async function queryLogs(page = 1) {
    setLogsBusy(true);
    setLogPage(page);
    try {
      await loadLogs({ detail: true, page });
    } finally {
      setLogsBusy(false);
    }
  }

  return (
    <div className="px-6 py-6">
      <div>
        <div className="text-base font-semibold text-zinc-900">{tx("连接与设置", "Settings")}</div>
        <div className="mt-1 text-sm text-zinc-600">{tx("配置 FTP 连接与查看最近操作日志", "Configure FTP connection and review recent activity logs")}</div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">{tx("FTP 连接", "FTP Connection")}</div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <div className="text-xs text-zinc-600">Host</div>
              <Input value={cfg.host} onChange={(e) => setCfg((s) => ({ ...s, host: e.target.value }))} placeholder="10.0.0.12" />
            </div>
            <div>
              <div className="text-xs text-zinc-600">Port</div>
              <Input value={String(cfg.port)} onChange={(e) => setCfg((s) => ({ ...s, port: Number(e.target.value || 21) }))} placeholder="21" />
            </div>
            <div>
              <div className="text-xs text-zinc-600">{tx("用户名", "Username")}</div>
              <Input value={cfg.username} onChange={(e) => setCfg((s) => ({ ...s, username: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-zinc-600">{tx("密码", "Password")}</div>
              <Input value={cfg.password} onChange={(e) => setCfg((s) => ({ ...s, password: e.target.value }))} type="password" />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" checked={cfg.passiveMode} onChange={(e) => setCfg((s) => ({ ...s, passiveMode: e.target.checked }))} />
                {tx("被动模式", "Passive Mode")}
              </label>
            </div>
            <div>
              <div className="text-xs text-zinc-600">remoteRoot</div>
              <Input value={cfg.remoteRoot} onChange={(e) => setCfg((s) => ({ ...s, remoteRoot: e.target.value }))} placeholder="/" />
            </div>
            <div>
              <div className="text-xs text-zinc-600">{tx("FTP 文件名编码", "FTP Filename Encoding")}</div>
              <select
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm"
                value={cfg.ftpEncoding}
                onChange={(e) => setCfg((s) => ({ ...s, ftpEncoding: e.target.value as FtpConfig["ftpEncoding"] }))}
              >
                <option value="auto">{tx("自动（推荐）", "Auto (Recommended)")}</option>
                <option value="utf-8">UTF-8</option>
                <option value="gbk">{tx("GBK（常见老内网 FTP）", "GBK (common for legacy intranet FTP)")}</option>
              </select>
              <div className="mt-1 text-xs text-zinc-500">{tx("中文目录出现 550/乱码时优先试试 GBK。", "If Chinese directories show 550 or garbled text, try GBK first.")}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button variant="secondary" onClick={test} disabled={busy || !cfg.host || !cfg.username}>
              {tx("测试连接", "Test Connection")}
            </Button>
            <Button variant="secondary" onClick={() => setPickOpen(true)} disabled={busy || !testOk || !cfg.host || !cfg.username || !cfg.password}>
              {tx("浏览目录并关联项目", "Browse Directories and Bind Project")}
            </Button>
            <Button onClick={save} disabled={busy || !activeProjectId || !cfg.host || !cfg.username || !cfg.password}>
              {tx("保存到当前项目", "Save to Current Project")}
            </Button>
          </div>

          <div className="mt-3 text-xs text-zinc-500">{tx("当前项目：", "Current Project: ")}{activeProject ? activeProject.name : tx("未选择", "Not Selected")}</div>
          {msg ? <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">{msg}</div> : null}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-zinc-900">{tx("最近日志", "Recent Logs")}</div>
            <Button variant="secondary" size="sm" onClick={() => void openLogsDetail()}>
              {tx("详情", "Details")}
            </Button>
          </div>
          <div className="mt-3 overflow-auto rounded-md border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-600">
                <tr>
                  <th className="px-3 py-2">{tx("时间", "Time")}</th>
                  <th className="px-3 py-2">{tx("操作者", "Operator")}</th>
                  <th className="px-3 py-2">{tx("动作", "Action")}</th>
                  <th className="px-3 py-2">{tx("结果", "Result")}</th>
                  <th className="px-3 py-2">{tx("明细", "Detail")}</th>
                </tr>
              </thead>
              <tbody>
                {previewLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border-t border-zinc-100 px-3 py-3 text-sm text-zinc-600">
                      {tx("暂无日志", "No logs")}
                    </td>
                  </tr>
                ) : (
                  previewLogs.map((l) => (
                    <tr key={l.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2 font-mono text-xs text-zinc-700">{l.createdAt}</td>
                      <td className="px-3 py-2 text-zinc-800">{l.actorUsername || "-"}</td>
                      <td className="px-3 py-2 text-zinc-800">{l.action}</td>
                      <td className="px-3 py-2">
                        <span className={l.result === "ok" ? "rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800" : "rounded bg-red-50 px-2 py-1 text-xs text-red-800"}>
                          {l.result}
                        </span>
                      </td>
                      <td className="max-w-[360px] px-3 py-2 text-xs text-zinc-600">{l.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-xs text-zinc-500">{tx('默认显示最近 10 条，点击“详情”可按条件分页筛选。', 'Shows the latest 10 entries by default. Click "Details" to filter and paginate.')}</div>
        </div>
      </div>

      <Modal
        open={logsOpen}
        title={tx("日志详情", "Log Details")}
        onClose={() => {
          if (!logsBusy) setLogsOpen(false);
        }}
        footer={
          <>
            <div className="mr-auto text-xs text-zinc-500">
              {tx(`共 ${logTotal} 条，第 ${logPage} / ${logTotalPages} 页`, `${logTotal} entries, page ${logPage} / ${logTotalPages}`)}
            </div>
            <Button variant="secondary" onClick={() => void queryLogs(Math.max(1, logPage - 1))} disabled={logsBusy || logPage <= 1}>
              {tx("上一页", "Previous")}
            </Button>
            <Button variant="secondary" onClick={() => void queryLogs(Math.min(logTotalPages, logPage + 1))} disabled={logsBusy || logPage >= logTotalPages}>
              {tx("下一页", "Next")}
            </Button>
            <Button variant="secondary" onClick={() => setLogsOpen(false)} disabled={logsBusy}>
              {tx("关闭", "Close")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <div className="text-xs text-zinc-600">{tx("开始时间", "Start Time")}</div>
              <Input type="datetime-local" value={logStartAt} onChange={(e) => setLogStartAt(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-zinc-600">{tx("结束时间", "End Time")}</div>
              <Input type="datetime-local" value={logEndAt} onChange={(e) => setLogEndAt(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-zinc-600">{tx("操作者", "Operator")}</div>
              <Input value={logActor} onChange={(e) => setLogActor(e.target.value)} placeholder={tx("支持模糊匹配", "Supports fuzzy match")} />
            </div>
            <div>
              <div className="text-xs text-zinc-600">{tx("动作", "Action")}</div>
              <select className="h-10 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm" value={logAction} onChange={(e) => setLogAction(e.target.value)}>
                <option value="">{tx("全部", "All")}</option>
                {actionOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-zinc-600">{tx("结果", "Result")}</div>
              <select className="h-10 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm" value={logResult} onChange={(e) => setLogResult(e.target.value)}>
                <option value="">{tx("全部", "All")}</option>
                <option value="ok">ok</option>
                <option value="error">error</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="secondary" onClick={() => void queryLogs(1)} disabled={logsBusy}>
                {tx("查询", "Search")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setLogActor("");
                  setLogAction("");
                  setLogResult("");
                  setLogStartAt("");
                  setLogEndAt("");
                  void queryLogs(1);
                }}
                disabled={logsBusy}
              >
                {tx("重置", "Reset")}
              </Button>
            </div>
          </div>

          <div className="overflow-auto rounded-md border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-600">
                <tr>
                  <th className="px-3 py-2">{tx("时间", "Time")}</th>
                  <th className="px-3 py-2">{tx("操作者", "Operator")}</th>
                  <th className="px-3 py-2">{tx("动作", "Action")}</th>
                  <th className="px-3 py-2">{tx("结果", "Result")}</th>
                  <th className="px-3 py-2">{tx("明细", "Detail")}</th>
                </tr>
              </thead>
              <tbody>
                {logsBusy ? (
                  <tr>
                    <td colSpan={5} className="border-t border-zinc-100 px-3 py-3 text-sm text-zinc-600">
                      {tx("加载中...", "Loading...")}
                    </td>
                  </tr>
                ) : detailLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border-t border-zinc-100 px-3 py-3 text-sm text-zinc-600">
                      {tx("暂无日志", "No logs")}
                    </td>
                  </tr>
                ) : (
                  detailLogs.map((l) => (
                    <tr key={l.id} className="border-t border-zinc-100 align-top">
                      <td className="px-3 py-2 font-mono text-xs text-zinc-700">{l.createdAt}</td>
                      <td className="px-3 py-2 text-zinc-800">{l.actorUsername || "-"}</td>
                      <td className="px-3 py-2 text-zinc-800">{l.action}</td>
                      <td className="px-3 py-2">
                        <span className={l.result === "ok" ? "rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800" : "rounded bg-red-50 px-2 py-1 text-xs text-red-800"}>
                          {l.result}
                        </span>
                      </td>
                      <td className="max-w-[520px] px-3 py-2 text-xs text-zinc-600">{l.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <FtpDirPickerModal
        open={pickOpen}
        busy={busy}
        cfg={cfg}
        onClose={() => setPickOpen(false)}
        onPick={pickAndBindProject}
      />
    </div>
  );
}

