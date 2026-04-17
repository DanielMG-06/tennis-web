import Link from "next/link";
import { notFound } from "next/navigation";
import SectionCard from "@/components/SectionCard";
import GroupsDnDEditor from "@/components/tournaments/GroupsDnDEditor";
import BracketDnDEditor from "@/components/tournaments/BracketDnDEditor";
import {
  getTournamentById,
  listTournamentRegistrations,
} from "@/lib/tournament-service";
import {
  generateBracketAction,
  generateBracketFromGroupsAction,
  generateGroupsAction,
  recomputeTournamentFromResultsAction,
  resetBracketAction,
  resetGroupsAction,
  resetTournamentStructuresAction,
  saveBracketSlotsAction,
  saveGroupAssignmentsAction,
  saveManualPlayersAction,
  syncPlayersFromRegistrationsAction,
} from "./actions";

type Props = {
  params: Promise<{ id: string }>;
};

type AppMatchResult = {
  id: string;
  home: string;
  away: string;
  winner: string;
  score: string;
  evidencePhotoUrl: string;
  comments: string;
  status: string;
  updatedAtMs: number;
};

type LiveStandingRow = {
  position: number;
  playerName: string;
  played: number;
  wins: number;
  losses: number;
  setsFor: number;
  setsAgainst: number;
  gamesFor: number;
  gamesAgainst: number;
  points: number;
};

function Badge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "green" | "blue" | "amber" | "red";
}) {
  const tones: Record<string, string> = {
    default: "bg-zinc-100 text-zinc-700 border-zinc-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue: "bg-sky-50 text-sky-700 border-sky-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <span className="text-sm text-zinc-900">{value || "—"}</span>
    </div>
  );
}

