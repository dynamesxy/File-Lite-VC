import { useLanguageStore } from "@/store/languageStore";

export function useI18n() {
  const language = useLanguageStore((s) => s.language);
  const isEn = language === "en";

  function tx(zh: string, en: string) {
    return isEn ? en : zh;
  }

  return { language, isEn, tx };
}
