"use client";

import { useMemo, useState } from "react";

type PlayerSource = "manual" | "players" | "registration";

type ManualPlayerEntry = {
  id: string;
  displayName: string;
  photoUrl: string;
  category: string;
  source: PlayerSource;
  uid: string;
  seed: number;
};

type BracketMatch = {
  id: string;
  home: string;
  away: string;
  homePlayerId: string;
  awayPlayerId: string;
  winner: string;
  winnerPlayerId: string;
  score: string;
  status: "pending" | "completed";
  sourceMatchId: string;
  roundIndex: number;
  matchIndex: number;
};

type BracketRound = {
  name: string;
  matches: BracketMatch[];
};

type SlotSide = "home" | "away";

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function buildManualId(displayName: string, index: number): string {
  const base = displayName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `manual_${base || index + 1}`;
}

function normalizeEntry(value: unknown, index: number): ManualPlayerEntry {
  if (typeof value === "string") {
    const displayName = cleanString(value, `Jugador ${index + 1}`);

    return {
      id: buildManualId(displayName, index),
      displayName,
      photoUrl: "",
      category: "",
      source: "manual",
      uid: "",
      seed: index + 1,
    };
  }

  const obj =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};

  const displayName = cleanString(obj.displayName, `Jugador ${index + 1}`);
  const id =
    cleanString(obj.id) ||
    cleanString(obj.uid) ||
    buildManualId(displayName, index);

  const rawSource = cleanString(obj.source, "manual");
  const source: PlayerSource =
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
    seed: Number.isFinite(Number(obj.seed)) ? Number(obj.seed) : index + 1,
  };
}

function playerKey(entry: Partial<ManualPlayerEntry>): string {
  return normalizeText(entry.uid || entry.id || entry.displayName || "");
}

function uniqueEntries(entries: ManualPlayerEntry[]): ManualPlayerEntry[] {
  const map = new Map<string, ManualPlayerEntry>();

  for (const entry of entries) {
    const key = playerKey(entry);
    if (!key) continue;

    const current = map.get(key);

    if (!current) {
      map.set(key, entry);
    } else {
      map.set(key, {
        ...current,
        displayName: entry.displayName || current.displayName,
        photoUrl: entry.photoUrl || current.photoUrl,
        category: entry.category || current.category,
        source:
          entry.source === "players" || entry.source === "registration"
            ? entry.source
            : current.source,
        uid: entry.uid || current.uid,
      });
    }
  }

  return [...map.values()].map((entry, index) => ({
    ...entry,
    seed: index + 1,
  }));
}

function buildLookup(entries: ManualPlayerEntry[]) {
  const map = new Map<string, ManualPlayerEntry>();

  for (const entry of entries) {
    if (entry.uid) map.set(`uid:${normalizeText(entry.uid)}`, entry);
    if (entry.id) map.set(`id:${normalizeText(entry.id)}`, entry);
    if (entry.displayName) map.set(`name:${normalizeText(entry.displayName)}`, entry);
  }

  return map;
}

function resolveEntry(
  rawName: string,
  rawId: string,
  lookup: Map<string, ManualPlayerEntry>,
  fallbackIndex: number
): ManualPlayerEntry | null {
  const found =
    (rawId &&
      (lookup.get(`uid:${normalizeText(rawId)}`) ||
        lookup.get(`id:${normalizeText(rawId)}`))) ||
    (rawName && lookup.get(`name:${normalizeText(rawName)}`));

  if (found) return found;
  if (!rawName) return null;

  return normalizeEntry(
    {
      id: rawId || buildManualId(rawName, fallbackIndex),
      displayName: rawName,
      uid: rawId,
      source: "manual",
    },
    fallbackIndex
  );
}

function cleanPool(playerPool: string[], playerEntries: ManualPlayerEntry[]) {
  if (playerEntries?.length > 0) {
    return uniqueEntries(
      playerEntries.map((entry, index) => normalizeEntry(entry, index))
    );
  }

  return uniqueEntries(
    (playerPool ?? []).map((player, index) => normalizeEntry(player, index))
  );
}