function StatCard({
  title,
  value,
  helper,
}: {
  title: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      <div className="mt-2 text-3xl font-bold text-zinc-900">{value}</div>
      {helper ? <div className="mt-1 text-sm text-zinc-500">{helper}</div> : null}
    </div>
  );
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
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

function formatDateTime(ms: number): string {
  if (!ms) return "—";

  try {
    return new Intl.DateTimeFormat("es-PE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

function normalizeResultStatus(data: Record<string, unknown>): string {
  return (
    readFirstString(data, [
      "status",
      "resultStatus",
      "matchStatus",
      "approvalStatus",
    ]) || "pending"
  );
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function isSamePair(
  aHome: string,
  aAway: string,
  bHome: string,
  bAway: string
): boolean {
  const ah = normalizeName(aHome);
  const aa = normalizeName(aAway);
  const bh = normalizeName(bHome);
  const ba = normalizeName(bAway);

  return (ah === bh && aa === ba) || (ah === ba && aa === bh);
}

function findResultForPair(
  results: AppMatchResult[],
  home: string,
  away: string
): AppMatchResult | null {
  return results.find((item) => isSamePair(item.home, item.away, home, away)) ?? null;
}

function parseScorePairs(score: string): Array<[number, number]> {
  const matches = [...score.matchAll(/(\d+)\s*[-:/]\s*(\d+)/g)];
  return matches.map((m) => [Number(m[1]), Number(m[2])]);
}

function getStatusTone(status: string): "default" | "green" | "blue" | "amber" | "red" {
  const value = (status || "").toLowerCase();

  if (["completed", "confirmed", "approved"].includes(value)) return "green";
  if (["pending", "sent", "review"].includes(value)) return "amber";
  if (["rejected", "cancelled", "canceled"].includes(value)) return "red";
  if (["open", "in_progress"].includes(value)) return "blue";
  return "default";
}

async function loadTournamentAppResults(
  tournamentId: string
): Promise<AppMatchResult[]> {
  const { dbAdmin } = await import("@/lib/firebase-admin");

  const snapshot = await dbAdmin
    .collection("matches")
    .where("tournamentId", "==", tournamentId)
    .get();

  const results = snapshot.docs.map((doc) => {
    const data = doc.data() ?? {};

    const home =
      readFirstString(data, [
        "homePlayerName",
        "player1Name",
        "challengerName",
        "localPlayerName",
        "userAName",
      ]) ||
      cleanString(data.homeName) ||
      cleanString(data.playerAName);

    const away =
      readFirstString(data, [
        "awayPlayerName",
        "player2Name",
        "challengedName",
        "visitorPlayerName",
        "userBName",
      ]) ||
      cleanString(data.awayName) ||
      cleanString(data.playerBName);

    return {
      id: doc.id,
      home,
      away,
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
      evidencePhotoUrl: readFirstString(data, [
        "evidencePhotoUrl",
        "evidenceImageUrl",
        "evidenceUrl",
        "photoUrl",
        "imageUrl",
        "resultPhotoUrl",
      ]),
      comments: readFirstString(data, [
        "comments",
        "comment",
        "resultComment",
        "notes",
      ]),
      status: normalizeResultStatus(data),
      updatedAtMs: Math.max(
        toMillis(data.updatedAt),
        toMillis(data.resultUpdatedAt),
        toMillis(data.createdAt)
      ),
    };
  });

  return results.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

function buildLiveStandingsForGroup(
  group: { players?: string[] },
  appResults: AppMatchResult[]
): LiveStandingRow[] {
  const players = cleanStringArray(group?.players);

  const baseRows: LiveStandingRow[] = players.map((player, index) => ({
    position: index + 1,
    playerName: player,
    played: 0,
    wins: 0,
    losses: 0,
    setsFor: 0,
    setsAgainst: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    points: 0,
  }));

  const rowMap = new Map(baseRows.map((row) => [normalizeName(row.playerName), row]));

  const groupResults = appResults.filter((result) => {
    const home = normalizeName(result.home);
    const away = normalizeName(result.away);
    return rowMap.has(home) && rowMap.has(away);
  });

  for (const result of groupResults) {
    const homeRow = rowMap.get(normalizeName(result.home));
    const awayRow = rowMap.get(normalizeName(result.away));

    if (!homeRow || !awayRow) continue;

    homeRow.played += 1;
    awayRow.played += 1;

    const pairs = parseScorePairs(result.score);
    let homeSetsWon = 0;
    let awaySetsWon = 0;

    for (const [homeGames, awayGames] of pairs) {
      homeRow.gamesFor += homeGames;
      homeRow.gamesAgainst += awayGames;
      awayRow.gamesFor += awayGames;
      awayRow.gamesAgainst += homeGames;

      if (homeGames > awayGames) {
        homeSetsWon += 1;
      } else if (awayGames > homeGames) {
        awaySetsWon += 1;
      }
    }

    homeRow.setsFor += homeSetsWon;
    homeRow.setsAgainst += awaySetsWon;
    awayRow.setsFor += awaySetsWon;
    awayRow.setsAgainst += homeSetsWon;

    let winner = result.winner;

    if (!winner && homeSetsWon !== awaySetsWon) {
      winner = homeSetsWon > awaySetsWon ? result.home : result.away;
    }

    if (normalizeName(winner) === normalizeName(result.home)) {
      homeRow.wins += 1;
      awayRow.losses += 1;
      homeRow.points += 1;
    } else if (normalizeName(winner) === normalizeName(result.away)) {
      awayRow.wins += 1;
      homeRow.losses += 1;
      awayRow.points += 1;
    }
  }

  return [...rowMap.values()]
    .sort((a, b) => {
      const setDiffA = a.setsFor - a.setsAgainst;
      const setDiffB = b.setsFor - b.setsAgainst;
      const gameDiffA = a.gamesFor - a.gamesAgainst;
      const gameDiffB = b.gamesFor - b.gamesAgainst;

      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (setDiffB !== setDiffA) return setDiffB - setDiffA;
      if (gameDiffB !== gameDiffA) return gameDiffB - gameDiffA;

      return a.playerName.localeCompare(b.playerName, "es", {
        sensitivity: "base",
      });
    })
    .map((row, index) => ({
      ...row,
      position: index + 1,
    }));
}

function AppResultsSection({
  appResults = [],
}: {
  appResults?: AppMatchResult[];
}) {
  if (!appResults.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">
        Aún no hay resultados vinculados desde la app para este torneo.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {appResults.map((result) => (
        <div
          key={result.id}
          className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-zinc-900">
              {result.home || "Jugador A"} vs {result.away || "Jugador B"}
            </div>
            <Badge
              label={result.status || "pending"}
              tone={getStatusTone(result.status)}
            />
          </div>

          <div className="mt-2 text-sm text-zinc-700">
            Score: {result.score || "Sin score"}
          </div>

          {result.winner ? (
            <div className="mt-1 text-sm font-semibold text-emerald-700">
              Ganador: {result.winner}
            </div>
          ) : null}

          <div className="mt-1 text-xs text-zinc-500">
            Actualizado: {formatDateTime(result.updatedAtMs)}
          </div>

          {result.comments ? (
            <div className="mt-2 text-sm text-zinc-600">{result.comments}</div>
          ) : null}

          {result.evidencePhotoUrl ? (
            <img
              src={result.evidencePhotoUrl}
              alt="Evidencia del resultado"
              className="mt-3 h-48 w-full rounded-xl object-cover"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function StandingsSection({
  groups = [],
  appResults = [],
}: {
  groups?: Array<{ name?: string; players?: string[] }>;
  appResults?: AppMatchResult[];
}) {
  if (!groups.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">
        Aún no se generó la tabla de clasificación.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group, groupIndex) => {
        const players = cleanStringArray(group?.players);
        const standings = buildLiveStandingsForGroup(group, appResults);

        const groupResults = appResults.filter((result) => {
          const home = normalizeName(result.home);
          const away = normalizeName(result.away);

          return (
            players.some((p) => normalizeName(p) === home) &&
            players.some((p) => normalizeName(p) === away)
          );
        });

        return (
          <div
            key={`${group?.name ?? "group"}-${groupIndex}`}
            className="rounded-2xl border border-zinc-200 bg-white p-4"
          >
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">
                  {group?.name || `Grupo ${String.fromCharCode(65 + groupIndex)}`}
                </h3>
                <p className="text-sm text-zinc-500">
                  {players.length} jugadores
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {players.map((player, index) => (
                  <span
                    key={`${player}-${index}`}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm text-zinc-700"
                  >
                    {player}
                  </span>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                      Pos
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                      Jugador
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                      PJ
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                      PG
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                      PP
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                      SF
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                      SC
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                      GF
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                      GC
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                      Pts
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {standings.map((row, rowIndex) => (
                    <tr key={`${row.playerName}-${rowIndex}`}>
                      <td className="rounded-l-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm font-semibold text-zinc-900">
                        {row.position}
                      </td>
                      <td className="border-y border-zinc-200 bg-zinc-50 px-3 py-3 text-sm font-semibold text-zinc-900">
                        {row.playerName}
                      </td>
                      <td className="border-y border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                        {row.played}
                      </td>
                      <td className="border-y border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                        {row.wins}
                      </td>
                      <td className="border-y border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                        {row.losses}
                      </td>
                      <td className="border-y border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                        {row.setsFor}
                      </td>
                      <td className="border-y border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                        {row.setsAgainst}
                      </td>
                      <td className="border-y border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                        {row.gamesFor}
                      </td>
                      <td className="border-y border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                        {row.gamesAgainst}
                      </td>
                      <td className="rounded-r-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm font-semibold text-zinc-900">
                        {row.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <div className="mb-3 text-sm font-semibold text-zinc-800">
                Resultados del grupo
              </div>

              {groupResults.length ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {groupResults.map((result) => (
                    <div
                      key={result.id}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-zinc-900">
                          {result.home} vs {result.away}
                        </div>
                        <Badge
                          label={result.status || "pending"}
                          tone={getStatusTone(result.status)}
                        />
                      </div>

                      <div className="mt-2 text-sm text-zinc-700">
                        Score: {result.score || "Sin score"}
                      </div>

                      {result.winner ? (
                        <div className="mt-1 text-sm font-semibold text-emerald-700">
                          Ganador: {result.winner}
                        </div>
                      ) : null}

                      {result.comments ? (
                        <div className="mt-2 text-sm text-zinc-600">
                          {result.comments}
                        </div>
                      ) : null}

                      {result.evidencePhotoUrl ? (
                        <img
                          src={result.evidencePhotoUrl}
                          alt="Evidencia del resultado"
                          className="mt-3 h-48 w-full rounded-xl object-cover"
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                  Aún no hay resultados enviados desde la app para este grupo.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BracketSection({
  rounds = [],
  appResults = [],
}: {
  rounds?: Array<{
    name?: string;
    matches?: Array<{
      id?: string;
      home?: string;
      away?: string;
      winner?: string;
      score?: string;
      status?: string;
      evidencePhotoUrl?: string;
    }>;
  }>;
  appResults?: AppMatchResult[];
}) {
  if (!rounds.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">
        Aún no se generaron llaves de eliminación.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-4">
        {rounds.map((round, roundIndex) => {
          const matches = Array.isArray(round?.matches) ? round.matches : [];

          return (
            <div
              key={`${round?.name ?? "round"}-${roundIndex}`}
              className="w-80 shrink-0 rounded-2xl border border-zinc-200 bg-white p-4"
            >
              <h3 className="mb-4 text-lg font-semibold text-zinc-900">
                {round?.name || `Ronda ${roundIndex + 1}`}
              </h3>

              <div className="space-y-4">
                {matches.length ? (
                  matches.map((match, matchIndex) => {
                    const liveResult = findResultForPair(
                      appResults,
                      cleanString(match?.home),
                      cleanString(match?.away)
                    );

                    const score = liveResult?.score || cleanString(match?.score);
                    const winner = liveResult?.winner || cleanString(match?.winner);
                    const photo =
                      liveResult?.evidencePhotoUrl ||
                      cleanString(match?.evidencePhotoUrl);

                    return (
                      <div
                        key={`${match?.id ?? "match"}-${matchIndex}`}
                        className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
                      >
                        <div className="space-y-2">
                          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900">
                            {match?.home || "Por definir"}
                          </div>
                          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900">
                            {match?.away || "Por definir"}
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                          <span>{score || "Sin score"}</span>
                          <span>
                            {winner || match?.status === "completed"
                              ? "Cerrado"
                              : "Pendiente"}
                          </span>
                        </div>

                        {winner ? (
                          <div className="mt-2 text-sm font-semibold text-emerald-700">
                            Ganador: {winner}
                          </div>
                        ) : null}

                        {photo ? (
                          <img
                            src={photo}
                            alt="Evidencia del partido"
                            className="mt-3 h-40 w-full rounded-xl object-cover"
                          />
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                    Sin cruces en esta ronda.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function TournamentDetailPage({ params }: Props) {
  const { id } = await params;

  const [tournament, registrations, appResults] = await Promise.all([
    getTournamentById(id),
    listTournamentRegistrations(id),
    loadTournamentAppResults(id),
  ]);

  if (!tournament) {
    notFound();
  }

  const safeTournament = {
    ...tournament,
    manualPlayers: tournament.manualPlayers ?? [],
    manualPlayerEntries: tournament.manualPlayerEntries ?? [],
    generatedGroups: tournament.generatedGroups ?? [],
    generatedBracket: tournament.generatedBracket ?? [],
    groupNames: tournament.groupNames ?? [],
    paymentMethods: tournament.paymentMethods ?? [],
    paymentConfig: tournament.paymentConfig ?? {
      yapePhone: "",
      yapeQrUrl: "",
      bankName: "",
      accountHolder: "",
      accountNumber: "",
      cci: "",
      instructions: "",
    },
  };

  const catalogPlayers = safeTournament.manualPlayerEntries.filter(
    (entry) => entry.source === "players" || entry.source === "registration"
  );

  const manualOnlyPlayers = safeTournament.manualPlayerEntries.filter(
    (entry) => entry.source === "manual"
  );

  const totalPlayers = safeTournament.manualPlayers.length;
  const totalGroups = safeTournament.generatedGroups.length;
  const totalRounds = safeTournament.generatedBracket.length;
  const totalResults = appResults.length;

  const completedResults = appResults.filter((r) =>
    ["completed", "confirmed", "approved"].includes((r.status || "").toLowerCase())
  ).length;

  const resultsWithPhoto = appResults.filter((r) => !!r.evidencePhotoUrl).length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Admin · Torneos
          </p>

          <h1 className="mt-2 text-3xl font-bold text-zinc-900">
            {safeTournament.name}
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            {safeTournament.description || "Sin descripción"}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge
              label={
                safeTournament.tournamentMode === "public"
                  ? "Público"
                  : "Privado tipo liga"
              }
              tone={safeTournament.tournamentMode === "public" ? "blue" : "amber"}
            />
            <Badge
              label={safeTournament.status}
              tone={getStatusTone(safeTournament.status)}
            />
            <Badge
              label={safeTournament.isPublic ? "Visible en app" : "Oculto en app"}
              tone={safeTournament.isPublic ? "green" : "red"}
            />
            <Badge label={safeTournament.category || "Sin categoría"} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/tournaments"
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Volver
          </Link>

          <Link
            href={`/tournaments/${safeTournament.id}/edit`}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Editar torneo
          </Link>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Jugadores" value={totalPlayers} />
        <StatCard title="Grupos" value={totalGroups} />
        <StatCard title="Rondas" value={totalRounds} />
        <StatCard title="Resultados" value={totalResults} />
        <StatCard title="Confirmados" value={completedResults} />
        <StatCard title="Con foto" value={resultsWithPhoto} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Información general">
          <div className="grid gap-3 md:grid-cols-2">
            <FieldRow label="Categoría" value={safeTournament.category} />
            <FieldRow label="Formato" value={safeTournament.format} />
            <FieldRow label="Ubicación" value={safeTournament.location} />
            <FieldRow
              label="Máximo de jugadores"
              value={String(safeTournament.maxPlayers)}
            />
            <FieldRow label="Inicio" value={safeTournament.startDate} />
            <FieldRow label="Fin" value={safeTournament.endDate} />
            <FieldRow
              label="Cierre inscripción"
              value={safeTournament.registrationDeadline}
            />
            <FieldRow label="Creado por" value={safeTournament.createdBy} />
          </div>
        </SectionCard>

        <SectionCard title="Inscripción y pagos">
          <div className="grid gap-3 md:grid-cols-2">
            <FieldRow
              label="Monto"
              value={`${safeTournament.entryFeeAmount} ${safeTournament.entryFeeCurrency}`}
            />
            <FieldRow
              label="Métodos"
              value={
                safeTournament.paymentMethods.length
                  ? safeTournament.paymentMethods.join(", ")
                  : "No definido"
              }
            />
            <FieldRow
              label="Yape"
              value={safeTournament.paymentConfig.yapePhone || "—"}
            />
            <FieldRow
              label="Banco"
              value={safeTournament.paymentConfig.bankName || "—"}
            />
            <FieldRow
              label="Titular"
              value={safeTournament.paymentConfig.accountHolder || "—"}
            />
            <FieldRow
              label="CCI"
              value={safeTournament.paymentConfig.cci || "—"}
            />
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Instrucciones
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">
              {safeTournament.paymentConfig.instructions || "Sin instrucciones"}
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Jugadores del torneo"
        subtitle="Resumen de jugadores añadidos manualmente y desde la app."
        className="mt-6"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 text-sm font-semibold text-zinc-800">
              Desde catálogo / app
            </div>

            {catalogPlayers.length ? (
              <div className="flex flex-wrap gap-2">
                {catalogPlayers.map((player) => (
                  <span
                    key={`${player.source}-${player.uid || player.id}`}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm text-zinc-700"
                  >
                    {player.displayName}
                    {player.category ? ` · ${player.category}` : ""}
                  </span>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                Aún no hay jugadores vinculados desde la app.
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 text-sm font-semibold text-zinc-800">
              Manuales
            </div>

            {manualOnlyPlayers.length ? (
              <div className="flex flex-wrap gap-2">
                {manualOnlyPlayers.map((player) => (
                  <span
                    key={player.id}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-700"
                  >
                    {player.displayName}
                  </span>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                Aún no hay jugadores manuales.
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs text-zinc-500">
          Para añadir jugadores desde Firebase o editar la carga manual avanzada,
          entra a <strong>Editar torneo</strong>.
        </div>
      </SectionCard>

      <SectionCard
        title="Gestión rápida"
        subtitle="Acciones administrativas sobre jugadores, grupos y llaves."
        className="mt-6"
      >
        <form action={saveManualPlayersAction.bind(null, safeTournament.id)}>
          <textarea
            name="manualPlayersText"
            defaultValue={manualOnlyPlayers.map((p) => p.displayName).join("\n")}
            rows={10}
            className="w-full rounded-2xl border border-zinc-300 px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-500"
            placeholder={`Juan Pérez\nCarlos Rojas\nMiguel Soto`}
          />

          <div className="mt-3 text-xs text-zinc-500">
            Aquí edita solo los jugadores manuales. Los jugadores traídos desde la
            app se conservan por separado con identidad real.
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Guardar jugadores manuales
            </button>
          </div>
        </form>

        <div className="mt-6 flex flex-wrap gap-3">
          <form action={generateGroupsAction.bind(null, safeTournament.id)}>
            <button
              type="submit"
              className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Generar tabla de grupos
            </button>
          </form>

          <form action={generateBracketAction.bind(null, safeTournament.id)}>
            <button
              type="submit"
              className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Generar llaves manuales
            </button>
          </form>

          <form
            action={generateBracketFromGroupsAction.bind(null, safeTournament.id)}
          >
            <button
              type="submit"
              className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Generar llaves desde grupos
            </button>
          </form>

          <form
            action={recomputeTournamentFromResultsAction.bind(null, safeTournament.id)}
          >
            <button
              type="submit"
              className="rounded-xl border border-sky-300 px-4 py-3 text-sm font-medium text-sky-700 hover:bg-sky-50"
            >
              Recalcular desde resultados
            </button>
          </form>

          <form
            action={syncPlayersFromRegistrationsAction.bind(null, safeTournament.id)}
          >
            <button
              type="submit"
              className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Traer inscritos al torneo
            </button>
          </form>

          <form action={resetGroupsAction.bind(null, safeTournament.id)}>
            <button
              type="submit"
              className="rounded-xl border border-amber-300 px-4 py-3 text-sm font-medium text-amber-700 hover:bg-amber-50"
            >
              Limpiar grupos
            </button>
          </form>

          <form action={resetBracketAction.bind(null, safeTournament.id)}>
            <button
              type="submit"
              className="rounded-xl border border-amber-300 px-4 py-3 text-sm font-medium text-amber-700 hover:bg-amber-50"
            >
              Limpiar llaves
            </button>
          </form>

          <form
            action={resetTournamentStructuresAction.bind(null, safeTournament.id)}
          >
            <button
              type="submit"
              className="rounded-xl border border-rose-300 px-4 py-3 text-sm font-medium text-rose-700 hover:bg-rose-50"
            >
              Resetear estructura
            </button>
          </form>
        </div>
      </SectionCard>

      <SectionCard
        title="Editor visual de grupos"
        subtitle="Mueve jugadores entre grupos con drag-and-drop y guarda la distribución."
        className="mt-6"
      >
        <GroupsDnDEditor
          initialGroups={safeTournament.generatedGroups ?? []}
          fallbackEntries={safeTournament.manualPlayerEntries ?? []}
          fallbackPlayers={safeTournament.manualPlayers ?? []}
          action={saveGroupAssignmentsAction.bind(null, safeTournament.id)}
        />
      </SectionCard>

      <SectionCard
        title="Editor visual de llaves"
        subtitle="Arma cruces manuales con drag-and-drop usando jugadores con identidad estable."
        className="mt-6"
      >
        <BracketDnDEditor
          initialRounds={safeTournament.generatedBracket ?? []}
          playerEntries={safeTournament.manualPlayerEntries ?? []}
          playerPool={safeTournament.manualPlayers ?? []}
          action={saveBracketSlotsAction.bind(null, safeTournament.id)}
        />
      </SectionCard>

      <SectionCard
        title="Resultados enviados desde la app"
        subtitle="Se leen automáticamente desde la colección matches del torneo."
        className="mt-6"
      >
        <AppResultsSection appResults={appResults} />
      </SectionCard>

      <SectionCard
        title="Tabla de clasificación"
        subtitle="Se recalcula en vivo con los resultados enviados desde la app."
        className="mt-6"
      >
        <StandingsSection
          groups={safeTournament.generatedGroups}
          appResults={appResults}
        />
      </SectionCard>

      <SectionCard
        title="Llaves de eliminación"
        subtitle="Cada cruce muestra score y evidencia cuando exista resultado vinculado."
        className="mt-6"
      >
        <BracketSection
          rounds={safeTournament.generatedBracket}
          appResults={appResults}
        />
      </SectionCard>

      <SectionCard
        title="Últimos movimientos"
        subtitle="Base útil para auditoría y seguimiento."
        className="mt-6"
      >
        {appResults.length ? (
          <div className="space-y-3">
            {appResults.slice(0, 5).map((result) => (
              <div
                key={result.id}
                className="rounded-xl border border-zinc-200 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-zinc-900">
                    {result.home} vs {result.away}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {formatDateTime(result.updatedAtMs)}
                  </div>
                </div>

                <div className="mt-1 text-sm text-zinc-700">
                  {result.score || "Sin score"}
                  {result.winner ? ` · Ganador: ${result.winner}` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
            Aún no hay actividad reciente para mostrar.
          </div>
        )}
      </SectionCard>

      <SectionCard title="Solicitudes e inscritos" className="mt-6">
        <div className="mb-4 text-sm text-zinc-600">
          Total de solicitudes:{" "}
          <span className="font-semibold text-zinc-900">
            {registrations.length}
          </span>
        </div>

        <div className="space-y-3">
          {registrations.length ? (
            registrations.map((registration) => (
              <div
                key={registration.id}
                className="rounded-xl border border-zinc-200 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-zinc-900">
                    {registration.displayName || registration.userId}
                  </div>
                  <Badge
                    label={registration.status || "pending"}
                    tone={getStatusTone(registration.status || "pending")}
                  />
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <FieldRow label="Email" value={registration.email} />
                  <FieldRow label="Teléfono" value={registration.phone} />
                  <FieldRow label="Categoría" value={registration.category} />
                  <FieldRow label="Fecha" value={registration.createdAt} />
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">
              Aún no hay solicitudes para este torneo.
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Reglas del torneo" className="mt-6">
        <p className="whitespace-pre-wrap text-sm text-zinc-800">
          {safeTournament.rulesText || "Sin reglas registradas."}
        </p>
      </SectionCard>
    </main>
  );
}