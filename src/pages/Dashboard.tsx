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

  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [syncOpen, setSyncOpen] = useState<null | "pull" | "push">(null);
  const [syncResult, setSyncResult] = useState<PullPushResult | null>(null);
  const [syncOverwrite, setSyncOverwrite] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pLocal, setPLocal] = useState("");
  const [pRemote, setPRemote] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const createLockRef = useRef(false);

  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocal, setEditLocal] = useState("");
  const [editRemote, setEditRemote] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const editLockRef = useRef(false);

  const [commitOpen, setCommitOpen] = useState(false);
  const [commitTarget, setCommitTarget] = useState<Script | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitBusy, setCommitBusy] = useState(false);
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

  async function openPullPreview() {
    if (!activeProjectId) return;
    setSyncOpen("pull");
    setSyncOverwrite(false);
    setSyncBusy(true);
    setSyncResult(null);
    try {
      const r = await api.pullPreview(activeProjectId);
      setSyncResult(r);
    } catch (e) {
      setSyncResult({ files: [{ relativePath: "", status: "error", localExists: false, remoteExists: false, diffPreview: e instanceof Error ? e.message : tx("未知错误", "Unknown error") }] });
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
    } catch (e) {
      setSyncResult({ files: [{ relativePath: "", status: "error", localExists: false, remoteExists: false, diffPreview: e instanceof Error ? e.message : tx("未知错误", "Unknown error") }] });
    } finally {
      setSyncBusy(false);
    }
  }

  async function applySync() {
    if (!activeProjectId || !syncOpen) return;
    const currentMode = syncOpen;
    setSyncBusy(true);
    try {
      const r = currentMode === "pull" ? await api.pullApply(activeProjectId, syncOverwrite) : await api.pushApply(activeProjectId, syncOverwrite);
      setSyncResult(r);
      await loadScripts();
      await refreshProjects();
      setSyncOpen(null);
      notifySuccess(currentMode === "pull" ? tx("FTP 拉取已完成", "FTP pull completed") : tx("FTP 上传已完成", "FTP upload completed"));
    } catch (e) {
      setSyncResult({ files: [{ relativePath: "", status: "error", localExists: false, remoteExists: false, diffPreview: e instanceof Error ? e.message : tx("未知错误", "Unknown error") }] });
    } finally {
      setSyncBusy(false);
    }
  }

  async function createProject(): Promise<void> {
    if (createLockRef.current) return;
    createLockRef.current = true;
    setCreateBusy(true);
    try {
      setError(null);
      const created = await api.createProject({ name: pName.trim(), localWorkspacePath: pLocal.trim(), remotePath: pRemote.trim() });
      setCreateOpen(false);
      setPName("");
      setPLocal("");
      setPRemote("");
      await refreshProjects();
      setActiveProjectId(created.id);
      await loadScripts();
      notifySuccess(tx("项目已创建", "Project created"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : tx("创建项目失败", "Failed to create project");
      setError(msg);
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
    setEditLocal(p.localWorkspacePath);
    setEditRemote(p.remotePath);
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
        localWorkspacePath: editLocal.trim(),
        remotePath: editRemote.trim(),
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
    if (!commitTarget) return;
    setCommitBusy(true);
    try {
      await api.commit(commitTarget.id, commitMessage.trim());
      setCommitOpen(false);
      setCommitTarget(null);
      setCommitMessage("");
      await loadScripts();
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("提交失败", "Commit failed"));
    } finally {
      setCommitBusy(false);
    }
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
            <div>{tx("远端目录：", "Remote Path: ")}{activeProject ? activeProject.remotePath : "-"}</div>
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
          <div className="mt-3 text-xs text-zinc-500">{tx('首次使用请先在“连接与设置”配置 FTP。', 'For first-time use, configure FTP in "Settings" first.')}</div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-900">{tx("脚本清单", "Scripts")}</div>
          </div>

          {!activeProjectId ? (
            <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">{tx("请选择或新建项目", "Please select or create a project")}</div>
          ) : loading ? (
            <div className="mt-3 animate-pulse rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">{tx("加载中...", "Loading...")}</div>
          ) : scripts.length === 0 ? (
            <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">{tx("工作区中未找到 .sql 文件", "No .sql files were found in the workspace")}</div>
          ) : (
            <div className="mt-3">
              <ScriptsTable
                scripts={scripts}
                onCommit={(s) => {
                  setCommitTarget(s);
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
        localPath={pLocal}
        remotePath={pRemote}
        onClose={() => setCreateOpen(false)}
        onCreate={createProject}
        onChange={(patch) => {
          if (patch.name !== undefined) setPName(patch.name);
          if (patch.localPath !== undefined) setPLocal(patch.localPath);
          if (patch.remotePath !== undefined) setPRemote(patch.remotePath);
        }}
      />

      <ProjectEditModal
        open={editOpen}
        busy={editBusy}
        project={editProject}
        name={editName}
        localPath={editLocal}
        remotePath={editRemote}
        onClose={() => {
          if (!editBusy) setEditOpen(false);
        }}
        onSave={saveEditProject}
        onChange={(patch) => {
          if (patch.name !== undefined) setEditName(patch.name);
          if (patch.localPath !== undefined) setEditLocal(patch.localPath);
          if (patch.remotePath !== undefined) setEditRemote(patch.remotePath);
        }}
      />

      <CommitModal
        open={commitOpen}
        busy={commitBusy}
        target={commitTarget}
        message={commitMessage}
        onClose={() => setCommitOpen(false)}
        onChangeMessage={setCommitMessage}
        onCommit={commitNow}
      />

      <SyncModal
        open={syncOpen !== null}
        mode={syncOpen ?? "pull"}
        busy={syncBusy}
        overwrite={syncOverwrite}
        result={syncResult}
        onClose={() => {
          setSyncOpen(null);
          setSyncResult(null);
        }}
        onToggleOverwrite={setSyncOverwrite}
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