function normalizeRounds(
  initialRounds: BracketRound[],
  poolEntries: ManualPlayerEntry[]
): BracketRound[] {
  const lookup = buildLookup(poolEntries);

  if (initialRounds?.length) {
    return initialRounds.map((round, roundIndex) => ({
      name: round.name || `Ronda ${roundIndex + 1}`,
      matches: (round.matches ?? []).map((match, matchIndex) => {
        const homeEntry = resolveEntry(
          cleanString(match.home),
          cleanString(match.homePlayerId),
          lookup,
          matchIndex * 2
        );

        const awayEntry = resolveEntry(
          cleanString(match.away),
          cleanString(match.awayPlayerId),
          lookup,
          matchIndex * 2 + 1
        );

        const winnerEntry = resolveEntry(
          cleanString(match.winner),
          cleanString(match.winnerPlayerId),
          lookup,
          matchIndex
        );

        return {
          id: match.id || `r${roundIndex + 1}m${matchIndex + 1}`,
          home: homeEntry?.displayName || cleanString(match.home),
          away: awayEntry?.displayName || cleanString(match.away),
          homePlayerId:
            cleanString(match.homePlayerId) ||
            homeEntry?.uid ||
            homeEntry?.id ||
            "",
          awayPlayerId:
            cleanString(match.awayPlayerId) ||
            awayEntry?.uid ||
            awayEntry?.id ||
            "",
          winner: winnerEntry?.displayName || cleanString(match.winner),
          winnerPlayerId:
            cleanString(match.winnerPlayerId) ||
            winnerEntry?.uid ||
            winnerEntry?.id ||
            "",
          score: cleanString(match.score),
          status: match.status === "completed" ? "completed" : "pending",
          sourceMatchId: cleanString(match.sourceMatchId),
          roundIndex:
            Number.isFinite(Number(match.roundIndex))
              ? Number(match.roundIndex)
              : roundIndex,
          matchIndex:
            Number.isFinite(Number(match.matchIndex))
              ? Number(match.matchIndex)
              : matchIndex,
        };
      }),
    }));
  }

  return [
    {
      name: "Final",
      matches: [
        {
          id: "r1m1",
          home: "",
          away: "",
          homePlayerId: "",
          awayPlayerId: "",
          winner: "",
          winnerPlayerId: "",
          score: "",
          status: "pending",
          sourceMatchId: "",
          roundIndex: 0,
          matchIndex: 0,
        },
      ],
    },
  ];
}

function cloneRounds(rounds: BracketRound[]): BracketRound[] {
  return rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => ({ ...match })),
  }));
}

function sanitizeWinner(match: BracketMatch): BracketMatch {
  const homeKey = normalizeText(match.home);
  const awayKey = normalizeText(match.away);
  const winnerKey = normalizeText(match.winner);

  if (!match.home && !match.away) {
    return {
      ...match,
      winner: "",
      winnerPlayerId: "",
      status: "pending",
      score: "",
    };
  }

  if (match.home === "BYE" && match.away) {
    return {
      ...match,
      winner: match.away,
      winnerPlayerId: match.awayPlayerId,
      status: "completed",
      score: match.score || "BYE",
    };
  }

  if (match.away === "BYE" && match.home) {
    return {
      ...match,
      winner: match.home,
      winnerPlayerId: match.homePlayerId,
      status: "completed",
      score: match.score || "BYE",
    };
  }

  const winnerIsHome = winnerKey && winnerKey === homeKey;
  const winnerIsAway = winnerKey && winnerKey === awayKey;

  if (!winnerIsHome && !winnerIsAway) {
    return {
      ...match,
      winner: "",
      winnerPlayerId: "",
      status: "pending",
    };
  }

  return {
    ...match,
    winner: winnerIsHome ? match.home : match.away,
    winnerPlayerId: winnerIsHome ? match.homePlayerId : match.awayPlayerId,
    status: "completed",
  };
}

function propagateWinners(rounds: BracketRound[]): BracketRound[] {
  const next = cloneRounds(rounds);

  for (let roundIndex = 0; roundIndex < next.length; roundIndex++) {
    next[roundIndex].matches = next[roundIndex].matches.map((match) =>
      sanitizeWinner(match)
    );

    if (roundIndex === 0) continue;

    const previousRound = next[roundIndex - 1];

    next[roundIndex].matches = next[roundIndex].matches.map((match, matchIndex) => {
      const leftSource = previousRound.matches[matchIndex * 2];
      const rightSource = previousRound.matches[matchIndex * 2 + 1];

      const updated: BracketMatch = {
        ...match,
        home: leftSource?.winner || "",
        away: rightSource?.winner || "",
        homePlayerId: leftSource?.winnerPlayerId || "",
        awayPlayerId: rightSource?.winnerPlayerId || "",
      };

      return sanitizeWinner(updated);
    });
  }

  return next.map((round, roundIndex) => ({
    name: cleanString(round.name, `Ronda ${roundIndex + 1}`),
    matches: round.matches.map((match, matchIndex) => ({
      ...match,
      id: match.id || `r${roundIndex + 1}m${matchIndex + 1}`,
      roundIndex,
      matchIndex,
    })),
  }));
}

