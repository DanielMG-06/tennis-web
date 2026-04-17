import { dbAdmin as db } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export type TournamentStatus = "draft" | "open" | "in_progress" | "finished";
export type TournamentMode = "public" | "private_league";

export type PaymentConfig = {
  yapePhone: string;
  yapeQrUrl: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  cci: string;
  instructions: string;
};

export type ManualPlayerEntry = {
  id: string;
  displayName: string;
  photoUrl: string;
  category: string;
  source: "manual" | "players" | "registration";
  uid: string;
  seed: number;
};

export type StandingRow = {
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

export type GeneratedGroup = {
  name: string;
  players: string[];
  manualPlayerEntries: ManualPlayerEntry[];
  standings: StandingRow[];
};

export type BracketMatch = {
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

export type BracketRound = {
  name: string;
  matches: BracketMatch[];
};

export type TournamentItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  format: string;
  tournamentMode: TournamentMode;
  startDate: string;
  endDate: string;
  location: string;
  rulesText: string;
  isPublic: boolean;
  entryFeeAmount: number;
  entryFeeCurrency: string;
  paymentMethods: string[];
  registrationDeadline: string;
  maxPlayers: number;
  groupCount: number;
  groupNames: string[];
  manualPlayers: string[];
  manualPlayerEntries: ManualPlayerEntry[];
  createdBy: string;
  paymentConfig: PaymentConfig;
  status: TournamentStatus;
  createdAt: string;
  updatedAt: string;
  generatedGroups: GeneratedGroup[];
  generatedBracket: BracketRound[];
};

export type CreateTournamentInput = {
  name: string;
  description: string;
  category: string;
  format: string;
  tournamentMode: TournamentMode;
  startDate: string;
  endDate: string;
  location: string;
  rulesText: string;
  isPublic: boolean;
  entryFeeAmount: number;
  entryFeeCurrency: string;
  paymentMethods: string[];
  registrationDeadline: string;
  maxPlayers: number;
  groupCount: number;
  groupNames: string[];
  manualPlayers?: string[];
  manualPlayerEntries?: ManualPlayerEntry[];
  createdBy: string;
  paymentConfig: PaymentConfig;
  status: TournamentStatus;
  generatedGroups?: GeneratedGroup[];
  generatedBracket?: BracketRound[];
};

export type UpdateTournamentInput = Partial<CreateTournamentInput>;

export type TournamentRegistrationItem = {
  id: string;
  userId: string;
  tournamentId: string;
  displayName: string;
  email: string;
  phone: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type PlayerDirectoryItem = {
  id: string;
  displayName: string;
  photoUrl: string;
  category: string;
};

const tournamentsCollection = db.collection("tournaments");
const playersCollection = db.collection("players");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toIsoString(value: unknown): string {
  if (!value) return "";

  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  if (isRecord(value) && typeof value.toDate === "function") {
    try {
      const date = value.toDate() as Date;
      return date instanceof Date ? date.toISOString() : "";
    } catch {
      return "";
    }
  }

  return "";
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

function cleanBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "off") {
      return false;
    }
  }

  return fallback;
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => cleanString(item))
        .filter(Boolean)
    )
  );
}

function limitGroupNames(groupNames: string[], groupCount: number): string[] {
  if (groupCount <= 0) return groupNames;
  return groupNames.slice(0, groupCount);
}

function normalizeTournamentMode(value: unknown): TournamentMode {
  return value === "private_league" ? "private_league" : "public";
}

function normalizeStatus(value: unknown): TournamentStatus {
  if (value === "open") return "open";
  if (value === "in_progress") return "in_progress";
  if (value === "finished") return "finished";
  return "draft";
}

function normalizePaymentConfig(value: unknown): PaymentConfig {
  const obj = isRecord(value) ? value : {};

  return {
    yapePhone: cleanString(obj.yapePhone),
    yapeQrUrl: cleanString(obj.yapeQrUrl),
    bankName: cleanString(obj.bankName),
    accountHolder: cleanString(obj.accountHolder),
    accountNumber: cleanString(obj.accountNumber),
    cci: cleanString(obj.cci),
    instructions: cleanString(obj.instructions),
  };
}

