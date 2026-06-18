import { FolderGit2, GitCommit, Plug, Settings } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";

function NavItem({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  const loc = useLocation();
  const active =
    loc.pathname === to ||
    (to !== "/" && loc.pathname.startsWith(`${to}/`)) ||
    (to === "/commits" && (loc.pathname.startsWith("/scripts/") || loc.pathname.startsWith("/compare")));
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-100"
      )}
    >
      <span className="text-zinc-600">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export function AppShell() {
  const { tx } = useI18n();
  const { projects, activeProjectId, setActiveProjectId, refreshProjects } = useAppStore();

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto grid max-w-[1440px] grid-cols-[260px_1fr] gap-0">
        <aside className="min-h-screen border-r border-zinc-200 bg-white px-3 py-4">
          <div className="px-2">
            <div className="text-sm font-semibold text-zinc-900">File-Lite-VC</div>
            <div className="mt-0.5 text-xs text-zinc-500">{tx("轻量级的文件管理工具", "Lightweight file management tool")}</div>
            <div className="mt-3">
              <div className="text-xs text-zinc-500">{tx("当前项目", "Current Project")}</div>
              <select
                className="mt-1 h-10 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm"
                value={activeProjectId ?? ""}
                onChange={(e) => setActiveProjectId(e.target.value || null)}
              >
                <option value="">{tx("未选择", "Not Selected")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <nav className="mt-4 space-y-1 px-1">
            <NavItem to="/projects" label={tx("项目", "Projects")} icon={<FolderGit2 className="h-4 w-4" />} />
            <NavItem to="/commits" label={tx("提交", "Commits")} icon={<GitCommit className="h-4 w-4" />} />
            <NavItem to="/connections" label={tx("连接", "Connections")} icon={<Plug className="h-4 w-4" />} />
            <NavItem to="/settings" label={tx("设置", "Settings")} icon={<Settings className="h-4 w-4" />} />
          </nav>

          <div className="mt-6 px-2 text-xs text-zinc-500">{tx("默认端口 8848，支持局域网登录访问", "Default port 8848, supports LAN access")}</div>
        </aside>

        <main className="min-h-screen">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

