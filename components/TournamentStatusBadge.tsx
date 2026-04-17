import { TournamentStatus } from "@/lib/tournament-service";

type Props = {
  status: TournamentStatus;
};

const labelMap: Record<TournamentStatus, string> = {
  draft: "Borrador",
  open: "Abierto",
  in_progress: "En progreso",
  finished: "Finalizado",
};

const classMap: Record<TournamentStatus, string> = {
  draft: "border-slate-200 bg-slate-100 text-slate-700",
  open: "border-emerald-200 bg-emerald-50 text-emerald-700",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700",
  finished: "border-sky-200 bg-sky-50 text-sky-700",
};

export default function TournamentStatusBadge({ status }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${classMap[status]}`}
    >
      {labelMap[status]}
    </span>
  );
}