function normalizeManualPlayerEntry(
  value: unknown,
  index: number
): ManualPlayerEntry {
  if (typeof value === "string") {
    const displayName = cleanString(value, `Jugador ${index + 1}`);
    return {
      id: displayName || `manual_${index + 1}`,
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
    displayName ||
    `manual_${index + 1}`;

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

function deriveManualPlayers(
  manualPlayers: string[],
  manualPlayerEntries: ManualPlayerEntry[]
): string[] {
  const merged = [
    ...manualPlayers,
    ...manualPlayerEntries.map((item) => item.displayName),
  ];

  return Array.from(new Set(merged.map((item) => cleanString(item)).filter(Boolean)));
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
      qualified: cleanBoolean(item.qualified, false),
    };
  });
}

function normalizeGeneratedGroups(value: unknown): GeneratedGroup[] {
  if (!Array.isArray(value)) return [];

  return value.map((group, index) => {
    const item = isRecord(group) ? group : {};
    const manualPlayerEntries = normalizeManualPlayerEntries(
      item.manualPlayerEntries ?? item.players
    );

    const playersFromField = cleanStringArray(item.players);
    const players =
      playersFromField.length > 0
        ? playersFromField
        : manualPlayerEntries.map((player) => player.displayName);

    return {
      name: cleanString(item.name, `Grupo ${String.fromCharCode(65 + index)}`),
      players,
      manualPlayerEntries,
      standings: normalizeStandingRows(item.standings),
    };
  });
}

function normalizeBracketMatchStatus(
  value: unknown
): "pending" | "completed" {
  return value === "completed" ? "completed" : "pending";
}

function normalizeGeneratedBracket(value: unknown): BracketRound[] {
  if (!Array.isArray(value)) return [];

  return value.map((round, roundIndex) => {
    const item = isRecord(round) ? round : {};
    const rawMatches = Array.isArray(item.matches) ? item.matches : [];

    return {
      name: cleanString(item.name, `Ronda ${roundIndex + 1}`),
      matches: rawMatches.map((match, matchIndex) => {
        const m = isRecord(match) ? match : {};

        return {
          id: cleanString(m.id, `r${roundIndex + 1}m${matchIndex + 1}`),
          home: cleanString(m.home),
          away: cleanString(m.away),
          homePlayerId: cleanString(m.homePlayerId),
          awayPlayerId: cleanString(m.awayPlayerId),
          winner: cleanString(m.winner),
          winnerPlayerId: cleanString(m.winnerPlayerId),
          score: cleanString(m.score),
          status: normalizeBracketMatchStatus(m.status),
          sourceMatchId: cleanString(m.sourceMatchId),
          roundIndex: cleanNumber(m.roundIndex, roundIndex),
          matchIndex: cleanNumber(m.matchIndex, matchIndex),
        };
      }),
    };
  });
}

function buildCreateTournamentPayload(input: CreateTournamentInput) {
  const groupCount = Math.max(0, cleanNumber(input.groupCount, 0));
  const groupNames = limitGroupNames(cleanStringArray(input.groupNames), groupCount);
  const manualPlayerEntries = normalizeManualPlayerEntries(input.manualPlayerEntries);
  const manualPlayers = deriveManualPlayers(
    cleanStringArray(input.manualPlayers),
    manualPlayerEntries
  );

  return {
    name: cleanString(input.name),
    description: cleanString(input.description),
    category: cleanString(input.category),
    format: cleanString(input.format),
    tournamentMode: normalizeTournamentMode(input.tournamentMode),
    startDate: cleanString(input.startDate),
    endDate: cleanString(input.endDate),
    location: cleanString(input.location),
    rulesText: cleanString(input.rulesText),
    isPublic: cleanBoolean(input.isPublic, false),
    entryFeeAmount: Math.max(0, cleanNumber(input.entryFeeAmount, 0)),
    entryFeeCurrency: cleanString(input.entryFeeCurrency, "PEN"),
    paymentMethods: cleanStringArray(input.paymentMethods),
    registrationDeadline: cleanString(input.registrationDeadline),
    maxPlayers: Math.max(0, cleanNumber(input.maxPlayers, 0)),
    groupCount,
    groupNames,
    manualPlayers,
    manualPlayerEntries,
    createdBy: cleanString(input.createdBy, "admin_web"),
    paymentConfig: normalizePaymentConfig(input.paymentConfig),
    status: normalizeStatus(input.status),
    generatedGroups: normalizeGeneratedGroups(input.generatedGroups),
    generatedBracket: normalizeGeneratedBracket(input.generatedBracket),
  };
}

