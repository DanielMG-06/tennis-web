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

type StandingRow = {
  position: number;
  playerId: string;
  playerName: string;
  played: number;
  wins: number;
  losses: number;
  setsFor: number;
  setsAgainst: number;
  gamesFor: number;
  gamesAgainst: number;
  points: number;
  setDiff: number;
  gameDiff: number;
  qualified: boolean;
};

type GeneratedGroup = {
  name: string;
  players: string[];
  manualPlayerEntries: ManualPlayerEntry[];
  standings: StandingRow[];
};

type DragPayload = {
  entry: ManualPlayerEntry;
  fromGroupIndex: number;
};

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

function entryKey(entry: Partial<ManualPlayerEntry>): string {
  return normalizeText(
    entry.uid || entry.id || entry.displayName || Math.random().toString()
  );
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

function mergeEntry(
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

function uniqueEntries(entries: ManualPlayerEntry[]): ManualPlayerEntry[] {
  const map = new Map<string, ManualPlayerEntry>();

  for (const rawEntry of entries) {
    const key = entryKey(rawEntry);
    const current = map.get(key);

    if (!current) {
      map.set(key, rawEntry);
    } else {
      map.set(key, mergeEntry(current, rawEntry));
    }
  }

  return [...map.values()].map((entry, index) => ({
    ...entry,
    seed: index + 1,
  }));
}

function buildStandingRows(entries: ManualPlayerEntry[]): StandingRow[] {
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

function entriesFromStrings(players: string[]): ManualPlayerEntry[] {
  return players.map((player, index) => normalizeEntry(player, index));
}

function normalizeGroups(
  initialGroups: GeneratedGroup[],
  fallbackEntries: ManualPlayerEntry[],
  fallbackPlayers: string[]
): GeneratedGroup[] {
  if (initialGroups?.length) {
    return initialGroups.map((group, index) => {
      const rawEntries =
        group.manualPlayerEntries?.length > 0
          ? group.manualPlayerEntries
          : entriesFromStrings(group.players ?? []);

      const entries = uniqueEntries(
        rawEntries.map((entry, entryIndex) => normalizeEntry(entry, entryIndex))
      );

      return {
        name: group.name || `Grupo ${String.fromCharCode(65 + index)}`,
        players: entries.map((entry) => entry.displayName),
        manualPlayerEntries: entries,
        standings: buildStandingRows(entries),
      };
    });
  }

  const initialPool =
    fallbackEntries?.length > 0
      ? uniqueEntries(
          fallbackEntries.map((entry, index) => normalizeEntry(entry, index))
        )
      : uniqueEntries(entriesFromStrings(fallbackPlayers ?? []));

  return [
    {
      name: "Grupo A",
      players: initialPool.map((entry) => entry.displayName),
      manualPlayerEntries: initialPool,
      standings: buildStandingRows(initialPool),
    },
  ];
}

function sourceLabel(source: PlayerSource): string {
  if (source === "players") return "App";
  if (source === "registration") return "Inscrito";
  return "Manual";
}

export default function GroupsDnDEditor({
  initialGroups,
  fallbackPlayers = [],
  fallbackEntries = [],
  action,
}: {
  initialGroups: GeneratedGroup[];
  fallbackPlayers?: string[];
  fallbackEntries?: ManualPlayerEntry[];
  action: (formData: FormData) => void;
}) {
  const [groups, setGroups] = useState<GeneratedGroup[]>(
    normalizeGroups(initialGroups ?? [], fallbackEntries ?? [], fallbackPlayers ?? [])
  );
  const [dragging, setDragging] = useState<DragPayload | null>(null);

  const allPlayersCount = useMemo(() => {
    return uniqueEntries(groups.flatMap((group) => group.manualPlayerEntries)).length;
  }, [groups]);

  function persist(next: GeneratedGroup[]) {
    setGroups(
      next.map((group, index) => {
        const entries = uniqueEntries(group.manualPlayerEntries ?? []);

        return {
          name: cleanString(group.name, `Grupo ${String.fromCharCode(65 + index)}`),
          players: entries.map((entry) => entry.displayName),
          manualPlayerEntries: entries,
          standings: buildStandingRows(entries),
        };
      })
    );
  }

  function addGroup() {
    persist([
      ...groups,
      {
        name: `Grupo ${String.fromCharCode(65 + groups.length)}`,
        players: [],
        manualPlayerEntries: [],
        standings: [],
      },
    ]);
  }

  function renameGroup(index: number, value: string) {
    const next = [...groups];
    next[index] = { ...next[index], name: value };
    persist(next);
  }

  function removeGroup(index: number) {
    if (groups.length <= 1) return;

    const removed = groups[index];
    const next = groups.filter((_, i) => i !== index);

    next[0] = {
      ...next[0],
      manualPlayerEntries: [
        ...next[0].manualPlayerEntries,
        ...removed.manualPlayerEntries,
      ],
    };

    persist(next);
  }

  function onDragStart(entry: ManualPlayerEntry, fromGroupIndex: number) {
    setDragging({ entry, fromGroupIndex });
  }

  function movePlayerToGroup(targetGroupIndex: number) {
    if (!dragging) return;

    const next = groups.map((group) => ({
      ...group,
      manualPlayerEntries: [...group.manualPlayerEntries],
    }));

    next[dragging.fromGroupIndex].manualPlayerEntries = next[
      dragging.fromGroupIndex
    ].manualPlayerEntries.filter(
      (item) => entryKey(item) !== entryKey(dragging.entry)
    );

    next[targetGroupIndex].manualPlayerEntries.push(dragging.entry);

    persist(next);
    setDragging(null);
  }

  function removePlayer(groupIndex: number, entry: ManualPlayerEntry) {
    const next = groups.map((group) => ({
      ...group,
      manualPlayerEntries: [...group.manualPlayerEntries],
    }));

    next[groupIndex].manualPlayerEntries = next[groupIndex].manualPlayerEntries.filter(
      (item) => entryKey(item) !== entryKey(entry)
    );

    persist(next);
  }

  function balanceGroups() {
    const allEntries = uniqueEntries(groups.flatMap((group) => group.manualPlayerEntries));
    const groupCount = Math.max(1, groups.length);

    const next = groups.map((group) => ({
      ...group,
      manualPlayerEntries: [] as ManualPlayerEntry[],
    }));

    allEntries.forEach((entry, index) => {
      const cycle = Math.floor(index / groupCount);
      const positionInCycle = index % groupCount;
      const targetIndex =
        cycle % 2 === 0
          ? positionInCycle
          : groupCount - 1 - positionInCycle;

      next[targetIndex].manualPlayerEntries.push(entry);
    });

    persist(next);
  }

  return (
    <form action={action} className="space-y-4">
      <input
        type="hidden"
        name="generatedGroupsJson"
        value={JSON.stringify(groups)}
        readOnly
      />

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={addGroup}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Añadir grupo
        </button>

        <button
          type="button"
          onClick={balanceGroups}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Balancear grupos
        </button>

        <button
          type="submit"
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Guardar grupos editados
        </button>
      </div>

      <div className="text-sm text-zinc-500">
        Total de jugadores distribuidos: {allPlayersCount}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group, groupIndex) => (
          <div
            key={`${group.name}-${groupIndex}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => movePlayerToGroup(groupIndex)}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-4 flex items-center gap-3">
              <input
                value={group.name}
                onChange={(e) => renameGroup(groupIndex, e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
              />
              <button
                type="button"
                onClick={() => removeGroup(groupIndex)}
                className="rounded-xl border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                Quitar
              </button>
            </div>

            <div className="min-h-[120px] rounded-xl border border-dashed border-zinc-300 p-3">
              {group.manualPlayerEntries.length ? (
                <div className="flex flex-wrap gap-2">
                  {group.manualPlayerEntries.map((entry) => (
                    <div
                      key={`${entryKey(entry)}-${groupIndex}`}
                      draggable
                      onDragStart={() => onDragStart(entry, groupIndex)}
                      className="flex cursor-move items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800"
                    >
                      <div className="flex flex-col">
                        <span>{entry.displayName}</span>
                        <span className="text-[10px] text-zinc-500">
                          {sourceLabel(entry.source)}
                          {entry.category ? ` · ${entry.category}` : ""}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removePlayer(groupIndex, entry)}
                        className="text-xs text-rose-600"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-zinc-500">
                  Suelta jugadores aquí.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </form>
  );
}