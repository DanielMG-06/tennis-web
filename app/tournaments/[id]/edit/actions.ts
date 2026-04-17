"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ManualPlayerEntry } from "@/lib/tournament-service";
import {
  getTournamentById,
  listPlayersDirectory,
  setTournamentManualPlayers,
  updateTournament,
} from "@/lib/tournament-service";

type TournamentMode = "public" | "private_league";
type TournamentStatus = "draft" | "open" | "in_progress" | "finished";

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

function uniqueNames(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const value = item.trim().replace(/\s+/g, " ");
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function normalizeLookupKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildManualEntryId(displayName: string, index: number): string {
  const base = displayName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `manual_${base || index + 1}`;
}

function buildManualEntriesFromText(names: string[]): ManualPlayerEntry[] {
  return uniqueNames(names).map((displayName, index) => ({
    id: buildManualEntryId(displayName, index),
    displayName,
    photoUrl: "",
    category: "",
    source: "manual",
    uid: "",
    seed: index + 1,
  }));
}

function getEntryAliases(entry: ManualPlayerEntry): string[] {
  const aliases = [
    entry.uid ? `uid:${normalizeLookupKey(entry.uid)}` : "",
    entry.id ? `id:${normalizeLookupKey(entry.id)}` : "",
    entry.displayName ? `name:${normalizeLookupKey(entry.displayName)}` : "",
  ].filter(Boolean);

  return Array.from(new Set(aliases));
}

function mergeEntryData(
  current: ManualPlayerEntry,
  incoming: ManualPlayerEntry
): ManualPlayerEntry {
  const preferredSource =
    current.source === "players" ||
    current.source === "registration" ||
    incoming.source === "manual"
      ? current.source
      : incoming.source;

  return {
    id: incoming.id || current.id,
    displayName: incoming.displayName || current.displayName,
    photoUrl: incoming.photoUrl || current.photoUrl,
    category: incoming.category || current.category,
    source: preferredSource,
    uid: incoming.uid || current.uid,
    seed: current.seed,
  };
}

function mergeManualPlayerEntries(
  ...groups: ManualPlayerEntry[][]
): ManualPlayerEntry[] {
  const merged: ManualPlayerEntry[] = [];
  const aliasToIndex = new Map<string, number>();

  for (const group of groups) {
    for (const rawEntry of group) {
      const entry: ManualPlayerEntry = {
        id: String(rawEntry.id ?? "").trim(),
        displayName: String(rawEntry.displayName ?? "").trim(),
        photoUrl: String(rawEntry.photoUrl ?? "").trim(),
        category: String(rawEntry.category ?? "").trim(),
        source:
          rawEntry.source === "players" || rawEntry.source === "registration"
            ? rawEntry.source
            : "manual",
        uid: String(rawEntry.uid ?? "").trim(),
        seed: 0,
      };

      if (!entry.displayName) continue;

      const aliases = getEntryAliases(entry);
      const existingIndex = aliases
        .map((alias) => aliasToIndex.get(alias))
        .find((index) => index !== undefined);

      if (existingIndex !== undefined) {
        const updated = mergeEntryData(merged[existingIndex], entry);
        merged[existingIndex] = updated;

        for (const alias of getEntryAliases(updated)) {
          aliasToIndex.set(alias, existingIndex);
        }
      } else {
        const newIndex = merged.length;
        merged.push({
          ...entry,
          seed: newIndex + 1,
        });

        for (const alias of aliases) {
          aliasToIndex.set(alias, newIndex);
        }
      }
    }
  }

  return merged.map((entry, index) => ({
    ...entry,
    seed: index + 1,
  }));
}

function revalidateTournamentPaths(tournamentId: string) {
  revalidatePath("/tournaments");
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/edit`);
}

export async function updateTournamentAction(
  tournamentId: string,
  formData: FormData
) {
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

  const currentTournament = await getTournamentById(tournamentId);

  if (!currentTournament) {
    throw new Error("No se encontró el torneo");
  }

  const tournamentMode = normalizeTournamentMode(
    getString(formData, "tournamentMode")
  );

  const status = normalizeStatus(getString(formData, "status"));

  const groupCount = Math.max(0, getNumber(formData, "groupCount"));
  const groupNames = getLines(formData, "groupNamesText").slice(
    0,
    groupCount > 0 ? groupCount : undefined
  );

  const manualPlayersFromText = uniqueNames(getLines(formData, "manualPlayersText"));
  const textEntries = buildManualEntriesFromText(manualPlayersFromText);

  const preservedCatalogEntries = currentTournament.manualPlayerEntries.filter(
    (entry) => entry.source === "players" || entry.source === "registration"
  );

  const mergedEntries = mergeManualPlayerEntries(
    preservedCatalogEntries,
    textEntries
  );

  await updateTournament(tournamentId, {
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
    groupCount,
    groupNames,
    manualPlayers: mergedEntries.map((entry) => entry.displayName),
    manualPlayerEntries: mergedEntries,
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
  });

  revalidateTournamentPaths(tournamentId);
  redirect(`/tournaments/${tournamentId}`);
}

export async function updateTournamentDirectAction(
  tournamentId: string,
  formData: FormData
) {
  return updateTournamentAction(tournamentId, formData);
}

export async function addPlayersFromCatalogAction(
  tournamentId: string,
  formData: FormData
) {
  const selectedRawValues = formData
    .getAll("selectedPlayers")
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

  if (selectedRawValues.length === 0) {
    revalidateTournamentPaths(tournamentId);
    redirect(`/tournaments/${tournamentId}/edit`);
  }

  const currentTournament = await getTournamentById(tournamentId);

  if (!currentTournament) {
    throw new Error("No se encontró el torneo");
  }

  const selectedKeySet = new Set(
    uniqueNames(selectedRawValues).map((value) => normalizeLookupKey(value))
  );

  const catalog = await listPlayersDirectory();

  const selectedEntries: ManualPlayerEntry[] = catalog
    .filter((player) => {
      const idKey = normalizeLookupKey(player.id);
      const nameKey = normalizeLookupKey(player.displayName);

      return selectedKeySet.has(idKey) || selectedKeySet.has(nameKey);
    })
    .map((player, index) => ({
      id: player.id,
      displayName: player.displayName,
      photoUrl: player.photoUrl,
      category: player.category,
      source: "players",
      uid: player.id,
      seed: index + 1,
    }));

  const mergedEntries = mergeManualPlayerEntries(
    currentTournament.manualPlayerEntries,
    selectedEntries
  );

  await setTournamentManualPlayers(
    tournamentId,
    mergedEntries.map((entry) => entry.displayName),
    mergedEntries
  );

  revalidateTournamentPaths(tournamentId);
  redirect(`/tournaments/${tournamentId}/edit`);
}