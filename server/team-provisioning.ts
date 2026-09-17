import crypto from "crypto";
import type {
  BbGame,
  BbPlayer,
  BbPlayerFielding,
  BbPlayerGame,
} from "@shared/schema";

export interface TeamFieldingRow {
  id: string;
  gameId: string;
  position: string;
  po: number | null;
  a: number | null;
  e: number | null;
  source: string;
  updatedAt: Date;
}

export interface TeamCopySource {
  sourceTeamId: string;
  sourceSeason: string;
  selectedGameIds: string[];
  games: BbGame[];
  players: BbPlayer[];
  playerGames: BbPlayerGame[];
  playerFielding: BbPlayerFielding[];
  teamFielding: TeamFieldingRow[];
}

export interface TeamCopyPlan {
  players: Record<string, unknown>[];
  games: Record<string, unknown>[];
  playerGames: Record<string, unknown>[];
  playerFielding: Record<string, unknown>[];
  teamFielding: Record<string, unknown>[];
  playerIdMap: Map<string, string>;
  gameIdMap: Map<string, string>;
}

function without<T extends Record<string, unknown>>(row: T, keys: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

/**
 * Builds a complete, relation-safe clone plan without touching the database.
 * The caller inserts the returned parent rows before their child rows inside a
 * single transaction. Source IDs are never reused, so the copied season is
 * independent and cascade deletes cannot cross team boundaries.
 */
export function buildTeamCopyPlan(
  targetTeamId: string,
  targetSeason: string,
  source: TeamCopySource,
  createId: () => string = () => crypto.randomUUID(),
): TeamCopyPlan {
  const selected = new Set(source.selectedGameIds);
  if (selected.size !== source.selectedGameIds.length) {
    throw new Error("Selected games contain duplicates");
  }

  const games = source.games.filter((game) => selected.has(game.id));
  const foundIds = new Set(games.map((game) => game.id));
  const missing = source.selectedGameIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) throw new Error(`Selected games were not found: ${missing.join(", ")}`);
  for (const game of games) {
    if (game.teamId !== source.sourceTeamId || game.season !== source.sourceSeason) {
      throw new Error(`Game ${game.id} does not belong to the selected team and season`);
    }
  }

  const sourcePlayerIds = new Set<string>();
  for (const row of source.playerGames) {
    if (selected.has(row.gameId)) sourcePlayerIds.add(row.playerId);
  }
  for (const row of source.playerFielding) {
    if (selected.has(row.gameId)) sourcePlayerIds.add(row.playerId);
  }

  const players = source.players.filter((player) => sourcePlayerIds.has(player.id));
  const foundPlayerIds = new Set(players.map((player) => player.id));
  const missingPlayers = Array.from(sourcePlayerIds).filter((id) => !foundPlayerIds.has(id));
  if (missingPlayers.length > 0) {
    throw new Error(`Stats reference missing players: ${missingPlayers.join(", ")}`);
  }

  const playerIdMap = new Map(players.map((player) => [player.id, createId()]));
  const gameIdMap = new Map(games.map((game) => [game.id, createId()]));

  const mappedPlayers = players.map((player) => ({
    ...without(player as unknown as Record<string, unknown>, ["id", "teamId", "createdAt"]),
    id: playerIdMap.get(player.id)!,
    teamId: targetTeamId,
  }));
  const mappedGames = games.map((game) => ({
    ...without(game as unknown as Record<string, unknown>, ["id", "teamId", "season", "createdAt"]),
    id: gameIdMap.get(game.id)!,
    teamId: targetTeamId,
    season: targetSeason,
  }));
  const mappedPlayerGames = source.playerGames
    .filter((row) => selected.has(row.gameId))
    .map((row) => ({
      ...without(row as unknown as Record<string, unknown>, ["id", "gameId", "playerId", "updatedAt"]),
      id: createId(),
      gameId: gameIdMap.get(row.gameId)!,
      playerId: playerIdMap.get(row.playerId)!,
    }));
  const mappedPlayerFielding = source.playerFielding
    .filter((row) => selected.has(row.gameId))
    .map((row) => ({
      ...without(row as unknown as Record<string, unknown>, ["id", "gameId", "playerId", "updatedAt"]),
      id: createId(),
      gameId: gameIdMap.get(row.gameId)!,
      playerId: playerIdMap.get(row.playerId)!,
    }));
  const mappedTeamFielding = source.teamFielding
    .filter((row) => selected.has(row.gameId))
    .map((row) => ({
      ...without(row as unknown as Record<string, unknown>, ["id", "gameId", "updatedAt"]),
      id: createId(),
      gameId: gameIdMap.get(row.gameId)!,
    }));

  return {
    players: mappedPlayers,
    games: mappedGames,
    playerGames: mappedPlayerGames,
    playerFielding: mappedPlayerFielding,
    teamFielding: mappedTeamFielding,
    playerIdMap,
    gameIdMap,
  };
}
