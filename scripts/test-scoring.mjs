// Deterministic tests for the Olé Quiniela scoring engine.
// Run: node scripts/test-scoring.mjs   (exits non-zero on failure)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scorePick, scoreMember, leaderboard, topScorerHit, MAX_POINTS } from "../js/scoring.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(ROOT, "data", p), "utf8"));

let pass = 0, fail = 0;
const eq = (got, want, msg) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.error(`✗ ${msg}\n    got  ${a}\n    want ${b}`); };
};

// ---- unit: scorePick ----
eq(scorePick({ result: "H", hg: 2, ag: 0 }, { home: 2, away: 0 }).points, 3, "exact home win = 3");
eq(scorePick({ result: "H", hg: 2, ag: 0 }, { home: 3, away: 1 }).points, 1, "right result wrong score = 1");
eq(scorePick({ result: "H", hg: 2, ag: 0 }, { home: 0, away: 1 }).points, 0, "wrong result = 0");
eq(scorePick({ result: "A", hg: 0, ag: 2 }, { home: 0, away: 2 }).points, 3, "exact away win = 3");
eq(scorePick({ result: "T", hg: 1, ag: 1 }, { home: 1, away: 1 }).points, 3, "exact draw = 3");
eq(scorePick({ result: "T", hg: 1, ag: 1 }, { home: 2, away: 2 }).points, 1, "draw right score wrong = 1");
eq(scorePick({ result: "H", hg: 2, ag: 0 }, null).status, "pending", "no result = pending");
eq(scorePick({ result: "A", hg: 1, ag: 2 }, { home: 1, away: 2 }).status, "hit3", "away exact status");

// ---- unit: topScorerHit ----
eq(topScorerHit("Mbappe", "Kylian Mbappé"), true, "last-name + accent match");
eq(topScorerHit("Harry Kane", "harry kane"), true, "case-insensitive full match");
eq(topScorerHit("Messi", "Mbappe"), false, "different players");

// ---- integration with real data ----
const matches = read("matches.json");
const predictions = read("predictions.json");
eq(predictions.members.length, 36, "36 members");
eq(matches.length, 72, "72 matches");
eq(MAX_POINTS, 220, "max points 220");

// every member has a pick for every match
for (const name of predictions.members) {
  const have = matches.filter((m) => predictions.picks[name][m.id]).length;
  if (have !== 72) { fail++; console.error(`✗ ${name} has ${have}/72 picks`); } else pass++;
}

// Empty results -> everyone 0, all tied rank 1
const empty = { matches: Object.fromEntries(matches.map((m) => [m.id, null])), topScorer: null, leastConceded: null };
const lb0 = leaderboard(predictions, matches, empty);
eq(lb0.every((r) => r.total === 0 && r.rank === 1), true, "empty results => all 0 / rank 1");

// Synthetic: make every actual result equal Felipe's pick exactly -> he should
// get a perfect-ish score (3 per match + any bonus we set to his pick).
const me = "Felipe Ortiz";
const full = { matches: {}, topScorer: predictions.specials[me].topScorer, leastConceded: predictions.specials[me].leastConceded };
for (const m of matches) {
  const p = predictions.picks[me][m.id];
  full.matches[m.id] = (typeof p.hg === "number" && typeof p.ag === "number")
    ? { home: p.hg, away: p.ag, status: "FINISHED" } : null;
}
const meScore = scoreMember({ picks: predictions.picks[me], specials: predictions.specials[me] }, matches, full);
eq(meScore.total, 72 * 3 + 4, "Felipe perfect board = 220");
eq(meScore.exacts, 72, "Felipe 72 exacts");
eq(meScore.bonus, 4, "Felipe both bonuses");
const lbFull = leaderboard(predictions, matches, full);
eq(lbFull[0].name, me, "Felipe tops the board on his perfect set");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
