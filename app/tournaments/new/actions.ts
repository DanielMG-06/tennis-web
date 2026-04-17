"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTournament } from "@/lib/tournament-service";

type TournamentStatus = "draft" | "open" | "in_progress" | "finished";

export async function createTournamentAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const format = String(formData.get("format") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const rulesText = String(formData.get("rulesText") ?? "").trim();

  const registrationDeadline = String(
    formData.get("registrationDeadline") ?? ""
  ).trim();

  const entryFeeAmountRaw = String(
    formData.get("entryFeeAmount") ?? ""
  ).trim();

  const entryFeeCurrency = String(
    formData.get("entryFeeCurrency") ?? "PEN"
  ).trim();

  const maxPlayersRaw = String(formData.get("maxPlayers") ?? "").trim();

  const status = String(formData.get("status") ?? "open").trim() as TournamentStatus;
  const isPublic = formData.get("isPublic") === "on";

  const paymentMethods = formData
    .getAll("paymentMethods")
    .map((value) => String(value));

  const paymentConfig = {
    yapePhone: String(formData.get("paymentConfig.yapePhone") ?? "").trim(),
    yapeQrUrl: String(formData.get("paymentConfig.yapeQrUrl") ?? "").trim(),
    bankName: String(formData.get("paymentConfig.bankName") ?? "").trim(),
    accountHolder: String(formData.get("paymentConfig.accountHolder") ?? "").trim(),
    accountNumber: String(formData.get("paymentConfig.accountNumber") ?? "").trim(),
    cci: String(formData.get("paymentConfig.cci") ?? "").trim(),
    instructions: String(formData.get("paymentConfig.instructions") ?? "").trim(),
  };

  if (!name || !category || !format || !startDate || !endDate || !location) {
    throw new Error("Faltan campos obligatorios");
  }

  const entryFeeAmount = entryFeeAmountRaw.isEmpty ? 0 : Number(entryFeeAmountRaw);
  const maxPlayers = maxPlayersRaw.isEmpty ? 0 : Number(maxPlayersRaw);

  if (Number.isNaN(entryFeeAmount) || Number.isNaN(maxPlayers)) {
    throw new Error("Hay campos numéricos inválidos");
  }

  await createTournament({
    name,
    description,
    category,
    format,
    startDate,
    endDate,
    location,
    rulesText,
    isPublic,
    entryFeeAmount,
    entryFeeCurrency,
    paymentMethods,
    registrationDeadline,
    maxPlayers,
    createdBy: "admin",
    status,
    paymentConfig,
  });

  revalidatePath("/dashboard");
  revalidatePath("/tournaments");
  revalidatePath("/tournaments/new");

  redirect("/tournaments");
}