import { useEffect } from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { useI18n } from "@/i18n";
import Compare from "@/pages/Compare";
import CommitsPage from "@/pages/Commits";
import ConnectionsPage from "@/pages/Connections";
import LoginPage from "@/pages/Login";
import ProjectsPage from "@/pages/Projects";
import RegisterPage from "@/pages/Register";
import SettingsPage from "@/pages/Settings";
import ScriptDetail from "@/pages/ScriptDetail";
import { useAuthStore } from "@/store/authStore";

function PageLoading() {
  const { tx } = useI18n();
  return <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600">{tx("加载中...", "Loading...")}</div>;
}

function RequireAuth() {
  const user = useAuthStore((s) => s.user);
  return user ? <AppShell /> : <Navigate to="/login" replace />;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  return user ? <Navigate to="/projects" replace /> : <>{children}</>;
}

export default function App() {
  const { initialized, loadMe } = useAuthStore();

  useEffect(() => {
    if (!initialized) {
      void loadMe();
    }
  }, [initialized, loadMe]);

  if (!initialized) {
    return <PageLoading />;
  }

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <LoginPage />
            </GuestOnly>
          }
        />
        <Route
          path="/register"
          element={
            <GuestOnly>
              <RegisterPage />
            </GuestOnly>
          }
        />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/commits" element={<CommitsPage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/scripts/:scriptId" element={<ScriptDetail />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Router>
  );
}
