import TournamentForm from "@/components/TournamentForm";
import { createTournamentAction } from "./actions";

export default function NewTournamentPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Admin · Torneos
        </p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-900">
          Crear nuevo torneo
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Crea torneos públicos o privados tipo liga usando el modelo nuevo del
          proyecto.
        </p>
      </div>

      <TournamentForm
        action={createTournamentAction}
        submitLabel="Crear torneo"
      />
    </main>
  );
}