"use server";

import { revalidatePath } from "next/cache";
import { dbAdmin } from "@/lib/firebase-admin";
import {
  type BracketRound,
  type GeneratedGroup,
  type ManualPlayerEntry,
  type StandingRow,
  getTournamentById,
  listTournamentRegistrations,
  setTournamentComputedState,
  setTournamentGeneratedBracket,
  setTournamentGeneratedGroups,
  setTournamentManualPlayers,
  updateTournament,
} from "../../../lib/tournament-service";

type AppMatchLite = {
  id: string;
  home: string;
  away: string;
  winner: string;
  score: string;
  scoreSets: Array<{ homeGames: number; awayGames: number }>;
  status: string;
  updatedAtMs: number;
};

function revalidateTournamentViews(tournamentId: string) {
  revalidatePath("/tournaments");
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/edit`);
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeToken(value: string): string {
  return normalizeText(value).replace(/\s+/g, "_");
}

function uniqueNames(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const value = item.trim().replace(/\s+/g, " ");
    const key = normalizeText(value);

    if (!value || seen.has(key)) continue;

    seen.add(key);
    result.push(value);
  }

  return result;
}

function parseLines(formData: FormData, key: string): string[] {
  return String(formData.get(key) ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readFirstString(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function toMillis(value: unknown): number {
  if (!value) return 0;

  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }

  return 0;
}

function parseScorePairs(score: string): Array<[number, number]> {
  const matches = [...score.matchAll(/(\d+)\s*[-:/]\s*(\d+)/g)];
  return matches.map((m) => [Number(m[1]), Number(m[2])]);
}

function extractScoreSets(data: Record<string, unknown>) {
  if (!Array.isArray(data.scoreSets)) return [];

  return data.scoreSets
    .map((item) => {
      const set = isRecord(item) ? item : {};
      return {
        homeGames: cleanNumber(set.homeGames, 0),
        awayGames: cleanNumber(set.awayGames, 0),
      };
    })
    .filter(
      (set) =>
        Number.isFinite(set.homeGames) &&
        Number.isFinite(set.awayGames)
    );
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

function normalizeManualPlayerEntry(
  value: unknown,
  index: number
): ManualPlayerEntry {
  if (typeof value === "string") {
    const displayName = cleanString(value, `Jugador ${index + 1}`);
    return {
      id: buildManualEntryId(displayName, index),
      displayName,
      photoUrl: "",
      category: "",
      source: "manual",
      uid: "",
      seed: index + 1,
    };
  }

  const obj = isRecord(value) ? value : {};
  const displayName = cleanString(obj.displayName, `Jugador ${index + 1}`);
  const id =
    cleanString(obj.id) ||
    cleanString(obj.uid) ||
    buildManualEntryId(displayName, index);

  const rawSource = cleanString(obj.source, "manual");
  const source: ManualPlayerEntry["source"] =
    rawSource === "players" || rawSource === "registration"
      ? rawSource
      : "manual";

  return {
    id,
    displayName,
    photoUrl: cleanString(obj.photoUrl),
    category: cleanString(obj.category),
    source,
    uid: cleanString(obj.uid),
    seed: Math.max(0, cleanNumber(obj.seed, index + 1)),
  };
}

function normalizeManualPlayerEntries(value: unknown): ManualPlayerEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => normalizeManualPlayerEntry(item, index))
    .filter((item) => item.displayName);
}

function buildManualEntriesFromNames(names: string[]): ManualPlayerEntry[] {
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
    entry.uid ? `uid:${normalizeText(entry.uid)}` : "",
    entry.id ? `id:${normalizeText(entry.id)}` : "",
    entry.displayName ? `name:${normalizeText(entry.displayName)}` : "",
  ].filter(Boolean);

  return Array.from(new Set(aliases));
}

function mergeEntryData(
  current: ManualPlayerEntry,
  incoming: ManualPlayerEntry
): ManualPlayerEntry {
  const sourcePriority = {
    manual: 1,
    registration: 2,
    players: 3,
  } as const;

  const source =
    sourcePriority[incoming.source] > sourcePriority[current.source]
      ? incoming.source
      : current.source;

  return {
    id: incoming.id || current.id,
    displayName: incoming.displayName || current.displayName,
    photoUrl: incoming.photoUrl || current.photoUrl,
    category: incoming.category || current.category,
    source,
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
      const entry = normalizeManualPlayerEntry(rawEntry, merged.length);

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

function buildEntryLookup(entries: ManualPlayerEntry[]) {
  const map = new Map<string, ManualPlayerEntry>();

  for (const entry of entries) {
    for (const alias of getEntryAliases(entry)) {
      map.set(alias, entry);
    }
  }

  return map;
}

function resolveEntryFromUnknown(
  value: unknown,
  lookup: Map<string, ManualPlayerEntry>,
  index: number
): ManualPlayerEntry | null {
  if (typeof value === "string") {
    const raw = cleanString(value);
    if (!raw) return null;

    const found =
      lookup.get(`id:${normalizeText(raw)}`) ||
      lookup.get(`uid:${normalizeText(raw)}`) ||
      lookup.get(`name:${normalizeText(raw)}`);

    return found ?? normalizeManualPlayerEntry(raw, index);
  }

  if (!isRecord(value)) return null;

  const normalized = normalizeManualPlayerEntry(value, index);
  const found =
    lookup.get(`id:${normalizeText(normalized.id)}`) ||
    lookup.get(`uid:${normalizeText(normalized.uid)}`) ||
    lookup.get(`name:${normalizeText(normalized.displayName)}`);

  return found ? mergeEntryData(found, normalized) : normalized;
}

function getTournamentEntriesFromState(tournament: Awaited<ReturnType<typeof getTournamentById>>) {
  if (!tournament) return [];

  const fromEntries = normalizeManualPlayerEntries(tournament.manualPlayerEntries);
  if (fromEntries.length > 0) return fromEntries;

  return buildManualEntriesFromNames(tournament.manualPlayers ?? []);
}

function getSortedEntries(entries: ManualPlayerEntry[]): ManualPlayerEntry[] {
  return [...entries].sort((a, b) => {
    if (a.seed !== b.seed) return a.seed - b.seed;
    return a.displayName.localeCompare(b.displayName, "es", {
      sensitivity: "base",
    });
  });
}

function buildInitialStandings(entries: ManualPlayerEntry[]): StandingRow[] {
  return entries.map((entry, index) => ({
    position: index + 1,
    playerId: entry.uid || entry.id || entry.displayName,
    playerName: entry.displayName,
    played: 0,
    wins: 0,
    losses: 0,
    setsFor: 0,
    setsAgainst: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    points: 0,
    setDiff: 0,
    gameDiff: 0,
    qualified: false,
  }));
}

function buildGeneratedGroups(
  entries: ManualPlayerEntry[],
  groupCount: number,
  groupNames: string[]
): GeneratedGroup[] {
  const sortedEntries = getSortedEntries(entries);
  const safeGroupCount = Math.max(
    1,
    groupCount || Math.ceil(sortedEntries.length / 4) || 1
  );

  const groups: GeneratedGroup[] = Array.from({ length: safeGroupCount }, (_, i) => ({
    name: groupNames[i]?.trim() || `Grupo ${String.fromCharCode(65 + i)}`,
    players: [],
    manualPlayerEntries: [],
    standings: [],
  }));

  sortedEntries.forEach((entry, index) => {
    const cycle = Math.floor(index / safeGroupCount);
    const positionInCycle = index % safeGroupCount;
    const targetIndex =
      cycle % 2 === 0
        ? positionInCycle
        : safeGroupCount - 1 - positionInCycle;

    groups[targetIndex].manualPlayerEntries.push(entry);
  });

  return groups.map((group) => {
    const orderedEntries = getSortedEntries(group.manualPlayerEntries);

    return {
      ...group,
      players: orderedEntries.map((entry) => entry.displayName),
      manualPlayerEntries: orderedEntries,
      standings: buildInitialStandings(orderedEntries),
    };
  });
}

function nextPowerOfTwo(value: number): number {
  let power = 1;
  while (power < value) power *= 2;
  return power;
}

function getRoundName(roundIndex: number, totalRounds: number): string {
  const roundsFromEnd = totalRounds - roundIndex;

  if (roundsFromEnd === 1) return "Final";
  if (roundsFromEnd === 2) return "Semifinal";
  if (roundsFromEnd === 3) return "Cuartos de final";
  if (roundsFromEnd === 4) return "Octavos de final";

  return `Ronda ${roundIndex + 1}`;
}

function buildGeneratedBracket(entries: ManualPlayerEntry[]): BracketRound[] {
  const participants = getSortedEntries(entries);

  if (participants.length < 2) return [];

  const bracketSize = Math.max(2, nextPowerOfTwo(participants.length));
  const totalRounds = Math.log2(bracketSize);

  const seeded = [...participants];

  while (seeded.length < bracketSize) {
    seeded.push({
      id: "BYE",
      displayName: "BYE",
      photoUrl: "",
      category: "",
      source: "manual",
      uid: "",
      seed: seeded.length + 1,
    });
  }

  const rounds: BracketRound[] = [];

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex++) {
    const matchCount = Math.pow(2, totalRounds - roundIndex - 1);

    if (roundIndex === 0) {
      rounds.push({
        name: getRoundName(roundIndex, totalRounds),
        matches: Array.from({ length: matchCount }, (_, matchIndex) => {
          const home = seeded[matchIndex * 2];
          const away = seeded[matchIndex * 2 + 1];

          const autoWinner =
            away?.displayName === "BYE"
              ? home
              : home?.displayName === "BYE"
              ? away
              : null;

          return {
            id: `r${roundIndex + 1}m${matchIndex + 1}`,
            home: home?.displayName ?? "",
            away: away?.displayName ?? "",
            homePlayerId: home?.uid || home?.id || "",
            awayPlayerId: away?.uid || away?.id || "",
            winner: autoWinner?.displayName ?? "",
            winnerPlayerId: autoWinner?.uid || autoWinner?.id || "",
            score: autoWinner ? "BYE" : "",
            status: autoWinner ? "completed" : "pending",
            sourceMatchId: "",
            roundIndex,
            matchIndex,
          };
        }),
      });
    } else {
      rounds.push({
        name: getRoundName(roundIndex, totalRounds),
        matches: Array.from({ length: matchCount }, (_, matchIndex) => {
          const prevAId = `r${roundIndex}m${matchIndex * 2 + 1}`;
          const prevBId = `r${roundIndex}m${matchIndex * 2 + 2}`;

          return {
            id: `r${roundIndex + 1}m${matchIndex + 1}`,
            home: "",
            away: "",
            homePlayerId: "",
            awayPlayerId: "",
            winner: "",
            winnerPlayerId: "",
            score: "",
            status: "pending" as const,
            sourceMatchId: `${prevAId}|${prevBId}`,
            roundIndex,
            matchIndex,
          };
        }),
      });
    }
  }

  return rounds;
}

function normalizeStandingRows(value: unknown): StandingRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((row, index) => {
    const item = isRecord(row) ? row : {};
    const setsFor = cleanNumber(item.setsFor, 0);
    const setsAgainst = cleanNumber(item.setsAgainst, 0);
    const gamesFor = cleanNumber(item.gamesFor, 0);
    const gamesAgainst = cleanNumber(item.gamesAgainst, 0);

    return {
      position: Math.max(1, cleanNumber(item.position, index + 1)),
      playerId: cleanString(item.playerId),
      playerName: cleanString(item.playerName),
      played: Math.max(0, cleanNumber(item.played, 0)),
      wins: Math.max(0, cleanNumber(item.wins, 0)),
      losses: Math.max(0, cleanNumber(item.losses, 0)),
      setsFor,
      setsAgainst,
      gamesFor,
      gamesAgainst,
      points: Math.max(0, cleanNumber(item.points, 0)),
      setDiff: cleanNumber(item.setDiff, setsFor - setsAgainst),
      gameDiff: cleanNumber(item.gameDiff, gamesFor - gamesAgainst),
      qualified: Boolean(item.qualified),
    };
  });
}

function normalizeGeneratedGroupsInput(
  value: unknown,
  currentEntries: ManualPlayerEntry[]
): GeneratedGroup[] {
  if (!Array.isArray(value)) return [];

  const lookup = buildEntryLookup(currentEntries);

  return value.map((group, index) => {
    const item = isRecord(group) ? group : {};
    const rawEntries = Array.isArray(item.manualPlayerEntries)
      ? item.manualPlayerEntries
      : Array.isArray(item.players)
      ? item.players
      : [];

    const entries = mergeManualPlayerEntries(
      rawEntries
        .map((entry, entryIndex) =>
          resolveEntryFromUnknown(entry, lookup, entryIndex)
        )
        .filter((entry): entry is ManualPlayerEntry => entry !== null)
    );

    return {
      name: cleanString(item.name, `Grupo ${String.fromCharCode(65 + index)}`),
      players: entries.map((entry) => entry.displayName),
      manualPlayerEntries: entries,
      standings: normalizeStandingRows(item.standings),
    };
  });
}

function normalizeBracketRoundsInput(
  value: unknown,
  currentEntries: ManualPlayerEntry[]
): BracketRound[] {
  if (!Array.isArray(value)) return [];

  const lookup = buildEntryLookup(currentEntries);

  return value.map((round, roundIndex) => {
    const roundObj = isRecord(round) ? round : {};
    const rawMatches = Array.isArray(roundObj.matches) ? roundObj.matches : [];

    return {
      name: cleanString(roundObj.name, `Ronda ${roundIndex + 1}`),
      matches: rawMatches.map((match, matchIndex) => {
        const item = isRecord(match) ? match : {};

        const homeText = cleanString(item.home);
        const awayText = cleanString(item.away);
        const winnerText = cleanString(item.winner);

        const homeEntry =
          resolveEntryFromUnknown(
            {
              id: cleanString(item.homePlayerId),
              displayName: homeText,
              uid: cleanString(item.homePlayerId),
              source: "manual",
            },
            lookup,
            matchIndex * 2
          ) ?? null;

        const awayEntry =
          resolveEntryFromUnknown(
            {
              id: cleanString(item.awayPlayerId),
              displayName: awayText,
              uid: cleanString(item.awayPlayerId),
              source: "manual",
            },
            lookup,
            matchIndex * 2 + 1
          ) ?? null;

        const winnerEntry =
          resolveEntryFromUnknown(
            {
              id: cleanString(item.winnerPlayerId),
              displayName: winnerText,
              uid: cleanString(item.winnerPlayerId),
              source: "manual",
            },
            lookup,
            matchIndex
          ) ?? null;

        return {
          id: cleanString(item.id, `r${roundIndex + 1}m${matchIndex + 1}`),
          home: homeEntry?.displayName || homeText,
          away: awayEntry?.displayName || awayText,
          homePlayerId:
            cleanString(item.homePlayerId) ||
            homeEntry?.uid ||
            homeEntry?.id ||
            "",
          awayPlayerId:
            cleanString(item.awayPlayerId) ||
            awayEntry?.uid ||
            awayEntry?.id ||
            "",
          winner: winnerEntry?.displayName || winnerText,
          winnerPlayerId:
            cleanString(item.winnerPlayerId) ||
            winnerEntry?.uid ||
            winnerEntry?.id ||
            "",
          score: cleanString(item.score),
          status: item.status === "completed" ? "completed" : "pending",
          sourceMatchId: cleanString(item.sourceMatchId),
          roundIndex: cleanNumber(item.roundIndex, roundIndex),
          matchIndex: cleanNumber(item.matchIndex, matchIndex),
        };
      }),
    };
  });
}

function buildResultPairKey(home: string, away: string): string {
  const normalized = [normalizeText(home), normalizeText(away)].sort();
  return normalized.join("__");
}

function isFinalResult(result: AppMatchLite): boolean {
  const status = normalizeToken(result.status);
  const finalStatuses = new Set([
    "completed",
    "confirmed",
    "approved",
    "accepted",
    "closed",
    "resolved",
  ]);

  const negativeStatuses = new Set([
    "pending",
    "review",
    "sent",
    "draft",
    "rejected",
    "disputed",
    "cancelled",
    "canceled",
  ]);

  if (finalStatuses.has(status)) return true;
  if (negativeStatuses.has(status)) return false;

  if (result.winner && (result.score.trim() || result.scoreSets.length > 0)) {
    return true;
  }

  return false;
}

function collapseMatchResults(results: AppMatchLite[]): AppMatchLite[] {
  const map = new Map<string, AppMatchLite>();

  for (const result of results) {
    if (!result.home || !result.away) continue;

    const key = buildResultPairKey(result.home, result.away);
    const current = map.get(key);

    if (!current) {
      map.set(key, result);
      continue;
    }

    const currentIsFinal = isFinalResult(current);
    const nextIsFinal = isFinalResult(result);

    if (nextIsFinal && !currentIsFinal) {
      map.set(key, result);
      continue;
    }

    if (nextIsFinal === currentIsFinal && result.updatedAtMs > current.updatedAtMs) {
      map.set(key, result);
    }
  }

  return [...map.values()];
}

function buildStandingsFromResults(
  group: GeneratedGroup,
  results: AppMatchLite[]
): StandingRow[] {
  const entries =
    group.manualPlayerEntries.length > 0
      ? group.manualPlayerEntries
      : buildManualEntriesFromNames(group.players);

  const rows: StandingRow[] = entries.map((entry, index) => ({
    position: index + 1,
    playerId: entry.uid || entry.id || entry.displayName,
    playerName: entry.displayName,
    played: 0,
    wins: 0,
    losses: 0,
    setsFor: 0,
    setsAgainst: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    points: 0,
    setDiff: 0,
    gameDiff: 0,
    qualified: false,
  }));

  const rowMap = new Map(rows.map((row) => [normalizeText(row.playerName), row]));
  const finalResults = collapseMatchResults(results).filter(isFinalResult);

  const groupResults = finalResults.filter((result) => {
    const home = normalizeText(result.home);
    const away = normalizeText(result.away);
    return rowMap.has(home) && rowMap.has(away);
  });

  for (const result of groupResults) {
    const homeRow = rowMap.get(normalizeText(result.home));
    const awayRow = rowMap.get(normalizeText(result.away));

    if (!homeRow || !awayRow) continue;

    homeRow.played += 1;
    awayRow.played += 1;

    const scorePairs =
      result.scoreSets.length > 0
        ? result.scoreSets.map((s) => [s.homeGames, s.awayGames] as [number, number])
        : parseScorePairs(result.score);

    let homeSetsWon = 0;
    let awaySetsWon = 0;

    for (const [homeGames, awayGames] of scorePairs) {
      homeRow.gamesFor += homeGames;
      homeRow.gamesAgainst += awayGames;
      awayRow.gamesFor += awayGames;
      awayRow.gamesAgainst += homeGames;

      if (homeGames > awayGames) homeSetsWon += 1;
      if (awayGames > homeGames) awaySetsWon += 1;
    }

    homeRow.setsFor += homeSetsWon;
    homeRow.setsAgainst += awaySetsWon;
    awayRow.setsFor += awaySetsWon;
    awayRow.setsAgainst += homeSetsWon;

    let winner = result.winner;
    if (!winner && homeSetsWon !== awaySetsWon) {
      winner = homeSetsWon > awaySetsWon ? result.home : result.away;
    }

    if (normalizeText(winner) === normalizeText(result.home)) {
      homeRow.wins += 1;
      awayRow.losses += 1;
      homeRow.points += 1;
    } else if (normalizeText(winner) === normalizeText(result.away)) {
      awayRow.wins += 1;
      homeRow.losses += 1;
      awayRow.points += 1;
    }
  }

  return [...rowMap.values()]
    .map((row) => ({
      ...row,
      setDiff: row.setsFor - row.setsAgainst,
      gameDiff: row.gamesFor - row.gamesAgainst,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.setDiff !== a.setDiff) return b.setDiff - a.setDiff;
      if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;

      return a.playerName.localeCompare(b.playerName, "es", {
        sensitivity: "base",
      });
    })
    .map((row, index) => ({
      ...row,
      position: index + 1,
      qualified: index < 2,
    }));
}

function getQualifiedEntriesFromGroups(
  groups: GeneratedGroup[],
  playersPerGroup = 2
): ManualPlayerEntry[] {
  const qualified: ManualPlayerEntry[] = [];

  for (const group of groups) {
    const entryLookup = buildEntryLookup(group.manualPlayerEntries);
    const standings =
      group.standings.length > 0
        ? group.standings
        : buildInitialStandings(group.manualPlayerEntries);

    for (const row of standings.slice(0, playersPerGroup)) {
      const byId = row.playerId
        ? entryLookup.get(`id:${normalizeText(row.playerId)}`) ||
          entryLookup.get(`uid:${normalizeText(row.playerId)}`)
        : null;

      const byName = entryLookup.get(`name:${normalizeText(row.playerName)}`);

      const resolved =
        byId ||
        byName ||
        normalizeManualPlayerEntry(
          {
            id: row.playerId || buildManualEntryId(row.playerName, qualified.length),
            displayName: row.playerName,
            source: "manual",
          },
          qualified.length
        );

      qualified.push(resolved);
    }
  }

  return mergeManualPlayerEntries(qualified);
}

function findResultForPair(
  results: AppMatchLite[],
  home: string,
  away: string
): AppMatchLite | null {
  const key = buildResultPairKey(home, away);
  return collapseMatchResults(results).find(
    (item) => buildResultPairKey(item.home, item.away) === key
  ) ?? null;
}

function hydrateBracketWithResults(
  bracket: BracketRound[],
  results: AppMatchLite[],
  allEntries: ManualPlayerEntry[]
): BracketRound[] {
  const lookup = buildEntryLookup(allEntries);

  const rounds = normalizeBracketRoundsInput(bracket, allEntries).map((round) => ({
    ...round,
    matches: round.matches.map((match) => ({ ...match })),
  }));

  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex++) {
    if (roundIndex > 0) {
      const previousRound = rounds[roundIndex - 1];
      const currentRound = rounds[roundIndex];

      currentRound.matches = currentRound.matches.map((match, matchIndex) => {
        const sourceA = previousRound.matches[matchIndex * 2];
        const sourceB = previousRound.matches[matchIndex * 2 + 1];

        return {
          ...match,
          home: sourceA?.winner || match.home || "",
          away: sourceB?.winner || match.away || "",
          homePlayerId: sourceA?.winnerPlayerId || match.homePlayerId || "",
          awayPlayerId: sourceB?.winnerPlayerId || match.awayPlayerId || "",
        };
      });
    }

    rounds[roundIndex].matches = rounds[roundIndex].matches.map((match) => {
      let winner = match.winner;
      let winnerPlayerId = match.winnerPlayerId;
      let score = match.score;
      let status = match.status;

      if (match.home === "BYE" && match.away) {
        winner = match.away;
        winnerPlayerId = match.awayPlayerId;
        score = "BYE";
        status = "completed";
      } else if (match.away === "BYE" && match.home) {
        winner = match.home;
        winnerPlayerId = match.homePlayerId;
        score = "BYE";
        status = "completed";
      } else if (match.home && match.away) {
        const result = findResultForPair(results, match.home, match.away);

        if (result && isFinalResult(result)) {
          winner = result.winner || winner;
          score = result.score || score;
          status = "completed";

          const winnerEntry =
            lookup.get(`name:${normalizeText(winner)}`) ||
            lookup.get(`id:${normalizeText(winner)}`) ||
            lookup.get(`uid:${normalizeText(winner)}`);

          winnerPlayerId =
            winnerEntry?.uid ||
            winnerEntry?.id ||
            winnerPlayerId ||
            "";
        }
      }

      return {
        ...match,
        winner,
        winnerPlayerId,
        score,
        status,
      };
    });
  }

  return rounds;
}

async function requireTournament(tournamentId: string) {
  const tournament = await getTournamentById(tournamentId);

  if (!tournament) {
    throw new Error("Torneo no encontrado");
  }

  return tournament;
}

function buildRegistrationEntries(
  registrations: Awaited<ReturnType<typeof listTournamentRegistrations>>
): ManualPlayerEntry[] {
  const preferredStatuses = new Set([
    "accepted",
    "approved",
    "confirmed",
    "paid",
    "registered",
    "active",
  ]);

  const preferred = registrations.filter((item) =>
    preferredStatuses.has(normalizeToken(item.status || ""))
  );

  const source = preferred.length > 0 ? preferred : registrations;

  return source.reduce<ManualPlayerEntry[]>((acc, registration, index) => {
    const displayName = cleanString(
      registration.displayName || registration.userId,
      `Inscrito ${index + 1}`
    );

    if (!displayName) {
      return acc;
    }

    acc.push({
      id:
        cleanString(registration.userId || registration.id) ||
        `registration_${index + 1}`,
      displayName,
      photoUrl: "",
      category: cleanString(registration.category),
      source: "registration",
      uid: cleanString(registration.userId || registration.id),
      seed: index + 1,
    });

    return acc;
  }, []);
}

async function loadTournamentResultsLite(tournamentId: string): Promise<AppMatchLite[]> {
  const snapshot = await dbAdmin
    .collection("matches")
    .where("tournamentId", "==", tournamentId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() ?? {};

    return {
      id: doc.id,
      home:
        readFirstString(data, [
          "homePlayerName",
          "player1Name",
          "challengerName",
          "localPlayerName",
          "userAName",
        ]) ||
        cleanString(data.homeName) ||
        cleanString(data.playerAName),
      away:
        readFirstString(data, [
          "awayPlayerName",
          "player2Name",
          "challengedName",
          "visitorPlayerName",
          "userBName",
        ]) ||
        cleanString(data.awayName) ||
        cleanString(data.playerBName),
      winner: readFirstString(data, [
        "winnerName",
        "winner",
        "winnerPlayerName",
      ]),
      score: readFirstString(data, [
        "scoreText",
        "score",
        "resultText",
        "finalScore",
      ]),
      scoreSets: extractScoreSets(data),
      status:
        readFirstString(data, [
          "status",
          "resultStatus",
          "matchStatus",
          "approvalStatus",
        ]) || "pending",
      updatedAtMs: Math.max(
        toMillis(data.updatedAt),
        toMillis(data.resultUpdatedAt),
        toMillis(data.createdAt)
      ),
    };
  });
}

export async function saveManualPlayersAction(
  tournamentId: string,
  formData: FormData
) {
  const tournament = await requireTournament(tournamentId);
  const currentEntries = getTournamentEntriesFromState(tournament);

  const manualNames = uniqueNames(parseLines(formData, "manualPlayersText"));
  const manualEntries = buildManualEntriesFromNames(manualNames);

  const preservedNonManualEntries = currentEntries.filter(
    (entry) => entry.source === "players" || entry.source === "registration"
  );

  const mergedEntries = mergeManualPlayerEntries(
    preservedNonManualEntries,
    manualEntries
  );

  await setTournamentManualPlayers(
    tournamentId,
    mergedEntries.map((entry) => entry.displayName),
    mergedEntries
  );

  revalidateTournamentViews(tournamentId);
}

export async function syncPlayersFromRegistrationsAction(tournamentId: string) {
  const tournament = await requireTournament(tournamentId);
  const currentEntries = getTournamentEntriesFromState(tournament);
  const registrations = await listTournamentRegistrations(tournamentId);

  const registrationEntries = buildRegistrationEntries(registrations);
  const mergedEntries = mergeManualPlayerEntries(
    currentEntries,
    registrationEntries
  );

  await setTournamentManualPlayers(
    tournamentId,
    mergedEntries.map((entry) => entry.displayName),
    mergedEntries
  );

  revalidateTournamentViews(tournamentId);
}

export async function generateGroupsAction(tournamentId: string) {
  const tournament = await requireTournament(tournamentId);
  const currentEntries = getTournamentEntriesFromState(tournament);

  if (!currentEntries.length) {
    throw new Error("Primero agrega jugadores al torneo");
  }

  const results = await loadTournamentResultsLite(tournamentId);
  const groups = buildGeneratedGroups(
    currentEntries,
    tournament.groupCount || 0,
    tournament.groupNames || []
  ).map((group) => ({
    ...group,
    standings: buildStandingsFromResults(group, results),
  }));

  await setTournamentGeneratedGroups(tournamentId, groups);
  revalidateTournamentViews(tournamentId);
}

export async function generateBracketAction(tournamentId: string) {
  const tournament = await requireTournament(tournamentId);
  const currentEntries = getTournamentEntriesFromState(tournament);

  if (currentEntries.length < 2) {
    throw new Error("Necesitas al menos 2 jugadores para generar llaves");
  }

  const results = await loadTournamentResultsLite(tournamentId);
  const bracket = hydrateBracketWithResults(
    buildGeneratedBracket(currentEntries),
    results,
    currentEntries
  );

  await setTournamentGeneratedBracket(tournamentId, bracket);
  revalidateTournamentViews(tournamentId);
}

export async function generateBracketFromGroupsAction(tournamentId: string) {
  const tournament = await requireTournament(tournamentId);
  const currentEntries = getTournamentEntriesFromState(tournament);

  if (!tournament.generatedGroups.length) {
    throw new Error("Primero genera la tabla de grupos");
  }

  const results = await loadTournamentResultsLite(tournamentId);
  const rebuiltGroups = normalizeGeneratedGroupsInput(
    tournament.generatedGroups,
    currentEntries
  ).map((group) => ({
    ...group,
    standings: buildStandingsFromResults(group, results),
  }));

  const qualifiedEntries = getQualifiedEntriesFromGroups(rebuiltGroups, 2);

  if (qualifiedEntries.length < 2) {
    throw new Error("No hay suficientes clasificados para generar las llaves");
  }

  const bracket = hydrateBracketWithResults(
    buildGeneratedBracket(qualifiedEntries),
    results,
    currentEntries
  );

  await setTournamentComputedState(tournamentId, {
    generatedGroups: rebuiltGroups,
    generatedBracket: bracket,
  });

  revalidateTournamentViews(tournamentId);
}

export async function recomputeTournamentFromResultsAction(tournamentId: string) {
  const tournament = await requireTournament(tournamentId);
  const currentEntries = getTournamentEntriesFromState(tournament);
  const results = await loadTournamentResultsLite(tournamentId);

  const groups =
    tournament.generatedGroups.length > 0
      ? normalizeGeneratedGroupsInput(tournament.generatedGroups, currentEntries)
      : currentEntries.length > 0
      ? buildGeneratedGroups(
          currentEntries,
          tournament.groupCount || 0,
          tournament.groupNames || []
        )
      : [];

  const rebuiltGroups = groups.map((group) => ({
    ...group,
    standings: buildStandingsFromResults(group, results),
  }));

  const qualifiedEntries = rebuiltGroups.length
    ? getQualifiedEntriesFromGroups(rebuiltGroups, 2)
    : [];

  const bracketBase =
    tournament.generatedBracket.length > 0
      ? normalizeBracketRoundsInput(tournament.generatedBracket, currentEntries)
      : qualifiedEntries.length >= 2
      ? buildGeneratedBracket(qualifiedEntries)
      : [];

  const hydratedBracket = hydrateBracketWithResults(
    bracketBase,
    results,
    currentEntries
  );

  await setTournamentComputedState(tournamentId, {
    generatedGroups: rebuiltGroups,
    generatedBracket: hydratedBracket,
  });

  revalidateTournamentViews(tournamentId);
}

export async function saveGroupAssignmentsAction(
  tournamentId: string,
  formData: FormData
) {
  const tournament = await requireTournament(tournamentId);
  const currentEntries = getTournamentEntriesFromState(tournament);

  const raw = String(formData.get("generatedGroupsJson") ?? "").trim();

  let parsed: unknown = [];
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    throw new Error("El JSON de grupos no es válido");
  }

  const results = await loadTournamentResultsLite(tournamentId);
  const groups = normalizeGeneratedGroupsInput(parsed, currentEntries).map((group) => {
    const mergedEntries = mergeManualPlayerEntries(group.manualPlayerEntries);

    const rebuiltGroup: GeneratedGroup = {
      ...group,
      players: mergedEntries.map((entry) => entry.displayName),
      manualPlayerEntries: mergedEntries,
      standings: [],
    };

    return {
      ...rebuiltGroup,
      standings: buildStandingsFromResults(rebuiltGroup, results),
    };
  });

  const mergedEntries = mergeManualPlayerEntries(
    ...groups.map((group) => group.manualPlayerEntries)
  );

  await updateTournament(tournamentId, {
    manualPlayers: mergedEntries.map((entry) => entry.displayName),
    manualPlayerEntries: mergedEntries,
    generatedGroups: groups,
  });

  revalidateTournamentViews(tournamentId);
}

export async function saveBracketSlotsAction(
  tournamentId: string,
  formData: FormData
) {
  const tournament = await requireTournament(tournamentId);
  const currentEntries = getTournamentEntriesFromState(tournament);

  const raw = String(formData.get("generatedBracketJson") ?? "").trim();

  let parsed: unknown = [];
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    throw new Error("El JSON de llaves no es válido");
  }

  const results = await loadTournamentResultsLite(tournamentId);
  const generatedBracket = hydrateBracketWithResults(
    normalizeBracketRoundsInput(parsed, currentEntries),
    results,
    currentEntries
  );

  await updateTournament(tournamentId, {
    generatedBracket,
  });

  revalidateTournamentViews(tournamentId);
}

export async function resetGroupsAction(tournamentId: string) {
  await updateTournament(tournamentId, {
    generatedGroups: [],
  });

  revalidateTournamentViews(tournamentId);
}

export async function resetBracketAction(tournamentId: string) {
  await updateTournament(tournamentId, {
    generatedBracket: [],
  });

  revalidateTournamentViews(tournamentId);
}

export async function resetTournamentStructuresAction(tournamentId: string) {
  await updateTournament(tournamentId, {
    generatedGroups: [],
    generatedBracket: [],
  });

  revalidateTournamentViews(tournamentId);
}


