import { Pencil, Trash2 } from "lucide-react";

import { useI18n } from "@/i18n";
import type { Project } from "@/utils/api";

export function ProjectsTable(props: {
  projects: Project[];
  activeProjectId: string | null;
  selectedProjectIds: Set<string>;
  onToggleSelect: (projectId: string) => void;
  onToggleSelectAll: () => void;
  onSetActive: (projectId: string) => void;
  onEdit: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}) {
  const { tx } = useI18n();
  const allSelected = props.projects.length > 0 && props.projects.every((p) => props.selectedProjectIds.has(p.id));

  return (
    <div className="overflow-auto rounded-md border border-zinc-200">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs text-zinc-600">
          <tr>
            <th className="w-10 px-3 py-2">
              <input type="checkbox" checked={allSelected} onChange={props.onToggleSelectAll} />
            </th>
            <th className="px-3 py-2">{tx("项目", "Project")}</th>
            <th className="px-3 py-2">{tx("本地工作区", "Local Workspace")}</th>
            <th className="px-3 py-2">{tx("远端目录", "Remote Path")}</th>
            <th className="px-3 py-2">{tx("操作", "Actions")}</th>
          </tr>
        </thead>
        <tbody>
          {props.projects.map((p) => {
            const selected = props.selectedProjectIds.has(p.id);
            const active = props.activeProjectId === p.id;
            return (
              <tr key={p.id} className="border-t border-zinc-100">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected} onChange={() => props.onToggleSelect(p.id)} />
                </td>
                <td className="px-3 py-2">
                  <button
                    className="text-left text-sm font-semibold text-zinc-900 hover:underline"
                    onClick={() => props.onSetActive(p.id)}
                  >
                    {p.name}
                  </button>
                  {active ? <span className="ml-2 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{tx("当前", "Current")}</span> : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-700">{p.localWorkspacePath}</td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-700">{p.remotePath}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="inline-flex items-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-200"
                      onClick={() => props.onEdit(p.id)}
                    >
                      <Pencil className="h-4 w-4" />
                      {tx("编辑", "Edit")}
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 hover:bg-red-100"
                      onClick={() => props.onDelete(p.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      {tx("删除", "Delete")}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