function sourceLabel(source: PlayerSource): string {
  if (source === "players") return "App";
  if (source === "registration") return "Inscrito";
  return "Manual";
}

export default function BracketDnDEditor({
  initialRounds,
  playerPool = [],
  playerEntries = [],
  action,
}: {
  initialRounds: BracketRound[];
  playerPool?: string[];
  playerEntries?: ManualPlayerEntry[];
  action: (formData: FormData) => void;
}) {
  const pool = useMemo(
    () => cleanPool(playerPool ?? [], playerEntries ?? []),
    [playerPool, playerEntries]
  );

  const [rounds, setRounds] = useState<BracketRound[]>(
    propagateWinners(normalizeRounds(initialRounds ?? [], pool))
  );
  const [dragEntry, setDragEntry] = useState<ManualPlayerEntry | null>(null);

  function persist(next: BracketRound[]) {
    setRounds(propagateWinners(next));
  }

  function addRound() {
    persist([
      ...rounds,
      {
        name: `Ronda ${rounds.length + 1}`,
        matches: [
          {
            id: `r${rounds.length + 1}m1`,
            home: "",
            away: "",
            homePlayerId: "",
            awayPlayerId: "",
            winner: "",
            winnerPlayerId: "",
            score: "",
            status: "pending",
            sourceMatchId: "",
            roundIndex: rounds.length,
            matchIndex: 0,
          },
        ],
      },
    ]);
  }

  function removeRound(roundIndex: number) {
    if (rounds.length <= 1) return;
    persist(rounds.filter((_, index) => index !== roundIndex));
  }

  function addMatch(roundIndex: number) {
    const next = [...rounds];

    next[roundIndex] = {
      ...next[roundIndex],
      matches: [
        ...next[roundIndex].matches,
        {
          id: `r${roundIndex + 1}m${next[roundIndex].matches.length + 1}`,
          home: "",
          away: "",
          homePlayerId: "",
          awayPlayerId: "",
          winner: "",
          winnerPlayerId: "",
          score: "",
          status: "pending",
          sourceMatchId: "",
          roundIndex,
          matchIndex: next[roundIndex].matches.length,
        },
      ],
    };

    persist(next);
  }

  function renameRound(roundIndex: number, value: string) {
    const next = [...rounds];
    next[roundIndex] = { ...next[roundIndex], name: value };
    persist(next);
  }

  function removeMatch(roundIndex: number, matchIndex: number) {
    const next = [...rounds];
    next[roundIndex] = {
      ...next[roundIndex],
      matches: next[roundIndex].matches.filter((_, i) => i !== matchIndex),
    };
    persist(next);
  }

  function assignToSlot(roundIndex: number, matchIndex: number, side: SlotSide) {
    if (!dragEntry) return;

    const next = [...rounds];
    const match = { ...next[roundIndex].matches[matchIndex] };

    if (side === "home") {
      match.home = dragEntry.displayName;
      match.homePlayerId = dragEntry.uid || dragEntry.id;

      if (
        match.awayPlayerId &&
        normalizeText(match.awayPlayerId) === normalizeText(match.homePlayerId)
      ) {
        match.away = "";
        match.awayPlayerId = "";
      }
    } else {
      match.away = dragEntry.displayName;
      match.awayPlayerId = dragEntry.uid || dragEntry.id;

      if (
        match.homePlayerId &&
        normalizeText(match.homePlayerId) === normalizeText(match.awayPlayerId)
      ) {
        match.home = "";
        match.homePlayerId = "";
      }
    }

    next[roundIndex].matches[matchIndex] = match;
    persist(next);
    setDragEntry(null);
  }

  function updateScore(roundIndex: number, matchIndex: number, value: string) {
    const next = [...rounds];
    next[roundIndex].matches[matchIndex] = {
      ...next[roundIndex].matches[matchIndex],
      score: value,
    };
    persist(next);
  }

  function selectWinner(roundIndex: number, matchIndex: number, value: string) {
    const next = [...rounds];
    const match = { ...next[roundIndex].matches[matchIndex] };

    if (value === "home") {
      match.winner = match.home;
      match.winnerPlayerId = match.homePlayerId;
      match.status = match.home ? "completed" : "pending";
    } else if (value === "away") {
      match.winner = match.away;
      match.winnerPlayerId = match.awayPlayerId;
      match.status = match.away ? "completed" : "pending";
    } else {
      match.winner = "";
      match.winnerPlayerId = "";
      match.status = "pending";
    }

    next[roundIndex].matches[matchIndex] = match;
    persist(next);
  }

  function clearSlot(roundIndex: number, matchIndex: number, side: SlotSide) {
    const next = [...rounds];
    const match = { ...next[roundIndex].matches[matchIndex] };

    if (side === "home") {
      const currentHome = match.home;
      match.home = "";
      match.homePlayerId = "";

      if (normalizeText(match.winner) === normalizeText(currentHome)) {
        match.winner = "";
        match.winnerPlayerId = "";
        match.status = "pending";
      }
    } else {
      const currentAway = match.away;
      match.away = "";
      match.awayPlayerId = "";

      if (normalizeText(match.winner) === normalizeText(currentAway)) {
        match.winner = "";
        match.winnerPlayerId = "";
        match.status = "pending";
      }
    }

    next[roundIndex].matches[matchIndex] = match;
    persist(next);
  }

  function winnerValue(match: BracketMatch): string {
    if (match.winner && normalizeText(match.winner) === normalizeText(match.home)) {
      return "home";
    }

    if (match.winner && normalizeText(match.winner) === normalizeText(match.away)) {
      return "away";
    }

    return "";
  }

  return (
    <form action={action} className="space-y-4">
      <input
        type="hidden"
        name="generatedBracketJson"
        value={JSON.stringify(rounds)}
        readOnly
      />

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-zinc-800">
          Pool de jugadores
        </div>

        <div className="flex flex-wrap gap-2">
          {pool.length ? (
            pool.map((entry) => (
              <div
                key={playerKey(entry)}
                draggable
                onDragStart={() => setDragEntry(entry)}
                className="cursor-move rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800"
              >
                <div className="flex flex-col">
                  <span>{entry.displayName}</span>
                  <span className="text-[10px] text-zinc-500">
                    {sourceLabel(entry.source)}
                    {entry.category ? ` · ${entry.category}` : ""}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-zinc-500">
              No hay jugadores en el pool.
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={addRound}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Añadir ronda
        </button>

        <button
          type="submit"
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Guardar llaves editadas
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-4">
          {rounds.map((round, roundIndex) => (
            <div
              key={`${round.name}-${roundIndex}`}
              className="w-80 shrink-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <input
                  value={round.name}
                  onChange={(e) => renameRound(roundIndex, e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
                />

                <button
                  type="button"
                  onClick={() => addMatch(roundIndex)}
                  className="rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  +
                </button>

                <button
                  type="button"
                  onClick={() => removeRound(roundIndex)}
                  className="rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {round.matches.map((match, matchIndex) => (
                  <div
                    key={match.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
                  >
                    {(["home", "away"] as SlotSide[]).map((side) => (
                      <div
                        key={side}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => assignToSlot(roundIndex, matchIndex, side)}
                        className="mb-2 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                      >
                        <div className="flex flex-col">
                          <span>{match[side] || "Suelta jugador aquí"}</span>
                          <span className="text-[10px] text-zinc-500">
                            {side === "home"
                              ? match.homePlayerId || "Sin ID"
                              : match.awayPlayerId || "Sin ID"}
                          </span>
                        </div>

                        {match[side] ? (
                          <button
                            type="button"
                            onClick={() => clearSlot(roundIndex, matchIndex, side)}
                            className="text-xs text-rose-600"
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                    ))}

                    <input
                      value={match.score}
                      onChange={(e) =>
                        updateScore(roundIndex, matchIndex, e.target.value)
                      }
                      placeholder="Score"
                      className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
                    />

                    <select
                      value={winnerValue(match)}
                      onChange={(e) =>
                        selectWinner(roundIndex, matchIndex, e.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
                    >
                      <option value="">Ganador por definir</option>
                      <option value="home" disabled={!match.home}>
                        {match.home ? `Ganador: ${match.home}` : "Local vacío"}
                      </option>
                      <option value="away" disabled={!match.away}>
                        {match.away ? `Ganador: ${match.away}` : "Visitante vacío"}
                      </option>
                    </select>

                    <div className="mt-2 text-xs text-zinc-500">
                      Estado: {match.status}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeMatch(roundIndex, matchIndex)}
                      className="mt-3 rounded-xl border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                    >
                      Eliminar cruce
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </form>
  );
}