import { create } from "zustand";

import { api, type User } from "@/utils/api";

type AuthState = {
  user: User | null;
  initialized: boolean;
  loading: boolean;
  loadMe: () => Promise<User | null>;
  login: (username: string, password: string) => Promise<User>;
  register: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initialized: false,
  loading: false,
  loadMe: async () => {
    set({ loading: true });
    try {
      const user = await api.me();
      set({ user, initialized: true, loading: false });
      return user;
    } catch {
      set({ user: null, initialized: true, loading: false });
      return null;
    }
  },
  login: async (username, password) => {
    set({ loading: true });
    try {
      const user = await api.login({ username, password });
      set({ user, initialized: true, loading: false });
      return user;
    } catch (error) {
      set({ loading: false, initialized: true });
      throw error;
    }
  },
  register: async (username, password) => {
    set({ loading: true });
    try {
      const user = await api.register({ username, password });
      set({ user, initialized: true, loading: false });
      return user;
    } catch (error) {
      set({ loading: false, initialized: true });
      throw error;
    }
  },
  logout: async () => {
    set({ loading: true });
    try {
      await api.logout();
    } finally {
      set({ user: null, initialized: true, loading: false });
    }
  },
}));
