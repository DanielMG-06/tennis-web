import Link from "next/link";
import { notFound } from "next/navigation";
import SectionCard from "@/components/SectionCard";
import {
  getTournamentById,
  listPlayersDirectory,
} from "@/lib/tournament-service";
import {
  addPlayersFromCatalogAction,
  updateTournamentAction,
} from "./actions";

type Props = {
  params: Promise<{ id: string }>;
};

const STATUS_OPTIONS = ["draft", "open", "in_progress", "finished"] as const;
const MODE_OPTIONS = ["public", "private_league"] as const;
const PAYMENT_OPTIONS = ["yape", "transferencia", "efectivo"] as const;
const PUBLIC_CATEGORIES = ["5TA P", "5TA B", "5TA A", "4TA", "3RA"] as const;

function inputClassName() {
  return "mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500";
}

function labelClassName() {
  return "block text-sm font-medium text-zinc-700";
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function categoryMatches(playerCategory: string, tournamentCategory: string): boolean {
  if (!playerCategory || !tournamentCategory) return true;
  return normalizeText(playerCategory) === normalizeText(tournamentCategory);
}

export default async function EditTournamentPage({ params }: Props) {
  const { id } = await params;
  const tournament = await getTournamentById(id);

  if (!tournament) {
    notFound();
  }

  const selectedPayments = new Set(tournament.paymentMethods ?? []);
  const playersCatalog = await listPlayersDirectory();

  const filteredCatalog = playersCatalog.filter((player) =>
    categoryMatches(player.category, tournament.category)
  );

  const selectedCatalogIds = new Set(
    (tournament.manualPlayerEntries ?? [])
      .filter((entry) => entry.source === "players" || entry.source === "registration")
      .map((entry) => entry.uid || entry.id)
      .filter(Boolean)
  );

  const selectedCatalogEntries = (tournament.manualPlayerEntries ?? []).filter(
    (entry) => entry.source === "players" || entry.source === "registration"
  );

  const manualOnlyEntries = (tournament.manualPlayerEntries ?? []).filter(
    (entry) => entry.source === "manual"
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Admin · Torneos
          </p>
          <h1 className="mt-2 text-3xl font-bold text-zinc-900">
            Editar torneo
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Edita datos base, pagos, grupos y jugadores del torneo sin romper la
            estructura nueva del proyecto.
          </p>
        </div>

        <Link
          href={`/tournaments/${tournament.id}`}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Volver al detalle
        </Link>
      </div>

      <div className="space-y-6">
        <SectionCard
          title="Jugadores agregados al torneo"
          subtitle="Resumen actual de jugadores provenientes del catálogo y de carga manual."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                Desde la app / catálogo
              </h3>

              {selectedCatalogEntries.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedCatalogEntries.map((entry) => (
                    <span
                      key={`${entry.source}-${entry.uid || entry.id}`}
                      className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700"
                    >
                      {entry.displayName}
                      {entry.category ? ` · ${entry.category}` : ""}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-zinc-500">
                  Aún no hay jugadores añadidos desde la colección <strong>players</strong>.
                </p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                Manuales
              </h3>

              {manualOnlyEntries.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {manualOnlyEntries.map((entry) => (
                    <span
                      key={entry.id}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700"
                    >
                      {entry.displayName}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-zinc-500">
                  Aún no hay jugadores escritos manualmente.
                </p>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Jugadores desde Firebase"
          subtitle="Selecciona jugadores registrados en la app y añádelos al torneo."
        >
          <form action={addPlayersFromCatalogAction.bind(null, tournament.id)}>
            {filteredCatalog.length ? (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredCatalog.map((player) => {
                  const checked = selectedCatalogIds.has(player.id);

                  return (
                    <label
                      key={player.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-sm transition ${
                        checked
                          ? "border-zinc-900 bg-zinc-50 text-zinc-900"
                          : "border-zinc-200 text-zinc-800"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="selectedPlayers"
                        value={player.id}
                        defaultChecked={checked}
                      />

                      <div className="min-w-0">
                        <div className="truncate font-medium">{player.displayName}</div>
                        <div className="text-xs text-zinc-500">
                          {player.category || "Sin categoría"}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                No se encontraron jugadores en la colección <strong>players</strong>
                {tournament.category ? ` para la categoría ${tournament.category}` : ""}.
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">
                Los jugadores del catálogo se guardan con identidad estable para
                poder usarlos luego en grupos, standings y bracket.
              </p>

              <button
                type="submit"
                className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Añadir jugadores seleccionados
              </button>
            </div>
          </form>
        </SectionCard>

        <form
          action={updateTournamentAction.bind(null, tournament.id)}
          className="space-y-6"
        >
          <SectionCard title="Información general" subtitle="Datos base del torneo">
            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClassName()}>
                Nombre
                <input
                  name="name"
                  defaultValue={tournament.name}
                  required
                  className={inputClassName()}
                />
              </label>

              <label className={labelClassName()}>
                Tipo de torneo
                <select
                  name="tournamentMode"
                  defaultValue={tournament.tournamentMode ?? "public"}
                  className={inputClassName()}
                >
                  {MODE_OPTIONS.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode === "public" ? "Público" : "Privado tipo liga"}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelClassName()}>
                Categoría
                <select
                  name="category"
                  defaultValue={tournament.category ?? "5TA P"}
                  className={inputClassName()}
                >
                  {PUBLIC_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelClassName()}>
                Formato
                <input
                  name="format"
                  defaultValue={tournament.format}
                  required
                  className={inputClassName()}
                />
              </label>

              <label className={labelClassName()}>
                Ubicación
                <input
                  name="location"
                  defaultValue={tournament.location}
                  required
                  className={inputClassName()}
                />
              </label>

              <label className={labelClassName()}>
                Máximo de jugadores
                <input
                  type="number"
                  min={0}
                  name="maxPlayers"
                  defaultValue={tournament.maxPlayers ?? 0}
                  className={inputClassName()}
                />
              </label>
            </div>

            <label className={`${labelClassName()} mt-4`}>
              Descripción
              <textarea
                name="description"
                defaultValue={tournament.description}
                rows={4}
                className={inputClassName()}
              />
            </label>
          </SectionCard>

          <SectionCard
            title="Fechas y publicación"
            subtitle="Inicio, fin, cierre de inscripción y estado"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClassName()}>
                Fecha de inicio
                <input
                  type="date"
                  name="startDate"
                  defaultValue={tournament.startDate}
                  required
                  className={inputClassName()}
                />
              </label>

              <label className={labelClassName()}>
                Fecha de fin
                <input
                  type="date"
                  name="endDate"
                  defaultValue={tournament.endDate}
                  required
                  className={inputClassName()}
                />
              </label>

              <label className={labelClassName()}>
                Cierre de inscripción
                <input
                  type="date"
                  name="registrationDeadline"
                  defaultValue={tournament.registrationDeadline}
                  required
                  className={inputClassName()}
                />
              </label>

              <label className={labelClassName()}>
                Estado
                <select
                  name="status"
                  defaultValue={tournament.status ?? "draft"}
                  className={inputClassName()}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-4 flex items-center gap-3 rounded-xl border border-zinc-200 p-3">
              <input
                type="checkbox"
                name="isPublic"
                defaultChecked={tournament.isPublic ?? true}
                className="h-4 w-4"
              />
              <div>
                <div className="text-sm font-medium text-zinc-800">
                  Visible en la app
                </div>
                <div className="text-xs text-zinc-500">
                  Actívalo para mostrar el torneo en la app móvil.
                </div>
              </div>
            </label>
          </SectionCard>

          <SectionCard
            title="Inscripción y pagos"
            subtitle="Costo, moneda, métodos y datos de pago"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClassName()}>
                Monto de inscripción
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  name="entryFeeAmount"
                  defaultValue={tournament.entryFeeAmount ?? 0}
                  className={inputClassName()}
                />
              </label>

              <label className={labelClassName()}>
                Moneda
                <input
                  name="entryFeeCurrency"
                  defaultValue={tournament.entryFeeCurrency ?? "PEN"}
                  className={inputClassName()}
                />
              </label>
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium text-zinc-700">
                Métodos de pago
              </div>

              <div className="mt-2 grid gap-3 md:grid-cols-3">
                {PAYMENT_OPTIONS.map((method) => (
                  <label
                    key={method}
                    className="flex items-center gap-2 rounded-xl border border-zinc-200 p-3 text-sm text-zinc-700"
                  >
                    <input
                      type="checkbox"
                      name="paymentMethods"
                      value={method}
                      defaultChecked={selectedPayments.has(method)}
                    />
                    {method}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={labelClassName()}>
                Yape teléfono
                <input
                  name="paymentConfig.yapePhone"
                  defaultValue={tournament.paymentConfig?.yapePhone ?? ""}
                  className={inputClassName()}
                />
              </label>

              <label className={labelClassName()}>
                URL QR Yape
                <input
                  name="paymentConfig.yapeQrUrl"
                  defaultValue={tournament.paymentConfig?.yapeQrUrl ?? ""}
                  className={inputClassName()}
                />
              </label>

              <label className={labelClassName()}>
                Banco
                <input
                  name="paymentConfig.bankName"
                  defaultValue={tournament.paymentConfig?.bankName ?? ""}
                  className={inputClassName()}
                />
              </label>

              <label className={labelClassName()}>
                Titular
                <input
                  name="paymentConfig.accountHolder"
                  defaultValue={tournament.paymentConfig?.accountHolder ?? ""}
                  className={inputClassName()}
                />
              </label>

              <label className={labelClassName()}>
                Número de cuenta
                <input
                  name="paymentConfig.accountNumber"
                  defaultValue={tournament.paymentConfig?.accountNumber ?? ""}
                  className={inputClassName()}
                />
              </label>

              <label className={labelClassName()}>
                CCI
                <input
                  name="paymentConfig.cci"
                  defaultValue={tournament.paymentConfig?.cci ?? ""}
                  className={inputClassName()}
                />
              </label>
            </div>

            <label className={`${labelClassName()} mt-4`}>
              Instrucciones de pago
              <textarea
                name="paymentConfig.instructions"
                defaultValue={tournament.paymentConfig?.instructions ?? ""}
                rows={4}
                className={inputClassName()}
              />
            </label>
          </SectionCard>

          <SectionCard
            title="Grupos y jugadores"
            subtitle="Configuración de grupos y carga manual compatible con el nuevo modelo."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClassName()}>
                Cantidad de grupos
                <input
                  type="number"
                  min={0}
                  name="groupCount"
                  defaultValue={tournament.groupCount ?? 0}
                  className={inputClassName()}
                />
              </label>
            </div>

            <label className={`${labelClassName()} mt-4`}>
              Nombres de grupos
              <textarea
                name="groupNamesText"
                defaultValue={(tournament.groupNames ?? []).join("\n")}
                rows={4}
                className={inputClassName()}
              />
            </label>

            <label className={`${labelClassName()} mt-4`}>
              Jugadores manuales
              <textarea
                name="manualPlayersText"
                defaultValue={manualOnlyEntries.map((entry) => entry.displayName).join("\n")}
                rows={8}
                className={inputClassName()}
              />
            </label>

            <p className="mt-3 text-xs text-zinc-500">
              Aquí escribe solo jugadores manuales. Los jugadores que añades desde
              Firebase se conservan aparte con su identidad real.
            </p>
          </SectionCard>

          <SectionCard title="Reglas" subtitle="Texto visible para administración">
            <label className={labelClassName()}>
              Reglas del torneo
              <textarea
                name="rulesText"
                defaultValue={tournament.rulesText}
                rows={8}
                className={inputClassName()}
              />
            </label>
          </SectionCard>

          <div className="flex items-center justify-end gap-3">
            <Link
              href={`/tournaments/${tournament.id}`}
              className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancelar
            </Link>

            <button
              type="submit"
              className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Guardar cambios
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}