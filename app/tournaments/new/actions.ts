"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CreateTournamentInput,
  TournamentMode,
  TournamentStatus,
  createTournament,
} from "@/lib/tournament-service";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function getNumber(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

function getLines(formData: FormData, key: string): string[] {
  return String(formData.get(key) ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getPaymentMethods(formData: FormData): string[] {
  return formData
    .getAll("paymentMethods")
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function normalizeTournamentMode(value: string): TournamentMode {
  return value === "private_league" ? "private_league" : "public";
}

function normalizeStatus(value: string): TournamentStatus {
  if (value === "open") return "open";
  if (value === "in_progress") return "in_progress";
  if (value === "finished") return "finished";
  return "draft";
}

export async function createTournamentAction(formData: FormData) {
  const name = getString(formData, "name");
  const category = getString(formData, "category");
  const format = getString(formData, "format");
  const location = getString(formData, "location");
  const startDate = getString(formData, "startDate");
  const endDate = getString(formData, "endDate");
  const registrationDeadline = getString(formData, "registrationDeadline");

  if (
    !name ||
    !category ||
    !format ||
    !location ||
    !startDate ||
    !endDate ||
    !registrationDeadline
  ) {
    throw new Error("Faltan campos obligatorios");
  }

  const tournamentMode = normalizeTournamentMode(
    getString(formData, "tournamentMode")
  );

  const status = normalizeStatus(getString(formData, "status"));

  const input: CreateTournamentInput = {
    name,
    description: getString(formData, "description"),
    category,
    format,
    tournamentMode,
    startDate,
    endDate,
    location,
    rulesText: getString(formData, "rulesText"),
    isPublic: getBoolean(formData, "isPublic"),
    entryFeeAmount: getNumber(formData, "entryFeeAmount"),
    entryFeeCurrency: getString(formData, "entryFeeCurrency") || "PEN",
    paymentMethods: getPaymentMethods(formData),
    registrationDeadline,
    maxPlayers: getNumber(formData, "maxPlayers"),
    groupCount: getNumber(formData, "groupCount"),
    groupNames: getLines(formData, "groupNamesText"),
    manualPlayers: getLines(formData, "manualPlayersText"),
    createdBy: "admin_web",
    paymentConfig: {
      yapePhone: getString(formData, "paymentConfig.yapePhone"),
      yapeQrUrl: getString(formData, "paymentConfig.yapeQrUrl"),
      bankName: getString(formData, "paymentConfig.bankName"),
      accountHolder: getString(formData, "paymentConfig.accountHolder"),
      accountNumber: getString(formData, "paymentConfig.accountNumber"),
      cci: getString(formData, "paymentConfig.cci"),
      instructions: getString(formData, "paymentConfig.instructions"),
    },
    status,
  };

  const id = await createTournament(input);

  revalidatePath("/tournaments");
  redirect(`/tournaments/${id}`);
}