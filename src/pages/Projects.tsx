import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ProjectCreateModal } from "@/components/dashboard/ProjectCreateModal";
import { ProjectEditModal } from "@/components/dashboard/ProjectEditModal";
import { ProjectsTable } from "@/components/dashboard/ProjectsTable";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/store/appStore";
import { api, type Project } from "@/utils/api";

export default function ProjectsPage() {
  const { tx, isEn } = useI18n();
  const { projects, activeProjectId, refreshProjects, setActiveProjectId } = useAppStore();
  const activeProject = useMemo(() => projects.find((p) => p.id === activeProjectId) ?? null, [projects, activeProjectId]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pLocal, setPLocal] = useState("");
  const [pRemote, setPRemote] = useState("");
  const [pConnMode, setPConnMode] = useState<"ftp" | "local">("local");
  const [pFtpProfileId, setPFtpProfileId] = useState<string | null>(null);
  const [pExts, setPExts] = useState<string[]>([".sql"]);
  const [createBusy, setCreateBusy] = useState(false);
  const createLockRef = useRef(false);

  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocal, setEditLocal] = useState("");
  const [editRemote, setEditRemote] = useState("");
  const [editExts, setEditExts] = useState<string[]>([".sql"]);
  const [editBusy, setEditBusy] = useState(false);
  const editLockRef = useRef(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState(tx("确认操作", "Confirm Action"));
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const confirmActionRef = useRef<null | (() => Promise<void>)>(null);

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

  async function createProject(): Promise<void> {
    if (createLockRef.current) return;
    createLockRef.current = true;
    setCreateBusy(true);
    let createdId: string | null = null;
    try {
      setError(null);
      const created = await api.createProject({
        name: pName.trim(),
        localWorkspacePath: pLocal.trim(),
        remotePath: pConnMode === "ftp" ? pRemote.trim() : pRemote.trim(),
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
      setPLocal("");
      setPRemote("");
      setPConnMode("local");
      setPFtpProfileId(null);
      setPExts([".sql"]);
      await refreshProjects();
      setActiveProjectId(created.id);
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
    setEditLocal(p.localWorkspacePath);
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
        localWorkspacePath: editLocal.trim(),
        remotePath: editRemote.trim(),
        scriptExtensions: editExts,
      });
      setEditOpen(false);
      setEditProject(null);
      await refreshProjects();
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

  return (
    <div className="px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold text-zinc-900">{tx("项目", "Projects")}</div>
          <div className="mt-1 text-sm text-zinc-600">{tx("项目创建、列表展示与编辑", "Create, list, and edit projects")}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={refreshProjects}>
            <RefreshCcw className="h-4 w-4" />
            {tx("刷新", "Refresh")}
          </Button>
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

      {success ? <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
      {error ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-900">{tx("项目列表", "Project List")}</div>
          <div className="text-xs text-zinc-500">
            {tx("当前项目：", "Current project: ")}
            {activeProject ? activeProject.name : tx("未选择", "Not selected")}
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
              onSetActive={(projectId) => setActiveProjectId(projectId)}
              onEdit={openEditProject}
              onDelete={deleteProject}
            />
          </div>
        )}
      </div>

      <ProjectCreateModal
        open={createOpen}
        busy={createBusy}
        name={pName}
        localPath={pLocal}
        remotePath={pRemote}
        connectionMode={pConnMode}
        ftpProfileId={pFtpProfileId}
        scriptExtensions={pExts}
        onClose={() => setCreateOpen(false)}
        onCreate={createProject}
        onChange={(patch) => {
          if (patch.name !== undefined) setPName(patch.name);
          if (patch.localPath !== undefined) setPLocal(patch.localPath);
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
        localPath={editLocal}
        remotePath={editRemote}
        scriptExtensions={editExts}
        onClose={() => {
          if (!editBusy) setEditOpen(false);
        }}
        onSave={saveEditProject}
        onChange={(patch) => {
          if (patch.name !== undefined) setEditName(patch.name);
          if (patch.localPath !== undefined) setEditLocal(patch.localPath);
          if (patch.remotePath !== undefined) setEditRemote(patch.remotePath);
          if (patch.scriptExtensions !== undefined) setEditExts(patch.scriptExtensions);
        }}
      />

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