function buildUpdateTournamentPayload(
  input: UpdateTournamentInput
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if ("name" in input) payload.name = cleanString(input.name);
  if ("description" in input) payload.description = cleanString(input.description);
  if ("category" in input) payload.category = cleanString(input.category);
  if ("format" in input) payload.format = cleanString(input.format);
  if ("tournamentMode" in input) {
    payload.tournamentMode = normalizeTournamentMode(input.tournamentMode);
  }
  if ("startDate" in input) payload.startDate = cleanString(input.startDate);
  if ("endDate" in input) payload.endDate = cleanString(input.endDate);
  if ("location" in input) payload.location = cleanString(input.location);
  if ("rulesText" in input) payload.rulesText = cleanString(input.rulesText);
  if ("isPublic" in input) payload.isPublic = cleanBoolean(input.isPublic, false);
  if ("entryFeeAmount" in input) {
    payload.entryFeeAmount = Math.max(0, cleanNumber(input.entryFeeAmount, 0));
  }
  if ("entryFeeCurrency" in input) {
    payload.entryFeeCurrency = cleanString(input.entryFeeCurrency, "PEN");
  }
  if ("paymentMethods" in input) {
    payload.paymentMethods = cleanStringArray(input.paymentMethods);
  }
  if ("registrationDeadline" in input) {
    payload.registrationDeadline = cleanString(input.registrationDeadline);
  }
  if ("maxPlayers" in input) {
    payload.maxPlayers = Math.max(0, cleanNumber(input.maxPlayers, 0));
  }

  if ("groupCount" in input) {
    payload.groupCount = Math.max(0, cleanNumber(input.groupCount, 0));
  }

  if ("groupNames" in input) {
    const groupNames = cleanStringArray(input.groupNames);
    const explicitGroupCount =
      "groupCount" in input
        ? Math.max(0, cleanNumber(input.groupCount, 0))
        : 0;

    payload.groupNames =
      explicitGroupCount > 0
        ? limitGroupNames(groupNames, explicitGroupCount)
        : groupNames;
  }

  if ("manualPlayerEntries" in input) {
    const manualPlayerEntries = normalizeManualPlayerEntries(input.manualPlayerEntries);
    payload.manualPlayerEntries = manualPlayerEntries;

    if (!("manualPlayers" in input)) {
      payload.manualPlayers = manualPlayerEntries.map((item) => item.displayName);
    }
  }

  if ("manualPlayers" in input) {
    payload.manualPlayers = cleanStringArray(input.manualPlayers);
  }

  if ("createdBy" in input) {
    payload.createdBy = cleanString(input.createdBy, "admin_web");
  }

  if ("paymentConfig" in input) {
    payload.paymentConfig = normalizePaymentConfig(input.paymentConfig);
  }

  if ("status" in input) {
    payload.status = normalizeStatus(input.status);
  }

  if ("generatedGroups" in input) {
    payload.generatedGroups = normalizeGeneratedGroups(input.generatedGroups);
  }

  if ("generatedBracket" in input) {
    payload.generatedBracket = normalizeGeneratedBracket(input.generatedBracket);
  }

  return payload;
}

function mapTournament(
  doc:
    | FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
    | FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
): TournamentItem | null {
  if (!doc.exists) return null;

  const data = doc.data() ?? {};
  const manualPlayerEntries = normalizeManualPlayerEntries(
    data.manualPlayerEntries ?? data.manualPlayers
  );
  const manualPlayers = deriveManualPlayers(
    cleanStringArray(data.manualPlayers),
    manualPlayerEntries
  );

  return {
    id: doc.id,
    name: cleanString(data.name),
    description: cleanString(data.description),
    category: cleanString(data.category),
    format: cleanString(data.format),
    tournamentMode: normalizeTournamentMode(data.tournamentMode),
    startDate: cleanString(data.startDate),
    endDate: cleanString(data.endDate),
    location: cleanString(data.location),
    rulesText: cleanString(data.rulesText),
    isPublic: cleanBoolean(data.isPublic, false),
    entryFeeAmount: cleanNumber(data.entryFeeAmount, 0),
    entryFeeCurrency: cleanString(data.entryFeeCurrency, "PEN"),
    paymentMethods: cleanStringArray(data.paymentMethods),
    registrationDeadline: cleanString(data.registrationDeadline),
    maxPlayers: cleanNumber(data.maxPlayers, 0),
    groupCount: cleanNumber(data.groupCount, 0),
    groupNames: cleanStringArray(data.groupNames),
    manualPlayers,
    manualPlayerEntries,
    createdBy: cleanString(data.createdBy),
    paymentConfig: normalizePaymentConfig(data.paymentConfig),
    status: normalizeStatus(data.status),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    generatedGroups: normalizeGeneratedGroups(data.generatedGroups),
    generatedBracket: normalizeGeneratedBracket(data.generatedBracket),
  };
}

