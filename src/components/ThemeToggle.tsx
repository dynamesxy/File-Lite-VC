import { Moon, Sun } from "lucide-react";

import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/store/themeStore";

export function ThemeToggle() {
  const { tx } = useI18n();
  const { theme, toggleTheme } = useThemeStore();
  const dark = theme === "dark";
  const title = dark ? tx("切换到浅色", "Switch to light") : tx("切换到深色", "Switch to dark");

  return (
    <button
      className={cn(
        "inline-flex h-9 w-10 items-center justify-center rounded-md border text-sm transition-colors",
        "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
      )}
      onClick={toggleTheme}
      title={title}
      type="button"
      aria-label={title}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
