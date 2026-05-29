import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/store/languageStore";

export function LanguageToggle() {
  const { tx } = useI18n();
  const { language, toggleLanguage } = useLanguageStore();
  const english = language === "en";
  const title = english ? tx("切换到中文", "Switch to Chinese") : tx("切换到英文", "Switch to English");

  return (
    <button
      className={cn(
        "inline-flex h-9 w-16 items-center justify-center rounded-md border px-2 text-sm transition-colors",
        "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
      )}
      onClick={toggleLanguage}
      title={title}
      type="button"
      aria-label={title}
    >
      {english ? "en" : "cn"}
    </button>
  );
}
