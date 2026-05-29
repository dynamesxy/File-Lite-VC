import { FolderGit2, LogOut, Settings } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";

import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";

function NavItem({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  const loc = useLocation();
  const active = loc.pathname === to;
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
  const { user, logout } = useAuthStore();
  const nav = useNavigate();
  const [logoutBusy, setLogoutBusy] = useState(false);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  async function handleLogout() {
    setLogoutBusy(true);
    try {
      await logout();
      nav("/login", { replace: true });
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto grid max-w-[1440px] grid-cols-[260px_1fr] gap-0">
        <aside className="min-h-screen border-r border-zinc-200 bg-white px-3 py-4">
          <div className="px-2">
            <div className="text-sm font-semibold text-zinc-900">SQL FTP VC</div>
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
            <NavItem to="/" label={tx("项目工作台", "Dashboard")} icon={<FolderGit2 className="h-4 w-4" />} />
            <NavItem to="/settings" label={tx("连接与设置", "Settings")} icon={<Settings className="h-4 w-4" />} />
          </nav>

          <div className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-xs text-zinc-500">{tx("当前账号", "Current User")}</div>
            <div className="mt-1 text-sm font-medium text-zinc-900">{user?.username ?? "-"}</div>
            <button
              className="mt-3 inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={logoutBusy}
              onClick={() => void handleLogout()}
              type="button"
            >
              <LogOut className="h-4 w-4" />
              {logoutBusy ? tx("退出中...", "Signing out...") : tx("退出登录", "Sign Out")}
            </button>
          </div>

          <div className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-xs text-zinc-500">{tx("外观与语言", "Appearance & Language")}</div>
            <div className="mt-3 flex items-stretch">
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <div className="text-xs text-zinc-500">{tx("主题", "Theme")}</div>
                <ThemeToggle />
              </div>
              <div className="mx-4 w-px self-stretch bg-zinc-200" />
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <div className="text-xs text-zinc-500">{tx("语言", "Language")}</div>
                <LanguageToggle />
              </div>
            </div>
          </div>

          <div className="mt-6 px-2 text-xs text-zinc-500">{tx("默认端口 8848，支持局域网登录访问", "Default port 8848, supports LAN access")}</div>
        </aside>

        <main className="min-h-screen">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

