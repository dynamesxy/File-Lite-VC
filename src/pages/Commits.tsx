import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCcw, Upload } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CommitModal } from "@/components/dashboard/CommitModal";
import { ScriptsTable } from "@/components/dashboard/ScriptsTable";
import { SyncModal } from "@/components/dashboard/SyncModal";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/store/appStore";
import { api, type PullPushResult, type Script } from "@/utils/api";

export default function CommitsPage() {
  const { tx, isEn } = useI18n();
  const { projects, activeProjectId, refreshProjects } = useAppStore();
  const activeProject = useMemo(() => projects.find((p) => p.id === activeProjectId) ?? null, [projects, activeProjectId]);
  const [connectionMode, setConnectionMode] = useState<"ftp" | "local">("ftp");

  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [syncOpen, setSyncOpen] = useState<null | "pull" | "push">(null);
  const [syncResult, setSyncResult] = useState<PullPushResult | null>(null);
  const [syncOverwrite, setSyncOverwrite] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncConflictSelections, setSyncConflictSelections] = useState<Record<string, ("local" | "remote")[]>>({});

  const [commitOpen, setCommitOpen] = useState(false);
  const [commitTargets, setCommitTargets] = useState<Script[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitBusy, setCommitBusy] = useState(false);
  const [selectedScriptIds, setSelectedScriptIds] = useState<Set<string>>(new Set());

  const [uploadGuardOpen, setUploadGuardOpen] = useState(false);
  const [uploadGuardMessage, setUploadGuardMessage] = useState("");

  function notifySuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 1800);
  }

  const loadScripts = useCallback(async () => {
    if (!activeProjectId) {
      setScripts([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listScripts(activeProjectId);
      setScripts(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("加载脚本失败", "Failed to load scripts"));
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  useEffect(() => {
    let cancelled = false;
    async function loadConnectionMode() {
      if (!activeProjectId) {
        setConnectionMode("ftp");
        return;
      }
      try {
        const cfg = await api.getFtp(activeProjectId);
        if (!cancelled) setConnectionMode(cfg.connectionMode);
      } catch {
        if (!cancelled) setConnectionMode("ftp");
      }
    }
    void loadConnectionMode();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  useEffect(() => {
    setSelectedScriptIds((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(scripts.filter((s) => s.hasUncommittedChanges).map((s) => s.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
      }
      return next;
    });
  }, [scripts]);

  useEffect(() => {
    setSelectedScriptIds(new Set());
  }, [activeProjectId]);

  async function openPullPreview() {
    if (!activeProjectId) return;
    setSyncOpen("pull");
    setSyncOverwrite(false);
    setSyncBusy(true);
    setSyncResult(null);
    try {
      const r = await api.pullPreview(activeProjectId);
      setSyncResult(r);
      setSyncConflictSelections(
        Object.fromEntries(
          r.files
            .filter((f) => f.conflictCount > 0)
            .map((f) => [f.relativePath, f.conflictLines.map((line) => line.selectedSide)])
        )
      );
    } catch (e) {
      setSyncResult({
        files: [
          {
            relativePath: "",
            status: "error",
            localExists: false,
            remoteExists: false,
            diffPreview: e instanceof Error ? e.message : tx("未知错误", "Unknown error"),
            conflictCount: 0,
            conflictLines: [],
          },
        ],
      });
    } finally {
      setSyncBusy(false);
    }
  }

  async function openPushPreview() {
    if (!activeProjectId) return;
    const uncommittedScripts = scripts.filter((item) => item.hasUncommittedChanges);
    if (uncommittedScripts.length > 0) {
      const names = uncommittedScripts.slice(0, 5).map((item) => item.relativePath).join("、");
      const moreText = uncommittedScripts.length > 5 ? (isEn ? ` and ${uncommittedScripts.length} files in total` : ` 等 ${uncommittedScripts.length} 个文件`) : "";
      setUploadGuardMessage(
        isEn
          ? `There are uncommitted scripts: ${names}${moreText}. Please commit versions before uploading.`
          : `存在未提交的脚本：${names}${moreText}。请先提交版本，再执行上传。`
      );
      setUploadGuardOpen(true);
      return;
    }
    setSyncOpen("push");
    setSyncOverwrite(false);
    setSyncBusy(true);
    setSyncResult(null);
    try {
      const r = await api.pushPreview(activeProjectId);
      setSyncResult(r);
      setSyncConflictSelections(
        Object.fromEntries(
          r.files
            .filter((f) => f.conflictCount > 0)
            .map((f) => [f.relativePath, f.conflictLines.map((line) => line.selectedSide)])
        )
      );
    } catch (e) {
      setSyncResult({
        files: [
          {
            relativePath: "",
            status: "error",
            localExists: false,
            remoteExists: false,
            diffPreview: e instanceof Error ? e.message : tx("未知错误", "Unknown error"),
            conflictCount: 0,
            conflictLines: [],
          },
        ],
      });
    } finally {
      setSyncBusy(false);
    }
  }

  async function applySync() {
    if (!activeProjectId || !syncOpen) return;
    const currentMode = syncOpen;
    setSyncBusy(true);
    try {
      const r =
        currentMode === "pull"
          ? await api.pullApply(activeProjectId, syncOverwrite, syncConflictSelections)
          : await api.pushApply(activeProjectId, syncOverwrite, syncConflictSelections);
      setSyncResult(r);
      await loadScripts();
      await refreshProjects();
      setSyncOpen(null);
      setSyncConflictSelections({});
      notifySuccess(
        currentMode === "pull"
          ? (connectionMode === "local" ? tx("本地目录拉取已完成", "Local directory pull completed") : tx("FTP 拉取已完成", "FTP pull completed"))
          : (connectionMode === "local" ? tx("本地目录上传已完成", "Local directory upload completed") : tx("FTP 上传已完成", "FTP upload completed"))
      );
    } catch (e) {
      setSyncResult({
        files: [
          {
            relativePath: "",
            status: "error",
            localExists: false,
            remoteExists: false,
            diffPreview: e instanceof Error ? e.message : tx("未知错误", "Unknown error"),
            conflictCount: 0,
            conflictLines: [],
          },
        ],
      });
    } finally {
      setSyncBusy(false);
    }
  }

  async function commitNow() {
    if (commitTargets.length === 0) return;
    setCommitBusy(true);
    try {
      const successPaths: string[] = [];
      const failedPaths: string[] = [];
      for (const target of commitTargets) {
        try {
          await api.commit(target.id, commitMessage.trim());
          successPaths.push(target.relativePath);
        } catch {
          failedPaths.push(target.relativePath);
        }
      }
      setCommitOpen(false);
      setCommitTargets([]);
      setCommitMessage("");
      setSelectedScriptIds(new Set());
      await loadScripts();
      if (successPaths.length > 0) {
        notifySuccess(
          successPaths.length === 1
            ? tx("版本已提交", "Version committed")
            : tx(`已提交 ${successPaths.length} 个文件`, `Committed ${successPaths.length} files`)
        );
      }
      if (failedPaths.length > 0) {
        setError(
          failedPaths.length === 1
            ? tx(`提交失败：${failedPaths[0]}`, `Commit failed: ${failedPaths[0]}`)
            : tx(`有 ${failedPaths.length} 个文件提交失败`, `${failedPaths.length} files failed to commit`)
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("提交失败", "Commit failed"));
    } finally {
      setCommitBusy(false);
    }
  }

  function openBatchCommit() {
    const targets = scripts.filter((s) => s.hasUncommittedChanges && selectedScriptIds.has(s.id));
    if (targets.length === 0) return;
    setCommitTargets(targets);
    setCommitMessage("");
    setCommitOpen(true);
  }

  return (
    <div className="px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold text-zinc-900">{tx("提交", "Commits")}</div>
          <div className="mt-1 text-sm text-zinc-600">{tx("同步状态、脚本清单与批量提交", "Sync status, scripts list, and batch commits")}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={loadScripts} disabled={!activeProjectId || loading}>
            <RefreshCcw className="h-4 w-4" />
            {tx("刷新", "Refresh")}
          </Button>
        </div>
      </div>

      {success ? <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
      {error ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">{tx("同步状态", "Sync Status")}</div>
          <div className="mt-2 text-sm text-zinc-600">
            <div>{connectionMode === "local" ? tx("目标目录：", "Target Directory: ") : tx("远端目录：", "Remote Path: ")}{activeProject ? activeProject.remotePath : "-"}</div>
            <div className="mt-1">{tx("本地工作区：", "Local Workspace: ")}{activeProject ? activeProject.localWorkspacePath : "-"}</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={openPullPreview} disabled={!activeProjectId}>
              <Download className="h-4 w-4" />
              {tx("拉取", "Pull")}
            </Button>
            <Button variant="secondary" onClick={openPushPreview} disabled={!activeProjectId}>
              <Upload className="h-4 w-4" />
              {tx("上传", "Upload")}
            </Button>
          </div>
          <div className="mt-3 text-xs text-zinc-500">
            {connectionMode === "local"
              ? tx('首次使用请先在“连接”里选择“本地目录”模式并关联目标目录。', 'For first-time use, choose "Local Directory" mode in "Connections" and bind a target directory.')
              : tx('首次使用请先在“连接”里配置 FTP。', 'For first-time use, configure FTP in "Connections" first.')}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-900">{tx("脚本清单", "Scripts")}</div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={openBatchCommit} disabled={selectedScriptIds.size === 0}>
                {tx(`批量提交（${selectedScriptIds.size}）`, `Batch Commit (${selectedScriptIds.size})`)}
              </Button>
            </div>
          </div>

          {!activeProjectId ? (
            <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">{tx("请先选择项目", "Please select a project")}</div>
          ) : loading ? (
            <div className="mt-3 animate-pulse rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">{tx("加载中...", "Loading...")}</div>
          ) : scripts.length === 0 ? (
            <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">
              {activeProject?.scriptExtensions?.length
                ? (isEn ? `No ${activeProject.scriptExtensions.join(", ")} files were found in the workspace` : `工作区中未找到 ${activeProject.scriptExtensions.join("、")} 文件`)
                : tx("工作区中未找到脚本文件", "No script files were found in the workspace")}
            </div>
          ) : (
            <div className="mt-3">
              <ScriptsTable
                scripts={scripts}
                selectedScriptIds={selectedScriptIds}
                onToggleSelect={(scriptId) => {
                  setSelectedScriptIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(scriptId)) next.delete(scriptId);
                    else next.add(scriptId);
                    return next;
                  });
                }}
                onToggleSelectAll={() => {
                  const committable = scripts.filter((s) => s.hasUncommittedChanges);
                  setSelectedScriptIds((prev) => {
                    const allSelected = committable.length > 0 && committable.every((s) => prev.has(s.id));
                    if (allSelected) return new Set();
                    return new Set(committable.map((s) => s.id));
                  });
                }}
                onCommit={(s) => {
                  setCommitTargets([s]);
                  setCommitMessage("");
                  setCommitOpen(true);
                }}
              />
            </div>
          )}
        </div>
      </div>

      <CommitModal
        open={commitOpen}
        busy={commitBusy}
        targets={commitTargets}
        message={commitMessage}
        onClose={() => {
          setCommitOpen(false);
          setCommitTargets([]);
        }}
        onChangeMessage={setCommitMessage}
        onCommit={commitNow}
      />

      <SyncModal
        open={syncOpen !== null}
        mode={syncOpen ?? "pull"}
        connectionMode={connectionMode}
        busy={syncBusy}
        overwrite={syncOverwrite}
        result={syncResult}
        conflictSelections={syncConflictSelections}
        onClose={() => {
          setSyncOpen(null);
          setSyncResult(null);
          setSyncConflictSelections({});
        }}
        onToggleOverwrite={setSyncOverwrite}
        onChangeConflictSelection={(relativePath, lineIndex, side) => {
          setSyncConflictSelections((prev) => {
            const next = { ...prev };
            const fileSelections = [...(next[relativePath] ?? [])];
            fileSelections[lineIndex] = side;
            next[relativePath] = fileSelections;
            return next;
          });
        }}
        onApply={applySync}
      />

      <Modal
        open={uploadGuardOpen}
        title={tx("无法上传", "Upload Blocked")}
        onClose={() => setUploadGuardOpen(false)}
        footer={
          <Button variant="secondary" onClick={() => setUploadGuardOpen(false)}>
            {tx("我知道了", "OK")}
          </Button>
        }
      >
        <div className="text-sm text-zinc-700">{uploadGuardMessage}</div>
      </Modal>
    </div>
  );
}

