import { FileDiff } from "lucide-react";
import { Link } from "react-router-dom";

import { useI18n } from "@/i18n";
import type { Script } from "@/utils/api";

export function ScriptsTable(props: {
  scripts: Script[];
  selectedScriptIds: Set<string>;
  onToggleSelect: (scriptId: string) => void;
  onToggleSelectAll: () => void;
  onCommit: (s: Script) => void;
}) {
  const { tx } = useI18n();
  const selectableScripts = props.scripts.filter((s) => s.hasUncommittedChanges);
  const allSelected = selectableScripts.length > 0 && selectableScripts.every((s) => props.selectedScriptIds.has(s.id));
  return (
    <div className="overflow-auto rounded-md border border-zinc-200">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs text-zinc-600">
          <tr>
            <th className="px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={props.onToggleSelectAll}
                disabled={selectableScripts.length === 0}
                aria-label={tx("全选可提交脚本", "Select all committable scripts")}
              />
            </th>
            <th className="px-3 py-2">{tx("路径", "Path")}</th>
            <th className="px-3 py-2">{tx("最新版本", "Latest Version")}</th>
            <th className="px-3 py-2">{tx("工作区改动", "Workspace Status")}</th>
            <th className="px-3 py-2">{tx("操作", "Actions")}</th>
          </tr>
        </thead>
        <tbody>
          {props.scripts.map((s) => (
            <tr key={s.id} className="border-t border-zinc-100">
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={props.selectedScriptIds.has(s.id)}
                  onChange={() => props.onToggleSelect(s.id)}
                  disabled={!s.hasUncommittedChanges}
                  aria-label={tx(`选择 ${s.relativePath}`, `Select ${s.relativePath}`)}
                />
              </td>
              <td className="px-3 py-2 font-mono text-xs text-zinc-800">{s.relativePath}</td>
              <td className="px-3 py-2 text-zinc-700">{s.latestVersionNo ?? "-"}</td>
              <td className="px-3 py-2">
                {s.hasUncommittedChanges ? (
                  <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{tx("未提交", "Uncommitted")}</span>
                ) : (
                  <span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{tx("已提交", "Committed")}</span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="inline-flex items-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-200" to={`/scripts/${s.id}`}>
                    <FileDiff className="h-4 w-4" />
                    {tx("版本与对比", "Versions & Compare")}
                  </Link>
                  {s.hasUncommittedChanges ? (
                    <button
                      className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700"
                      onClick={() => props.onCommit(s)}
                    >
                      {tx("提交版本", "Commit Version")}
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

