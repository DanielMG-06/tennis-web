import Link from "next/link";
import SectionCard from "@/components/SectionCard";
import { listTournaments } from "@/lib/tournament-service";

function Badge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "green" | "blue" | "amber" | "red";
}) {
  const tones: Record<string, string> = {
    default: "bg-zinc-100 text-zinc-700 border-zinc-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue: "bg-sky-50 text-sky-700 border-sky-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

function getStatusTone(status: string): "default" | "green" | "blue" | "amber" | "red" {
  const value = (status || "").toLowerCase();

  if (["finished", "completed", "confirmed", "approved"].includes(value)) {
    return "green";
  }

  if (["open", "in_progress"].includes(value)) {
    return "blue";
  }

  if (["draft"].includes(value)) {
    return "amber";
  }

  if (["cancelled", "canceled", "closed"].includes(value)) {
    return "red";
  }

  return "default";
}

export default async function TournamentsPage() {
  const tournaments = await listTournaments();

  const publicCount = tournaments.filter((t) => t.tournamentMode === "public").length;
  const privateCount = tournaments.filter(
    (t) => t.tournamentMode === "private_league"
  ).length;
  const visibleCount = tournaments.filter((t) => t.isPublic).length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Admin · Torneos
          </p>
          <h1 className="mt-2 text-3xl font-bold text-zinc-900">
            Gestión de torneos
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Administra torneos públicos y privados tipo liga desde un solo panel.
          </p>
        </div>

        <Link
          href="/tournaments/new"
          className="inline-flex rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Nuevo torneo
        </Link>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <SectionCard title="Total">
          <div className="text-3xl font-bold text-zinc-900">
            {tournaments.length}
          </div>
          <p className="mt-1 text-sm text-zinc-500">Torneos registrados</p>
        </SectionCard>

        <SectionCard title="Públicos / Privados">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-2xl font-bold text-zinc-900">{publicCount}</div>
              <p className="text-sm text-zinc-500">Públicos</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-900">{privateCount}</div>
              <p className="text-sm text-zinc-500">Privados tipo liga</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Visibles en app">
          <div className="text-3xl font-bold text-zinc-900">{visibleCount}</div>
          <p className="mt-1 text-sm text-zinc-500">
            Con checkbox de publicación activo
          </p>
        </SectionCard>
      </div>

      <div className="space-y-4">
        {tournaments.length ? (
          tournaments.map((tournament) => {
            const generatedGroupsCount = tournament.generatedGroups?.length ?? 0;
            const generatedRoundsCount = tournament.generatedBracket?.length ?? 0;
            const playersCount = tournament.manualPlayers?.length ?? 0;

            return (
              <div
                key={tournament.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        label={
                          tournament.tournamentMode === "public"
                            ? "Público"
                            : "Privado tipo liga"
                        }
                        tone={
                          tournament.tournamentMode === "public" ? "blue" : "amber"
                        }
                      />
                      <Badge
                        label={tournament.status}
                        tone={getStatusTone(tournament.status)}
                      />
                      <Badge
                        label={tournament.isPublic ? "Visible en app" : "Oculto en app"}
                        tone={tournament.isPublic ? "green" : "red"}
                      />
                      <Badge label={tournament.category || "Sin categoría"} />
                    </div>

                    <h2 className="mt-3 text-xl font-bold text-zinc-900">
                      {tournament.name}
                    </h2>

                    <p className="mt-2 max-w-3xl text-sm text-zinc-600">
                      {tournament.description || "Sin descripción"}
                    </p>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-xl border border-zinc-200 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Ubicación
                        </div>
                        <div className="mt-1 text-sm text-zinc-900">
                          {tournament.location || "—"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-200 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Fechas
                        </div>
                        <div className="mt-1 text-sm text-zinc-900">
                          {tournament.startDate || "—"} → {tournament.endDate || "—"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-200 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Máx. jugadores
                        </div>
                        <div className="mt-1 text-sm text-zinc-900">
                          {tournament.maxPlayers || 0}
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-200 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Jugadores cargados
                        </div>
                        <div className="mt-1 text-sm text-zinc-900">
                          {playersCount}
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-200 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Grupos / rondas
                        </div>
                        <div className="mt-1 text-sm text-zinc-900">
                          {generatedGroupsCount} / {generatedRoundsCount}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {tournament.groupNames?.length ? (
                        tournament.groupNames.map((group) => (
                          <span
                            key={group}
                            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700"
                          >
                            {group}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-zinc-500">
                          Sin grupos configurados
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/tournaments/${tournament.id}`}
                      className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Ver detalle
                    </Link>

                    <Link
                      href={`/tournaments/${tournament.id}/edit`}
                      className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                    >
                      Editar
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
            <h2 className="text-lg font-semibold text-zinc-900">
              Aún no hay torneos
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Crea el primero para empezar a poblar la app.
            </p>
            <Link
              href="/tournaments/new"
              className="mt-4 inline-flex rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Crear primer torneo
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}