export async function listTournaments(): Promise<TournamentItem[]> {
  const snapshot = await tournamentsCollection.orderBy("createdAt", "desc").get();

  return snapshot.docs
    .map((doc) => mapTournament(doc))
    .filter((item): item is TournamentItem => item !== null);
}

export async function getTournamentById(
  id: string
): Promise<TournamentItem | null> {
  const doc = await tournamentsCollection.doc(id).get();
  return mapTournament(doc);
}

export async function createTournament(
  input: CreateTournamentInput
): Promise<string> {
  const ref = tournamentsCollection.doc();
  const payload = buildCreateTournamentPayload(input);

  await ref.set({
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return ref.id;
}

export async function updateTournament(
  id: string,
  input: UpdateTournamentInput
): Promise<void> {
  const payload = buildUpdateTournamentPayload(input);

  await tournamentsCollection.doc(id).set(
    {
      ...payload,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function listTournamentRegistrations(
  tournamentId: string
): Promise<TournamentRegistrationItem[]> {
  const snapshot = await tournamentsCollection
    .doc(tournamentId)
    .collection("registrations")
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() ?? {};

    return {
      id: doc.id,
      userId: cleanString(data.userId || doc.id),
      tournamentId,
      displayName: cleanString(data.displayName),
      email: cleanString(data.email),
      phone: cleanString(data.phone),
      category: cleanString(data.category),
      status: cleanString(data.status, "pending"),
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
    };
  });
}

export async function listPlayersDirectory(): Promise<PlayerDirectoryItem[]> {
  const snapshot = await playersCollection.get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() ?? {};

      return {
        id: doc.id,
        displayName:
          cleanString(data.displayName) ||
          cleanString(data.name) ||
          cleanString(data.fullName) ||
          cleanString(data.username) ||
          "Jugador",
        photoUrl:
          cleanString(data.photoUrl) ||
          cleanString(data.profileImageUrl) ||
          cleanString(data.avatarUrl),
        category: cleanString(data.category),
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
}

export async function setTournamentManualPlayers(
  id: string,
  manualPlayers: string[],
  manualPlayerEntries: ManualPlayerEntry[] = []
): Promise<void> {
  const normalizedEntries = normalizeManualPlayerEntries(manualPlayerEntries);
  const normalizedPlayers = deriveManualPlayers(
    cleanStringArray(manualPlayers),
    normalizedEntries
  );

  await tournamentsCollection.doc(id).set(
    {
      manualPlayers: normalizedPlayers,
      manualPlayerEntries: normalizedEntries,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function setTournamentGeneratedGroups(
  id: string,
  generatedGroups: GeneratedGroup[]
): Promise<void> {
  await tournamentsCollection.doc(id).set(
    {
      generatedGroups: normalizeGeneratedGroups(generatedGroups),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function setTournamentGeneratedBracket(
  id: string,
  generatedBracket: BracketRound[]
): Promise<void> {
  await tournamentsCollection.doc(id).set(
    {
      generatedBracket: normalizeGeneratedBracket(generatedBracket),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function setTournamentComputedState(
  id: string,
  params: {
    generatedGroups?: GeneratedGroup[];
    generatedBracket?: BracketRound[];
  }
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (params.generatedGroups) {
    payload.generatedGroups = normalizeGeneratedGroups(params.generatedGroups);
  }

  if (params.generatedBracket) {
    payload.generatedBracket = normalizeGeneratedBracket(params.generatedBracket);
  }

  await tournamentsCollection.doc(id).set(payload, { merge: true });
}


