import { create } from "zustand";

import { api, type Project } from "@/utils/api";

type AppState = {
  projects: Project[];
  activeProjectId: string | null;
  loadingProjects: boolean;
  error: string | null;
  refreshProjects: () => Promise<void>;
  setActiveProjectId: (id: string | null) => void;
};

const ACTIVE_PROJECT_KEY = "sqlftpvc.activeProjectId";

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  activeProjectId: localStorage.getItem(ACTIVE_PROJECT_KEY),
  loadingProjects: false,
  error: null,
  refreshProjects: async () => {
    set({ loadingProjects: true, error: null });
    try {
      const projects = await api.listProjects();
      let activeProjectId = get().activeProjectId;
      if (activeProjectId && !projects.some((p) => p.id === activeProjectId)) {
        activeProjectId = null;
      }
      if (!activeProjectId && projects.length > 0) {
        activeProjectId = projects[0].id;
      }
      if (activeProjectId) {
        localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
      } else {
        localStorage.removeItem(ACTIVE_PROJECT_KEY);
      }
      set({ projects, activeProjectId, loadingProjects: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载项目失败";
      set({ loadingProjects: false, error: msg });
    }
  },
  setActiveProjectId: (id) => {
    if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    else localStorage.removeItem(ACTIVE_PROJECT_KEY);
    set({ activeProjectId: id });
  },
}));

