import assert from "node:assert/strict";
import test from "node:test";
import { buildTeamCopyPlan } from "./team-provisioning";

const game = {
  id: "game-1",
  teamId: "source-team",
  gameDate: new Date("2026-09-12T14:00:00Z"),
  gameTime: "10:00 AM",
  opponent: "Dirt Dawgs",
  ourHomeVisitor: "Home",
  location: "Field 2",
  ourScore: 8,
  oppScore: 5,
  notes: "Tournament",
  season: "Fall 2026",
  createdAt: new Date("2026-09-12T18:00:00Z"),
} as any;

const player = {
  id: "player-1",
  teamId: "source-team",
  name: "Player One",
  jerseyNumber: "47",
  position: "SS",
  active: true,
  sortOrder: 1,
  createdAt: new Date(),
} as any;

const playerGame = {
  id: "stat-1",
  gameId: "game-1",
  playerId: "player-1",
  ab: 3,
  r: 2,
  h: 2,
  singles: 1,
  doubles: 1,
  triples: 0,
  hr: 0,
  bb: 0,
  hbp: 0,
  k: 0,
  swingK: 0,
  lookingK: 0,
  sb: 1,
  sac: 0,
  rbi: 2,
  pitchesSeen: 8,
  reachedBase: 2,
  fc: 0,
  roe: 0,
  summary: "1B; 2B; GO",
  comments: "Hard contact",
  position: "6",
  startingPosition: "6",
  battingOrder: 2,
  po: 2,
  a: 1,
  e: 0,
  pitchingOuts: 0,
  pc: 0,
  pBb: 0,
  so: 0,
  pH: 0,
  pR: 0,
  er: 0,
  source: "manual",
  updatedAt: new Date(),
} as any;

test("team copy plan remaps every relationship and preserves all recorded stats", () => {
  let next = 0;
  const plan = buildTeamCopyPlan("target-team", "Fall 2026", {
    sourceTeamId: "source-team",
    sourceSeason: "Fall 2026",
    selectedGameIds: ["game-1"],
    games: [game],
    players: [player],
    playerGames: [playerGame],
    playerFielding: [{
      id: "fielding-1", gameId: "game-1", playerId: "player-1", position: "6",
      po: 2, a: 1, e: 0, source: "manual", updatedAt: new Date(),
    } as any],
    teamFielding: [{
      id: "team-fielding-1", gameId: "game-1", position: "4",
      po: 1, a: 0, e: 1, source: "manual", updatedAt: new Date(),
    }],
  }, () => `new-${++next}`);

  assert.equal(plan.games.length, 1);
  assert.equal(plan.players.length, 1);
  assert.equal(plan.playerGames.length, 1);
  assert.equal(plan.playerFielding.length, 1);
  assert.equal(plan.teamFielding.length, 1);
  assert.equal(plan.games[0].teamId, "target-team");
  assert.equal(plan.games[0].season, "Fall 2026");
  assert.equal(plan.games[0].ourScore, 8);
  assert.equal(plan.players[0].teamId, "target-team");
  assert.equal(plan.playerGames[0].gameId, plan.games[0].id);
  assert.equal(plan.playerGames[0].playerId, plan.players[0].id);
  assert.equal(plan.playerGames[0].summary, "1B; 2B; GO");
  assert.equal(plan.playerGames[0].pitchingOuts, 0);
  assert.equal(plan.playerFielding[0].gameId, plan.games[0].id);
  assert.equal(plan.playerFielding[0].playerId, plan.players[0].id);
  assert.equal(plan.teamFielding[0].gameId, plan.games[0].id);
  assert.notEqual(plan.games[0].id, "game-1");
  assert.notEqual(plan.players[0].id, "player-1");
});

test("team copy plan rejects games outside the selected source season", () => {
  assert.throws(() => buildTeamCopyPlan("target-team", "Fall 2026", {
    sourceTeamId: "source-team",
    sourceSeason: "Spring 2026",
    selectedGameIds: ["game-1"],
    games: [game],
    players: [],
    playerGames: [],
    playerFielding: [],
    teamFielding: [],
  }), /does not belong/);
});

test("team copy plan rejects incomplete selections instead of partially copying", () => {
  assert.throws(() => buildTeamCopyPlan("target-team", "Fall 2026", {
    sourceTeamId: "source-team",
    sourceSeason: "Fall 2026",
    selectedGameIds: ["game-1", "missing-game"],
    games: [game],
    players: [],
    playerGames: [],
    playerFielding: [],
    teamFielding: [],
  }), /were not found/);
});
