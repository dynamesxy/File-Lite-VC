import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { DiffRow } from "@/utils/api";

function rowBg(kind: DiffRow["kind"]) {
  if (kind === "add") return "bg-emerald-50";
  if (kind === "del") return "bg-red-50";
  if (kind === "chg") return "bg-amber-50";
  return "bg-white";
}

function gutterText(kind: DiffRow["kind"]) {
  if (kind === "add") return "+";
  if (kind === "del") return "-";
  if (kind === "chg") return "~";
  return "";
}

export function DiffTable({ rows }: { rows: DiffRow[] }) {
  const { tx } = useI18n();
  return (
    <div className="overflow-auto rounded-md border border-zinc-200">
      <table className="w-full border-collapse font-mono text-xs">
        <thead className="sticky top-0 bg-zinc-50">
          <tr className="text-left text-zinc-600">
            <th className="w-10 border-b border-zinc-200 px-2 py-2"> </th>
            <th className="w-12 border-b border-zinc-200 px-2 py-2">L</th>
            <th className="border-b border-zinc-200 px-2 py-2">{tx("本地/左侧", "Local / Left")}</th>
            <th className="w-12 border-b border-zinc-200 px-2 py-2">R</th>
            <th className="border-b border-zinc-200 px-2 py-2">{tx("远端/右侧", "Remote / Right")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className={cn("align-top", rowBg(r.kind))}>
              <td className={cn("border-b border-zinc-100 px-2 py-1 text-center text-zinc-500")}>{gutterText(r.kind)}</td>
              <td className={cn("border-b border-zinc-100 px-2 py-1 text-right text-zinc-500")}>{r.leftNo ?? ""}</td>
              <td className={cn("border-b border-zinc-100 px-2 py-1 text-zinc-900")}> {r.leftText === "" ? <span className="text-zinc-300">{tx("∅", "∅")}</span> : r.leftText}</td>
              <td className={cn("border-b border-zinc-100 px-2 py-1 text-right text-zinc-500")}>{r.rightNo ?? ""}</td>
              <td className={cn("border-b border-zinc-100 px-2 py-1 text-zinc-900")}>{r.rightText === "" ? <span className="text-zinc-300">{tx("∅", "∅")}</span> : r.rightText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

