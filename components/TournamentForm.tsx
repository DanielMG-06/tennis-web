import SectionCard from "@/components/SectionCard";
import {
  TournamentItem,
  TournamentMode,
  TournamentStatus,
} from "@/lib/tournament-service";

type TournamentFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  initialData?: Partial<TournamentItem>;
};

const PUBLIC_CATEGORIES = ["5TA P", "5TA B", "5TA A", "4TA", "3RA"];
const STATUS_OPTIONS: TournamentStatus[] = [
  "draft",
  "open",
  "in_progress",
  "finished",
];
const MODE_OPTIONS: TournamentMode[] = ["public", "private_league"];
const PAYMENT_OPTIONS = ["yape", "transferencia", "efectivo"];

function inputClassName() {
  return "mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500";
}

function labelClassName() {
  return "block text-sm font-medium text-zinc-700";
}

export default function TournamentForm({
  action,
  submitLabel,
  initialData,
}: TournamentFormProps) {
  const groupNamesText = initialData?.groupNames?.join("\n") ?? "";
  const manualPlayersText = initialData?.manualPlayers?.join("\n") ?? "";
  const selectedPayments = new Set(initialData?.paymentMethods ?? []);

  return (
    <form action={action} className="space-y-6">
      <SectionCard
        title="Información general"
        subtitle="Datos base del torneo con el modelo nuevo"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClassName()}>
            Nombre
            <input
              name="name"
              defaultValue={initialData?.name ?? ""}
              required
              className={inputClassName()}
              placeholder="Ej. Copa Apertura 5TA A"
            />
          </label>

          <label className={labelClassName()}>
            Tipo de torneo
            <select
              name="tournamentMode"
              defaultValue={initialData?.tournamentMode ?? "public"}
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
              defaultValue={initialData?.category ?? "5TA P"}
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
              defaultValue={initialData?.format ?? ""}
              required
              className={inputClassName()}
              placeholder="Ej. Round Robin / Eliminación / Mixto"
            />
          </label>

          <label className={labelClassName()}>
            Ubicación
            <input
              name="location"
              defaultValue={initialData?.location ?? ""}
              required
              className={inputClassName()}
              placeholder="Club, sede o dirección"
            />
          </label>

          <label className={labelClassName()}>
            Máximo de jugadores
            <input
              type="number"
              min={0}
              name="maxPlayers"
              defaultValue={initialData?.maxPlayers ?? 0}
              className={inputClassName()}
            />
          </label>
        </div>

        <label className={`${labelClassName()} mt-4`}>
          Descripción
          <textarea
            name="description"
            defaultValue={initialData?.description ?? ""}
            rows={4}
            className={inputClassName()}
            placeholder="Descripción general del torneo"
          />
        </label>
      </SectionCard>

      <SectionCard
        title="Fechas y publicación"
        subtitle="Controla inicio, fin, cierre de inscripción y estado"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClassName()}>
            Fecha de inicio
            <input
              type="date"
              name="startDate"
              defaultValue={initialData?.startDate ?? ""}
              required
              className={inputClassName()}
            />
          </label>

          <label className={labelClassName()}>
            Fecha de fin
            <input
              type="date"
              name="endDate"
              defaultValue={initialData?.endDate ?? ""}
              required
              className={inputClassName()}
            />
          </label>

          <label className={labelClassName()}>
            Cierre de inscripción
            <input
              type="date"
              name="registrationDeadline"
              defaultValue={initialData?.registrationDeadline ?? ""}
              required
              className={inputClassName()}
            />
          </label>

          <label className={labelClassName()}>
            Estado
            <select
              name="status"
              defaultValue={initialData?.status ?? "draft"}
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
            defaultChecked={initialData?.isPublic ?? true}
            className="h-4 w-4"
          />
          <div>
            <div className="text-sm font-medium text-zinc-800">
              Visible en la app
            </div>
            <div className="text-xs text-zinc-500">
              Úsalo cuando deba aparecer para usuarios móviles.
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
              defaultValue={initialData?.entryFeeAmount ?? 0}
              className={inputClassName()}
            />
          </label>

          <label className={labelClassName()}>
            Moneda
            <input
              name="entryFeeCurrency"
              defaultValue={initialData?.entryFeeCurrency ?? "PEN"}
              className={inputClassName()}
              placeholder="PEN"
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
              defaultValue={initialData?.paymentConfig?.yapePhone ?? ""}
              className={inputClassName()}
            />
          </label>

          <label className={labelClassName()}>
            URL QR Yape
            <input
              name="paymentConfig.yapeQrUrl"
              defaultValue={initialData?.paymentConfig?.yapeQrUrl ?? ""}
              className={inputClassName()}
            />
          </label>

          <label className={labelClassName()}>
            Banco
            <input
              name="paymentConfig.bankName"
              defaultValue={initialData?.paymentConfig?.bankName ?? ""}
              className={inputClassName()}
            />
          </label>

          <label className={labelClassName()}>
            Titular
            <input
              name="paymentConfig.accountHolder"
              defaultValue={initialData?.paymentConfig?.accountHolder ?? ""}
              className={inputClassName()}
            />
          </label>

          <label className={labelClassName()}>
            Número de cuenta
            <input
              name="paymentConfig.accountNumber"
              defaultValue={initialData?.paymentConfig?.accountNumber ?? ""}
              className={inputClassName()}
            />
          </label>

          <label className={labelClassName()}>
            CCI
            <input
              name="paymentConfig.cci"
              defaultValue={initialData?.paymentConfig?.cci ?? ""}
              className={inputClassName()}
            />
          </label>
        </div>

        <label className={`${labelClassName()} mt-4`}>
          Instrucciones de pago
          <textarea
            name="paymentConfig.instructions"
            defaultValue={initialData?.paymentConfig?.instructions ?? ""}
            rows={4}
            className={inputClassName()}
            placeholder="Ej. Enviar comprobante por WhatsApp..."
          />
        </label>
      </SectionCard>

      <SectionCard
        title="Configuración privada / liga por grupos"
        subtitle="Solo aplica cuando sea private_league"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClassName()}>
            Cantidad de grupos
            <input
              type="number"
              min={0}
              name="groupCount"
              defaultValue={initialData?.groupCount ?? 0}
              className={inputClassName()}
            />
          </label>
        </div>

        <label className={`${labelClassName()} mt-4`}>
          Nombres de grupos
          <textarea
            name="groupNamesText"
            defaultValue={groupNamesText}
            rows={4}
            className={inputClassName()}
            placeholder={`Grupo A\nGrupo B\nGrupo C`}
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Uno por línea.
          </span>
        </label>

        <label className={`${labelClassName()} mt-4`}>
          Jugadores añadidos manualmente
          <textarea
            name="manualPlayersText"
            defaultValue={manualPlayersText}
            rows={6}
            className={inputClassName()}
            placeholder={`Juan Pérez\nCarlos Rojas\nMiguel Soto`}
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Uno por línea.
          </span>
        </label>
      </SectionCard>

      <SectionCard
        title="Reglas del torneo"
        subtitle="Texto visible para administración y futura app"
      >
        <label className={labelClassName()}>
          Reglas
          <textarea
            name="rulesText"
            defaultValue={initialData?.rulesText ?? ""}
            rows={8}
            className={inputClassName()}
            placeholder="Escribe aquí el reglamento del torneo"
          />
        </label>
      </SectionCard>

      <div className="flex items-center justify-end">
        <button
          type="submit"
          className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}