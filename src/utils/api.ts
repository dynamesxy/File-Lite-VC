export type Project = {
  id: string;
  name: string;
  localWorkspacePath: string;
  remotePath: string;
  createdAt: string;
};

export type Script = {
  id: string;
  projectId: string;
  relativePath: string;
  fileName: string;
  latestVersionNo: string | null;
  latestVersionId: string | null;
  hasUncommittedChanges: boolean;
};

export type Version = {
  id: string;
  scriptId: string;
  versionNo: string;
  message: string;
  createdAt: string;
};

export type User = {
  id: string;
  username: string;
  createdAt: string;
};

export type FtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  passiveMode: boolean;
  remoteRoot: string;
  ftpEncoding: "auto" | "utf-8" | "gbk";
};

export type FtpDir = { name: string; path: string };
export type FtpBrowseResult = { path: string; dirs: FtpDir[] };

export type PickDirectoryResult = { path: string };

export type PullPushFile = {
  relativePath: string;
  status: string;
  localExists: boolean;
  remoteExists: boolean;
  diffPreview: string | null;
};

export type PullPushResult = {
  files: PullPushFile[];
};

export type RollbackResult = {
  ok: boolean;
  targetVersionId: string;
  targetVersionNo: string;
  publishedRemotePath: string;
  workspacePath: string;
  createdVersionId: string | null;
  createdVersionNo: string | null;
  message: string;
};

export type AuditLog = {
  id: string;
  projectId: string | null;
  actorUserId: string | null;
  actorUsername: string | null;
  action: string;
  result: string;
  detail: string;
  createdAt: string;
};

export type AuditLogListResult = {
  items: AuditLog[];
  total: number;
  offset: number;
  limit: number;
};

export type DiffRow = {
  kind: "ctx" | "add" | "del" | "chg";
  leftNo: number | null;
  rightNo: number | null;
  leftText: string;
  rightText: string;
};

export type DiffResult = {
  addedLines: number;
  removedLines: number;
  rows: DiffRow[];
  left: Record<string, unknown>;
  right: Record<string, unknown>;
};

type ApiErrorPayload = { detail?: string };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let payload: ApiErrorPayload | null = null;
    try {
      payload = (await res.json()) as ApiErrorPayload;
    } catch {
      payload = null;
    }
    const msg = payload?.detail || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => apiFetch<{ ok: boolean }>("/api/health"),

  register: (body: { username: string; password: string }) =>
    apiFetch<User>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { username: string; password: string }) =>
    apiFetch<User>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => apiFetch<User>("/api/auth/me"),
  logout: () => apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  listProjects: () => apiFetch<Project[]>("/api/projects"),
  createProject: (body: { name: string; localWorkspacePath: string; remotePath: string }) =>
    apiFetch<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  updateProject: (
    projectId: string,
    body: Partial<{ name: string; localWorkspacePath: string; remotePath: string }>
  ) => apiFetch<Project>(`/api/projects/${projectId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProject: (projectId: string) => apiFetch<{ ok: boolean }>(`/api/projects/${projectId}`, { method: "DELETE" }),
  batchDeleteProjects: (projectIds: string[]) =>
    apiFetch<{ ok: boolean }>(`/api/projects/batch-delete`, { method: "POST", body: JSON.stringify({ projectIds }) }),

  getFtp: (projectId: string) => apiFetch<FtpConfig>(`/api/projects/${projectId}/ftp`),
  saveFtp: (projectId: string, cfg: FtpConfig) =>
    apiFetch<{ host: string; port: number; username: string; passiveMode: boolean; remoteRoot: string; ftpEncoding: string }>(
      `/api/projects/${projectId}/ftp`,
      { method: "PUT", body: JSON.stringify(cfg) }
    ),
  testFtp: (cfg: FtpConfig) => apiFetch<{ ok: boolean; pwd?: string; features?: string[] }>("/api/ftp/test", { method: "POST", body: JSON.stringify(cfg) }),
  browseFtp: (cfg: FtpConfig, path: string) =>
    apiFetch<FtpBrowseResult>(`/api/ftp/browse?path=${encodeURIComponent(path)}`, { method: "POST", body: JSON.stringify(cfg) }),

  pickDirectory: (initial?: string) =>
    apiFetch<PickDirectoryResult>(`/api/fs/pick-directory${initial ? `?initial=${encodeURIComponent(initial)}` : ""}`, { method: "POST" }),

  listScripts: (projectId: string) => apiFetch<Script[]>(`/api/projects/${projectId}/scripts`),
  listVersions: (scriptId: string) => apiFetch<Version[]>(`/api/scripts/${scriptId}/versions`),
  commit: (scriptId: string, message: string) =>
    apiFetch<Version>(`/api/scripts/${scriptId}/commit`, { method: "POST", body: JSON.stringify({ message }) }),
  versionContent: (versionId: string) =>
    apiFetch<{ id: string; scriptId: string; projectId: string; versionNo: string; message: string; createdAt: string; content: string }>(
      `/api/versions/${versionId}/content`
    ),
  rollbackToFtp: (versionId: string, message?: string) =>
    apiFetch<RollbackResult>(`/api/versions/${versionId}/rollback-to-ftp`, {
      method: "POST",
      body: JSON.stringify({ message: message?.trim() || null }),
    }),

  pullPreview: (projectId: string) => apiFetch<PullPushResult>(`/api/projects/${projectId}/pull`, { method: "POST", body: JSON.stringify({ dryRun: true }) }),
  pullApply: (projectId: string, overwrite: boolean) =>
    apiFetch<PullPushResult>(`/api/projects/${projectId}/pull`, { method: "POST", body: JSON.stringify({ dryRun: false, overwrite }) }),
  pushPreview: (projectId: string) => apiFetch<PullPushResult>(`/api/projects/${projectId}/push`, { method: "POST", body: JSON.stringify({ dryRun: true }) }),
  pushApply: (projectId: string, overwrite: boolean) =>
    apiFetch<PullPushResult>(`/api/projects/${projectId}/push`, { method: "POST", body: JSON.stringify({ dryRun: false, overwrite }) }),

  diffVersions: (leftVersionId: string, rightVersionId: string) =>
    apiFetch<DiffResult>(`/api/diff?leftVersionId=${encodeURIComponent(leftVersionId)}&rightVersionId=${encodeURIComponent(rightVersionId)}`),
  diffWorkspaceToVersion: (workspaceScriptId: string, rightVersionId: string) =>
    apiFetch<DiffResult>(
      `/api/diff?workspaceScriptId=${encodeURIComponent(workspaceScriptId)}&rightVersionId=${encodeURIComponent(rightVersionId)}`
    ),

  logs: (params?: {
    projectId?: string;
    actorUsername?: string;
    action?: string;
    result?: string;
    startAt?: string;
    endAt?: string;
    offset?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.projectId) query.set("projectId", params.projectId);
    if (params?.actorUsername) query.set("actorUsername", params.actorUsername);
    if (params?.action) query.set("action", params.action);
    if (params?.result) query.set("result", params.result);
    if (params?.startAt) query.set("startAt", params.startAt);
    if (params?.endAt) query.set("endAt", params.endAt);
    if (typeof params?.offset === "number") query.set("offset", String(params.offset));
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return apiFetch<AuditLogListResult>(suffix ? `/api/logs?${suffix}` : "/api/logs");
  },
};

