import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { ReactNode } from "react";

export function Modal({ open, title, children, footer, onClose }: { open: boolean; title: string; children: ReactNode; footer?: ReactNode; onClose: () => void }) {
  const { tx } = useI18n();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={cn("w-full max-w-2xl rounded-lg bg-white shadow-xl")}> 
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div className="text-sm font-semibold text-zinc-900">{title}</div>
            <button className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100" onClick={onClose}>
              {tx("关闭", "Close")}
            </button>
          </div>
          <div className="max-h-[70vh] overflow-auto px-4 py-4">{children}</div>
          {footer ? <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

