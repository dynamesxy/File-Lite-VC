import { create } from "zustand";

export type LanguageMode = "zh" | "en";

const LANGUAGE_KEY = "sqlftpvc.language";

function readLanguage(): LanguageMode {
  if (typeof window === "undefined") return "zh";
  return localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "zh";
}

type LanguageState = {
  language: LanguageMode;
  setLanguage: (language: LanguageMode) => void;
  toggleLanguage: () => void;
};

export const useLanguageStore = create<LanguageState>((set) => ({
  language: readLanguage(),
  setLanguage: (language) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LANGUAGE_KEY, language);
    }
    set({ language });
  },
  toggleLanguage: () =>
    set((state) => {
      const nextLanguage: LanguageMode = state.language === "en" ? "zh" : "en";
      if (typeof window !== "undefined") {
        localStorage.setItem(LANGUAGE_KEY, nextLanguage);
      }
      return { language: nextLanguage };
    }),
}));
