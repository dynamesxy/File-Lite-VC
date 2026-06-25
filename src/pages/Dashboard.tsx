import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw, Upload, Download, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CommitModal } from "@/components/dashboard/CommitModal";
import { ProjectCreateModal } from "@/components/dashboard/ProjectCreateModal";
import { ProjectEditModal } from "@/components/dashboard/ProjectEditModal";
import { ProjectsTable } from "@/components/dashboard/ProjectsTable";
import { ScriptsTable } from "@/components/dashboard/ScriptsTable";
import { SyncModal } from "@/components/dashboard/SyncModal";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/store/appStore";
import { api, type Project, type PullPushResult, type Script } from "@/utils/api";

export default function Dashboard() {
  const { tx, isEn } = useI18n();
  const { projects, activeProjectId, refreshProjects, setActiveProjectId } = useAppStore();
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

  const [createOpen, setCreateOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pLocals, setPLocals] = useState<string[]>([]);
  const [pRemote, setPRemote] = useState("");
  const [pConnMode, setPConnMode] = useState<"ftp" | "local">("local");
  const [pFtpProfileId, setPFtpProfileId] = useState<string | null>(null);
  const [pExts, setPExts] = useState<string[]>([".sql", ".py", ".xml", ".txt"]);
  const [createBusy, setCreateBusy] = useState(false);
  const createLockRef = useRef(false);

  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocals, setEditLocals] = useState<string[]>([]);
  const [editRemote, setEditRemote] = useState("");
  const [editExts, setEditExts] = useState<string[]>([".sql", ".py", ".xml", ".txt"]);
  const [editBusy, setEditBusy] = useState(false);
  const editLockRef = useRef(false);

  const [commitOpen, setCommitOpen] = useState(false);
  const [commitTargets, setCommitTargets] = useState<Script[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitBusy, setCommitBusy] = useState(false);
  const [selectedScriptIds, setSelectedScriptIds] = useState<Set<string>>(new Set());
  const [uploadGuardOpen, setUploadGuardOpen] = useState(false);
  const [uploadGuardMessage, setUploadGuardMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState(tx("确认操作", "Confirm Action"));
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const confirmActionRef = useRef<null | (() => Promise<void>)>(null);

  function notifySuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 1800);
  }

  function openConfirm(options: { title: string; message: string; onConfirm: () => Promise<void> }) {
    setConfirmTitle(options.title);
    setConfirmMessage(options.message);
    confirmActionRef.current = options.onConfirm;
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    if (!confirmActionRef.current || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await confirmActionRef.current();
      setConfirmOpen(false);
      confirmActionRef.current = null;
    } finally {
      setConfirmBusy(false);
    }
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
      setError(e instanceof Error ? e.message : "加载脚本失败");
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
    setSelectedProjectIds((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(projects.map((p) => p.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
      }
      return next;
    });
  }, [projects]);

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
      setSyncResult({ files: [{ relativePath: "", status: "error", localExists: false, remoteExists: false, diffPreview: e instanceof Error ? e.message : tx("未知错误", "Unknown error"), conflictCount: 0, conflictLines: [] }] });
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
      setUploadGuardMessage(isEn ? `There are uncommitted scripts: ${names}${moreText}. Please commit versions before uploading.` : `存在未提交的脚本：${names}${moreText}。请先提交版本，再执行上传。`);
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
      setSyncResult({ files: [{ relativePath: "", status: "error", localExists: false, remoteExists: false, diffPreview: e instanceof Error ? e.message : tx("未知错误", "Unknown error"), conflictCount: 0, conflictLines: [] }] });
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
      setSyncResult({ files: [{ relativePath: "", status: "error", localExists: false, remoteExists: false, diffPreview: e instanceof Error ? e.message : tx("未知错误", "Unknown error"), conflictCount: 0, conflictLines: [] }] });
    } finally {
      setSyncBusy(false);
    }
  }

  async function createProject(): Promise<void> {
    if (createLockRef.current) return;
    createLockRef.current = true;
    setCreateBusy(true);
    let createdId: string | null = null;
    try {
      setError(null);
      const created = await api.createProject({
        name: pName.trim(),
        localWorkspacePaths: pLocals.map((x) => x.trim()).filter(Boolean),
        remotePath: pRemote.trim(),
        scriptExtensions: pExts,
      });
      createdId = created.id;
      if (pConnMode === "local") {
        await api.saveFtp(created.id, {
          connectionMode: "local",
          ftpProfileId: null,
          host: "",
          port: 21,
          username: "",
          password: "",
          passiveMode: true,
          remoteRoot: "/",
          ftpEncoding: "auto",
        });
      } else {
        if (!pFtpProfileId) throw new Error(tx("请选择一个 FTP 连接", "Please select a FTP profile"));
        const prof = await api.getFtpProfile(pFtpProfileId);
        await api.saveFtp(created.id, {
          connectionMode: "ftp",
          ftpProfileId: pFtpProfileId,
          host: prof.host,
          port: prof.port,
          username: prof.username,
          password: prof.password,
          passiveMode: prof.passiveMode,
          remoteRoot: prof.remoteRoot,
          ftpEncoding: prof.ftpEncoding,
        });
      }
      setCreateOpen(false);
      setPName("");
      setPLocals([]);
      setPRemote("");
      setPConnMode("local");
      setPFtpProfileId(null);
      setPExts([".sql", ".py", ".xml", ".txt"]);
      await refreshProjects();
      setActiveProjectId(created.id);
      await loadScripts();
      notifySuccess(tx("项目已创建", "Project created"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : tx("创建项目失败", "Failed to create project");
      setError(msg);
      if (createdId) {
        try {
          await api.deleteProject(createdId);
        } catch {
          void 0;
        }
      }
      throw new Error(msg);
    } finally {
      setCreateBusy(false);
      createLockRef.current = false;
    }
  }

  async function deleteProject(projectId: string) {
    openConfirm({
      title: tx("确认删除项目", "Confirm Project Deletion"),
      message: tx("确认删除该项目？不会删除本地文件，但会删除本工具内的元数据。", "Delete this project? Local files will remain, but metadata stored by this tool will be removed."),
      onConfirm: async () => {
        try {
          await api.deleteProject(projectId);
          await refreshProjects();
          setSelectedProjectIds((prev) => {
            const next = new Set(prev);
            next.delete(projectId);
            return next;
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : tx("删除失败", "Delete failed"));
        }
      },
    });
  }

  async function deleteSelectedProjects() {
    const ids = Array.from(selectedProjectIds);
    if (ids.length === 0) return;
    openConfirm({
      title: tx("确认批量删除", "Confirm Batch Deletion"),
      message: isEn ? `Delete ${ids.length} projects? Local files will remain, but metadata stored by this tool will be removed.` : `确认批量删除 ${ids.length} 个项目？不会删除本地文件，但会删除本工具内的元数据。`,
      onConfirm: async () => {
        try {
          await api.batchDeleteProjects(ids);
          setSelectedProjectIds(new Set());
          await refreshProjects();
        } catch (e) {
          setError(e instanceof Error ? e.message : tx("批量删除失败", "Batch delete failed"));
        }
      },
    });
  }

  function openEditProject(projectId: string) {
    const p = projects.find((x) => x.id === projectId) ?? null;
    if (!p) return;
    setEditProject(p);
    setEditName(p.name);
    setEditLocals(p.localWorkspacePaths && p.localWorkspacePaths.length > 0 ? p.localWorkspacePaths : [p.localWorkspacePath]);
    setEditRemote(p.remotePath);
    setEditExts(p.scriptExtensions && p.scriptExtensions.length > 0 ? p.scriptExtensions : [".sql"]);
    setEditOpen(true);
  }

  async function saveEditProject(): Promise<void> {
    if (editLockRef.current) return;
    editLockRef.current = true;
    if (!editProject) {
      editLockRef.current = false;
      return;
    }
    setEditBusy(true);
    try {
      setError(null);
      await api.updateProject(editProject.id, {
        name: editName.trim(),
        localWorkspacePaths: editLocals.map((x) => x.trim()).filter(Boolean),
        remotePath: editRemote.trim(),
        scriptExtensions: editExts,
      });
      setEditOpen(false);
      setEditProject(null);
      await refreshProjects();
      await loadScripts();
      notifySuccess(tx("项目已保存", "Project saved"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : tx("保存失败", "Save failed");
      setError(msg);
      throw new Error(msg);
    } finally {
      setEditBusy(false);
      editLockRef.current = false;
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
          <div className="text-base font-semibold text-zinc-900">{tx("项目工作台", "Project Dashboard")}</div>
          <div className="mt-1 text-sm text-zinc-600">{tx("拉取/上传、版本提交与差异预览", "Pull/push, version commits, and diff preview")}</div>
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

      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-900">{tx("项目列表", "Projects")}</div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {tx("新建", "Create")}
            </Button>
            <Button variant="secondary" onClick={deleteSelectedProjects} disabled={selectedProjectIds.size === 0}>
              <Trash2 className="h-4 w-4" />
              {tx("批量删除", "Batch Delete")}
            </Button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">{tx("暂无项目，请先新建", "No projects yet. Please create one first.")}</div>
        ) : (
          <div className="mt-3">
            <ProjectsTable
              projects={projects}
              activeProjectId={activeProjectId}
              selectedProjectIds={selectedProjectIds}
              onToggleSelect={(projectId) => {
                setSelectedProjectIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(projectId)) next.delete(projectId);
                  else next.add(projectId);
                  return next;
                });
              }}
              onToggleSelectAll={() => {
                setSelectedProjectIds((prev) => {
                  const allSelected = projects.length > 0 && projects.every((p) => prev.has(p.id));
                  if (allSelected) return new Set();
                  return new Set(projects.map((p) => p.id));
                });
              }}
              onSetActive={(projectId) => {
                setActiveProjectId(projectId);
              }}
              onEdit={openEditProject}
              onDelete={deleteProject}
            />
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
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
              ? tx('首次使用请先在“连接与设置”里选择“本地目录”模式并关联目标目录。', 'For first-time use, choose "Local Directory" mode in "Settings" and bind a target directory.')
              : tx('首次使用请先在“连接与设置”配置 FTP。', 'For first-time use, configure FTP in "Settings" first.')}
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
            <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">{tx("请选择或新建项目", "Please select or create a project")}</div>
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

      <ProjectCreateModal
        open={createOpen}
        busy={createBusy}
        name={pName}
        localPaths={pLocals}
        remotePath={pRemote}
        connectionMode={pConnMode}
        ftpProfileId={pFtpProfileId}
        scriptExtensions={pExts}
        onClose={() => setCreateOpen(false)}
        onCreate={createProject}
        onChange={(patch) => {
          if (patch.name !== undefined) setPName(patch.name);
          if (patch.localPaths !== undefined) setPLocals(patch.localPaths);
          if (patch.remotePath !== undefined) setPRemote(patch.remotePath);
          if (patch.connectionMode !== undefined) setPConnMode(patch.connectionMode);
          if (patch.ftpProfileId !== undefined) setPFtpProfileId(patch.ftpProfileId);
          if (patch.scriptExtensions !== undefined) setPExts(patch.scriptExtensions);
        }}
      />

      <ProjectEditModal
        open={editOpen}
        busy={editBusy}
        project={editProject}
        name={editName}
        localPaths={editLocals}
        remotePath={editRemote}
        scriptExtensions={editExts}
        onClose={() => {
          if (!editBusy) setEditOpen(false);
        }}
        onSave={saveEditProject}
        onChange={(patch) => {
          if (patch.name !== undefined) setEditName(patch.name);
          if (patch.localPaths !== undefined) setEditLocals(patch.localPaths);
          if (patch.remotePath !== undefined) setEditRemote(patch.remotePath);
          if (patch.scriptExtensions !== undefined) setEditExts(patch.scriptExtensions);
        }}
      />

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

      <Modal
        open={confirmOpen}
        title={confirmTitle}
        onClose={() => {
          if (!confirmBusy) setConfirmOpen(false);
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={confirmBusy}>
              {tx("取消", "Cancel")}
            </Button>
            <Button onClick={() => void handleConfirm()} disabled={confirmBusy}>
              {confirmBusy ? tx("处理中...", "Processing...") : tx("确认", "Confirm")}
            </Button>
          </>
        }
      >
        <div className="text-sm text-zinc-700">{confirmMessage}</div>
      </Modal>
    </div>
  );
}

