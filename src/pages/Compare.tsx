import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { DiffTable } from "@/components/DiffTable";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n";
import { api, type DiffResult } from "@/utils/api";

export default function Compare() {
  const { tx } = useI18n();
  const [params] = useSearchParams();

  const leftVersionId = params.get("leftVersionId");
  const rightVersionId = params.get("rightVersionId");
  const workspaceScriptId = params.get("workspaceScriptId");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);

  const title = useMemo(() => {
    if (workspaceScriptId && rightVersionId) return tx("工作区 vs 版本", "Workspace vs Version");
    if (leftVersionId && rightVersionId) return tx("版本对比", "Version Compare");
    return tx("对比视图", "Compare View");
  }, [leftVersionId, rightVersionId, workspaceScriptId, tx]);

  useEffect(() => {
    async function load() {
      setBusy(true);
      setError(null);
      setDiff(null);
      try {
        if (leftVersionId && rightVersionId) {
          const r = await api.diffVersions(leftVersionId, rightVersionId);
          setDiff(r);
          return;
        }
        if (workspaceScriptId && rightVersionId) {
          const r = await api.diffWorkspaceToVersion(workspaceScriptId, rightVersionId);
          setDiff(r);
          return;
        }
        setError(tx("参数不足，无法对比", "Missing parameters, unable to compare"));
      } catch (e) {
        setError(e instanceof Error ? e.message : tx("加载对比失败", "Failed to load diff"));
      } finally {
        setBusy(false);
      }
    }
    load();
  }, [leftVersionId, rightVersionId, workspaceScriptId]);

  return (
    <div className="px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/commits" className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-100">
            <ArrowLeft className="h-4 w-4" />
            {tx("返回", "Back")}
          </Link>
          <div className="mt-2 text-base font-semibold text-zinc-900">{title}</div>
          {diff ? (
            <div className="mt-1 text-sm text-zinc-600">
              {tx(`新增 ${diff.addedLines} 行 · 删除 ${diff.removedLines} 行 · 共 ${diff.rows.length} 行`, `${diff.addedLines} added · ${diff.removedLines} removed · ${diff.rows.length} total`)}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => location.reload()} disabled={busy}>
            {tx("刷新", "Refresh")}
          </Button>
        </div>
      </div>

      {busy ? (
        <div className="mt-6 animate-pulse rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">{tx("加载中...", "Loading...")}</div>
      ) : error ? (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : diff ? (
        <div className="mt-6">
          <DiffTable rows={diff.rows} />
        </div>
      ) : (
        <div className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">{tx("无数据", "No data")}</div>
      )}
    </div>
  );
}

