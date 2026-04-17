import AdminShell from "@/components/AdminShell";
import { createTournamentAction } from "./actions";

export default function NewTournamentPage() {
  return (
    <AdminShell
      title="Nuevo torneo"
      subtitle="Crea un torneo nuevo para que luego aparezca en la app"
    >
      <form
        action={createTournamentAction}
        className="max-w-4xl rounded-2xl border border-white/10 bg-white/5 p-5"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm text-white/75">Nombre</label>
            <input
              name="name"
              required
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              placeholder="Copa Apertura 2026"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Categoría</label>
            <input
              name="category"
              required
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              placeholder="Open / 3ra / 4ta"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Formato</label>
            <input
              name="format"
              required
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              placeholder="Eliminación simple"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Ubicación</label>
            <input
              name="location"
              required
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              placeholder="Club Central"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Fecha inicio</label>
            <input
              type="date"
              name="startDate"
              required
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Fecha fin</label>
            <input
              type="date"
              name="endDate"
              required
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">
              Fecha límite inscripción
            </label>
            <input
              type="date"
              name="registrationDeadline"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">
              Máx. jugadores
            </label>
            <input
              type="number"
              name="maxPlayers"
              min="2"
              defaultValue="16"
              required
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">
              Costo inscripción
            </label>
            <input
              type="number"
              name="entryFeeAmount"
              min="0"
              step="0.01"
              defaultValue="0"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Moneda</label>
            <select
              name="entryFeeCurrency"
              defaultValue="PEN"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            >
              <option value="PEN">PEN</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Estado</label>
            <select
              name="status"
              defaultValue="draft"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            >
              <option value="draft">draft</option>
              <option value="open">open</option>
              <option value="in_progress">in_progress</option>
              <option value="finished">finished</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Visible</label>
            <select
              name="isPublic"
              defaultValue="true"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            >
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm text-white/75">
              Métodos de pago
            </label>
            <div className="flex flex-wrap gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="paymentMethods" value="yape" />
                Yape
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="paymentMethods" value="transfer" />
                Transferencia
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="paymentMethods" value="cash" />
                Efectivo
              </label>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Yape</label>
            <input
              name="yapePhone"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              placeholder="999999999"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">QR Yape</label>
            <input
              name="yapeQrUrl"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Banco</label>
            <input
              name="bankName"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              placeholder="BCP"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">
              Titular
            </label>
            <input
              name="accountHolder"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              placeholder="Nombre del titular"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">
              N° cuenta
            </label>
            <input
              name="accountNumber"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              placeholder="123456789"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">CCI</label>
            <input
              name="cci"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              placeholder="002123..."
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm text-white/75">
              Descripción
            </label>
            <textarea
              name="description"
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              placeholder="Detalles del torneo"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm text-white/75">Reglas</label>
            <textarea
              name="rulesText"
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              placeholder="Reglas del torneo"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm text-white/75">
              Instrucciones de pago
            </label>
            <textarea
              name="instructions"
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              placeholder="Envía tu comprobante por WhatsApp..."
            />
          </div>
        </div>

        <div className="mt-6">
          <button
            type="submit"
            className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
          >
            Guardar torneo
          </button>
        </div>
      </form>
    </AdminShell>
  );
}