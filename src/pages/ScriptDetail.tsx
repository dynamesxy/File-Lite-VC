import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, GitCommit, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { useI18n } from "@/i18n";
import { useAppStore } from "@/store/appStore";
import { api, type Script, type Version } from "@/utils/api";

export default function ScriptDetail() {
  const { tx, isEn } = useI18n();
  const { scriptId } = useParams();
  const nav = useNavigate();
  const { projects, activeProjectId } = useAppStore();

  const [script, setScript] = useState<Script | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [contentOpen, setContentOpen] = useState(false);
  const [content, setContent] = useState<string>("");
  const [contentMeta, setContentMeta] = useState<{ versionNo: string; message: string; createdAt: string } | null>(null);

  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<Version | null>(null);

  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");

  const activeProject = useMemo(() => projects.find((p) => p.id === activeProjectId) ?? null, [projects, activeProjectId]);

  const load = useCallback(async () => {
    if (!scriptId) return;
    if (!activeProjectId) {
      setError(tx("请先在左侧选择项目", "Please select a project on the left first"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const scripts = await api.listScripts(activeProjectId);
      const s = scripts.find((x) => x.id === scriptId) ?? null;
      setScript(s);
      const vs = await api.listVersions(scriptId);
      setVersions(vs);
      setLeftId(vs[1]?.id ?? vs[0]?.id ?? "");
      setRightId(vs[0]?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("加载失败", "Load failed"));
    } finally {
      setBusy(false);
    }
  }, [activeProjectId, scriptId]);

  useEffect(() => {
    load();
  }, [load]);

  async function openContent(versionId: string) {
    setBusy(true);
    try {
      const r = await api.versionContent(versionId);
      setContent(r.content);
      setContentMeta({ versionNo: r.versionNo, message: r.message, createdAt: r.createdAt });
      setContentOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("加载版本内容失败", "Failed to load version content"));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!scriptId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.commit(scriptId, commitMsg.trim());
      setCommitOpen(false);
      setCommitMsg("");
      await load();
      setSuccess(tx("版本已提交", "Version committed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("提交失败", "Commit failed"));
    } finally {
      setBusy(false);
    }
  }

  async function rollback(version: Version) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.rollbackToWorkspace(version.id);
      await load();
      setSuccess(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("回退失败", "Rollback failed"));
    } finally {
      setBusy(false);
    }
  }

  function openRollbackConfirm(version: Version) {
    setRollbackTarget(version);
    setRollbackConfirmOpen(true);
  }

  function goCompare() {
    if (!leftId || !rightId) return;
    nav(`/compare?leftVersionId=${encodeURIComponent(leftId)}&rightVersionId=${encodeURIComponent(rightId)}`);
  }

  function goWorkspaceCompare() {
    if (!scriptId || !rightId) return;
    nav(`/compare?workspaceScriptId=${encodeURIComponent(scriptId)}&rightVersionId=${encodeURIComponent(rightId)}`);
  }

  return (
    <div className="px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/commits" className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-100">
              <ArrowLeft className="h-4 w-4" />
            {tx("返回", "Back")}
            </Link>
          </div>
          <div className="mt-2 text-base font-semibold text-zinc-900">{tx("版本与对比", "Versions & Compare")}</div>
          <div className="mt-1 text-sm text-zinc-600">
            {activeProject ? activeProject.name : tx("未选择项目", "No project selected")} · {script ? script.relativePath : scriptId}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setCommitOpen(true)} disabled={!scriptId}>
            <GitCommit className="h-4 w-4" />
            {tx("提交版本", "Commit Version")}
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">{tx("版本时间线", "Version Timeline")}</div>
          {busy ? (
            <div className="mt-3 animate-pulse rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">{tx("加载中...", "Loading...")}</div>
          ) : versions.length === 0 ? (
            <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">{tx("暂无版本", "No versions yet")}</div>
          ) : (
            <div className="mt-3 space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="rounded-md border border-zinc-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-xs text-zinc-900">{v.versionNo}</div>
                    <div className="flex items-center gap-1">
                      <button className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100" onClick={() => openContent(v.id)}>
                        <Eye className="h-4 w-4" />
                        {tx("查看", "View")}
                      </button>
                      <button
                        className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busy}
                        onClick={() => openRollbackConfirm(v)}
                        type="button"
                      >
                        <RotateCcw className="h-4 w-4" />
                        {tx("回退到本地", "Rollback to Local")}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-zinc-600">{v.message}</div>
                  <div className="mt-1 font-mono text-[11px] text-zinc-500">{v.createdAt}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">{tx("差异比对", "Diff Compare")}</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs text-zinc-600">{tx("左侧版本", "Left Version")}</div>
              <select className="mt-1 h-10 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm" value={leftId} onChange={(e) => setLeftId(e.target.value)}>
                <option value="">{tx("未选择", "Not Selected")}</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.versionNo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-zinc-600">{tx("右侧版本", "Right Version")}</div>
              <select className="mt-1 h-10 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm" value={rightId} onChange={(e) => setRightId(e.target.value)}>
                <option value="">{tx("未选择", "Not Selected")}</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.versionNo}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={goCompare} disabled={!leftId || !rightId}>
              {tx("对比两版本", "Compare Versions")}
            </Button>
            <Button variant="secondary" onClick={goWorkspaceCompare} disabled={!scriptId || !rightId}>
              {tx("工作区 vs 右侧版本", "Workspace vs Right Version")}
            </Button>
          </div>

          <div className="mt-3 text-xs text-zinc-500">{tx('对比视图在“/compare”页面展示（并排行号 + 高亮）。', 'The diff view is displayed on "/compare" with side-by-side line numbers and highlights.')}</div>
        </div>
      </div>

      <Modal
        open={contentOpen}
        title={contentMeta ? tx(`版本内容：${contentMeta.versionNo}`, `Version Content: ${contentMeta.versionNo}`) : tx("版本内容", "Version Content")}
        onClose={() => setContentOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setContentOpen(false)}>
              {tx("关闭", "Close")}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          {contentMeta ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
              <div className="font-mono text-xs text-zinc-700">{contentMeta.createdAt}</div>
              <div className="mt-1 text-sm text-zinc-900">{contentMeta.message}</div>
            </div>
          ) : null}
          <pre className="max-h-[60vh] overflow-auto rounded-md border border-zinc-200 bg-white p-3 font-mono text-xs text-zinc-900">{content}</pre>
        </div>
      </Modal>

      <Modal
        open={commitOpen}
        title={tx("提交版本", "Commit Version")}
        onClose={() => {
          if (!busy) setCommitOpen(false);
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCommitOpen(false)} disabled={busy}>
              {tx("取消", "Cancel")}
            </Button>
            <Button onClick={commit} disabled={busy || !commitMsg.trim()}>
              {tx("提交", "Commit")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-zinc-600">{tx("提交说明", "Commit Message")}</div>
          <Textarea value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} placeholder={tx("本次修改目的、影响范围、回滚要点...", "Purpose, impact, and rollback notes for this change...")} />
        </div>
      </Modal>

      <Modal
        open={rollbackConfirmOpen}
        title={tx("确认回退到本地", "Confirm Rollback to Local")}
        onClose={() => {
          if (!busy) setRollbackConfirmOpen(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setRollbackConfirmOpen(false);
                setRollbackTarget(null);
              }}
              disabled={busy}
            >
              {tx("取消", "Cancel")}
            </Button>
            <Button
              onClick={() => {
                if (!rollbackTarget) return;
                void rollback(rollbackTarget).finally(() => {
                  setRollbackConfirmOpen(false);
                  setRollbackTarget(null);
                });
              }}
              disabled={busy || !rollbackTarget}
            >
              {busy ? tx("处理中...", "Processing...") : tx("确认回退", "Confirm Rollback")}
            </Button>
          </>
        }
      >
        <div className="text-sm text-zinc-700">
          {rollbackTarget
            ? (
              isEn
                ? `Rollback to ${rollbackTarget.versionNo} in the local workspace only? Remote targets will not be changed.`
                : `确认将本地工作区回退到 ${rollbackTarget.versionNo} 吗？远程目标不会被修改。`
            )
            : tx("确认仅回退本地工作区吗？", "Confirm rollback in local workspace only?")}
        </div>
      </Modal>
    </div>
  );
}

