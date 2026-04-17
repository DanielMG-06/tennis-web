import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import PageIntro from "@/components/PageIntro";
import StatCard from "@/components/StatCard";
import { listTournaments } from "@/lib/tournament-service";

export default async function DashboardPage() {
  const tournaments = await listTournaments();

  const total = tournaments.length;
  const open = tournaments.filter((t) => t.status === "open").length;
  const inProgress = tournaments.filter((t) => t.status === "in_progress").length;
  const finished = tournaments.filter((t) => t.status === "finished").length;

  const recent = tournaments.slice(0, 5);

  return (
    <AdminShell>
      <PageIntro
        title="Dashboard"
        subtitle="Consulta rápidamente cuántos torneos tienes y su estado actual."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Torneos totales" value={String(total)} />
        <StatCard title="Abiertos" value={String(open)} />
        <StatCard title="En progreso" value={String(inProgress)} />
        <StatCard title="Finalizados" value={String(finished)} />
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Torneos recientes
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Últimos torneos creados o actualizados en el sistema.
            </p>
          </div>

          <Link
            href="/tournaments/new"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Crear torneo
          </Link>
        </div>

        <div className="space-y-3">
          {recent.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay torneos creados.</p>
          ) : (
            recent.map((tournament) => (
              <div
                key={tournament.id}
                className="rounded-xl border border-slate-200 px-4 py-3"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{tournament.name}</p>
                    <p className="text-sm text-slate-500">
                      {tournament.category} · {tournament.format} · {tournament.location}
                    </p>
                  </div>

                  <Link
                    href={`/tournaments/${tournament.id}`}
                    className="text-sm font-medium text-slate-700 hover:text-slate-900"
                  >
                    Ver detalle
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AdminShell>
  );
}