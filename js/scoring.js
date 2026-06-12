// Olé Quiniela scoring engine — the single source of truth for points,
// shared by the website (js/app.js) and the Node test suite
// (scripts/test-scoring.mjs).
//
// Rules (from the official point system):
//   • 1 point  — correct result (home win / away win / draw)
//   • 3 points — correct result AND exact final score
//   • 2 points — correct group-stage top goal scorer (bonus)
//   • 2 points — correct team with fewest goals conceded (bonus)
// Maximum = 72×3 + 2 + 2 = 220.

export const MAX_POINTS = 72 * 3 + 4;

// Result letter for a scoreline from the home team's perspective.
export function resultOf(home, away) {
  if (home > away) return "H";
  if (home < away) return "A";
  return "T";
}

// Score one match for one pick.
// pick   : { result:"H"|"A"|"T", hg, ag }  (hg/ag in official home-away order)
// actual : { home, away } | null            (null = not played yet)
// Returns { points, status, exact } where status is one of
// "pending" | "hit3" | "hit1" | "miss".
export function scorePick(pick, actual) {
  if (!actual || typeof actual.home !== "number" || typeof actual.away !== "number") {
    return { points: 0, status: "pending", exact: false };
  }
  if (!pick || !pick.result) {
    return { points: 0, status: "miss", exact: false };
  }
  const actualResult = resultOf(actual.home, actual.away);
  if (pick.result !== actualResult) {
    return { points: 0, status: "miss", exact: false };
  }
  const exact =
    typeof pick.hg === "number" && typeof pick.ag === "number" &&
    pick.hg === actual.home && pick.ag === actual.away;
  return exact
    ? { points: 3, status: "hit3", exact: true }
    : { points: 1, status: "hit1", exact: false };
}

// Loose name comparison for the top-scorer bonus: accent/case-insensitive,
// punctuation-stripped, and a last-name token also counts as a match
// (so "Mbappe" matches "Kylian Mbappé").
function normName(s) {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}
export function topScorerHit(pick, actual) {
  const p = normName(pick), a = normName(actual);
  if (!p || !a) return false;
  if (p === a) return true;
  const pl = p.split(" ").pop(), al = a.split(" ").pop();
  return pl.length >= 3 && pl === al;
}

// Score a whole member.
// member  : { picks:{ [matchId]: pick }, specials:{ topScorer, leastConceded } }
// matches : [{ id, ... }]
// results : { matches:{ [id]: {home,away}|null }, topScorer, leastConceded }
// Returns a rich summary used for both the leaderboard and the player page.
export function scoreMember(member, matches, results) {
  let total = 0, exacts = 0, correct = 0, played = 0, bonus = 0;
  const perMatch = {};
  for (const m of matches) {
    const pick = member.picks[m.id];
    const actual = results.matches ? results.matches[m.id] : null;
    const s = scorePick(pick, actual);
    perMatch[m.id] = s;
    if (s.status !== "pending") played++;
    if (s.status === "hit3") { exacts++; correct++; }
    else if (s.status === "hit1") correct++;
    total += s.points;
  }

  // bonuses
  const ts = member.specials?.topScorer;
  const tsHit = results.topScorer ? topScorerHit(ts, results.topScorer) : null;
  if (tsHit) { total += 2; bonus += 2; }
  const lc = member.specials?.leastConceded;
  const lcHit = results.leastConceded ? lc === results.leastConceded : null;
  if (lcHit) { total += 2; bonus += 2; }

  return {
    total, exacts, correct, played, bonus, perMatch,
    topScorer: { pick: ts, hit: tsHit },
    leastConceded: { pick: lc, hit: lcHit },
  };
}

// Build the ranked leaderboard. Ties broken by exact scores, then correct
// results, then name. Returns rows with a 1-based rank (shared on ties).
export function leaderboard(predictions, matches, results) {
  const rows = predictions.members.map((name) => {
    const member = { picks: predictions.picks[name], specials: predictions.specials[name] };
    return { name, ...scoreMember(member, matches, results) };
  });
  rows.sort((a, b) =>
    b.total - a.total ||
    b.exacts - a.exacts ||
    b.correct - a.correct ||
    a.name.localeCompare(b.name));
  let rank = 0, prevKey = null;
  rows.forEach((r, i) => {
    const key = `${r.total}|${r.exacts}|${r.correct}`;
    if (key !== prevKey) { rank = i + 1; prevKey = key; }
    r.rank = rank;
  });
  return rows;
}
