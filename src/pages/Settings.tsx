import { useCallback, useEffect, useMemo, useState } from "react";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";
import { api, type AuditLog } from "@/utils/api";

export default function SettingsPage() {
  const { tx } = useI18n();
  const nav = useNavigate();
  const { activeProjectId } = useAppStore();
  const { user, logout } = useAuthStore();
  const [logoutBusy, setLogoutBusy] = useState(false);

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

  const loadPreviewLogs = useCallback(async () => {
    try {
      const result = await api.logs({
        projectId: activeProjectId ?? undefined,
        offset: 0,
        limit: LOG_PREVIEW_LIMIT,
      });
      setPreviewLogs(result.items);
    } catch {
      setPreviewLogs([]);
    }
  }, [activeProjectId]);

  useEffect(() => {
    void loadPreviewLogs();
  }, [loadPreviewLogs]);

  const loadDetailLogs = useCallback(
    async (page: number) => {
      try {
        const result = await api.logs({
          projectId: activeProjectId ?? undefined,
          actorUsername: logActor.trim() || undefined,
          action: logAction || undefined,
          result: logResult || undefined,
          startAt: toApiDateTime(logStartAt, false),
          endAt: toApiDateTime(logEndAt, true),
          offset: (page - 1) * LOG_PAGE_SIZE,
          limit: LOG_PAGE_SIZE,
        });
        setDetailLogs(result.items);
        setLogTotal(result.total);
      } catch {
        setDetailLogs([]);
        setLogTotal(0);
      }
    },
    [activeProjectId, logAction, logActor, logEndAt, logResult, logStartAt]
  );

  async function openLogsDetail() {
    setLogsOpen(true);
    setLogPage(1);
    setLogsBusy(true);
    try {
      await loadDetailLogs(1);
    } finally {
      setLogsBusy(false);
    }
  }

  async function queryLogs(page = 1) {
    setLogsBusy(true);
    setLogPage(page);
    try {
      await loadDetailLogs(page);
    } finally {
      setLogsBusy(false);
    }
  }

  async function handleLogout() {
    setLogoutBusy(true);
    try {
      await logout();
      nav("/login", { replace: true });
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <div className="px-6 py-6">
      <div>
        <div className="text-base font-semibold text-zinc-900">{tx("设置", "Settings")}</div>
        <div className="mt-1 text-sm text-zinc-600">{tx("外观与语言配置、账号信息与日志", "Appearance/language, account, and logs")}</div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">{tx("外观与语言", "Appearance & Language")}</div>
          <div className="mt-4 flex items-stretch">
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <div className="text-xs text-zinc-500">{tx("主题", "Theme")}</div>
              <ThemeToggle />
            </div>
            <div className="mx-4 w-px self-stretch bg-zinc-200" />
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <div className="text-xs text-zinc-500">{tx("语言", "Language")}</div>
              <LanguageToggle />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">{tx("账号", "Account")}</div>
          <div className="mt-3 text-sm text-zinc-700">
            {tx("当前账号：", "Current user: ")}
            <span className="ml-1 font-medium text-zinc-900">{user?.username ?? "-"}</span>
          </div>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => void handleLogout()} disabled={logoutBusy}>
              <LogOut className="h-4 w-4" />
              {logoutBusy ? tx("退出中...", "Signing out...") : tx("退出登录", "Sign Out")}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
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
                    <td className="max-w-[520px] px-3 py-2 text-xs text-zinc-600">{l.detail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-zinc-500">{tx('默认显示最近 10 条，可按“当前项目”过滤；点击“详情”可分页筛选。', 'Shows the latest 10 entries by default; filtered by current project. Click "Details" to filter and paginate.')}</div>
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
    </div>
  );
}

