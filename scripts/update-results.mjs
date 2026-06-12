// Pulls live/final 2026 World Cup group-stage scores from football-data.org
// (free tier) into data/results.json. The website recomputes every member's
// points from this file, so the leaderboard updates automatically.
//
//   • Match ids in "overrides" are never auto-touched (hand-entered fixes win).
//   • topScorer / leastConceded are bonus picks scored manually — this script
//     never clears them.
//   • Exits 0 with "No changes." when nothing moved; the workflow uses
//     git-diff to decide whether to commit.
//
// Usage: FOOTBALL_DATA_TOKEN=xxx node scripts/update-results.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MATCHES = join(ROOT, "data", "matches.json");
const TEAMS = join(ROOT, "data", "teams.json");
const RESULTS = join(ROOT, "data", "results.json");
const API = "https://api.football-data.org/v4/competitions/WC/matches?stage=GROUP_STAGE";

const token = process.env.FOOTBALL_DATA_TOKEN;
if (!token) { console.error("FOOTBALL_DATA_TOKEN is not set."); process.exit(1); }

// ---- team resolver (feed name / TLA -> our 3-letter code) ----
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

const teams = JSON.parse(readFileSync(TEAMS, "utf8"));
const ALIASES = {
  KOR: ["South Korea", "Korea Republic", "Korea, South", "Republic of Korea"],
  IRN: ["Iran", "IR Iran"],
  TUR: ["Turkiye", "Turkey"],
  CIV: ["Ivory Coast", "Cote d'Ivoire"],
  COD: ["DR Congo", "Congo DR", "Democratic Republic of the Congo", "Congo"],
  BIH: ["Bosnia and Herzegovina", "Bosnia & Herzegovina"],
  CPV: ["Cape Verde", "Cabo Verde"],
  CUW: ["Curacao"],
  USA: ["United States", "United States of America"],
  CZE: ["Czech Republic"],
};
const nameIndex = {};
for (const t of teams) {
  nameIndex[norm(t.name)] = t.code;
  nameIndex[norm(t.code)] = t.code;
  for (const a of ALIASES[t.code] || []) nameIndex[norm(a)] = t.code;
}
const codeSet = new Set(teams.map((t) => t.code));
function resolve(fdTeam) {
  for (const c of [fdTeam?.shortName, fdTeam?.name]) {
    if (c && nameIndex[norm(c)]) return nameIndex[norm(c)];
  }
  if (fdTeam?.tla && codeSet.has(fdTeam.tla)) return fdTeam.tla;     // exact TLA
  if (fdTeam?.tla && nameIndex[norm(fdTeam.tla)]) return nameIndex[norm(fdTeam.tla)];
  return null;
}
const mapStatus = (s) =>
  s === "FINISHED" ? "FINISHED" : (s === "IN_PLAY" || s === "PAUSED") ? "LIVE" : "SCHEDULED";

async function main() {
  const res = await fetch(API, { headers: { "X-Auth-Token": token } });
  if (!res.ok) { console.error(`football-data.org: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
  const fd = await res.json();

  const matches = JSON.parse(readFileSync(MATCHES, "utf8"));
  const results = JSON.parse(readFileSync(RESULTS, "utf8"));
  results.matches ||= {};
  const overrides = new Set(results.overrides || []);

  const byPair = {};
  for (const m of matches) {
    byPair[`${m.homeCode}|${m.awayCode}`] = m;
    byPair[`${m.awayCode}|${m.homeCode}`] = m;     // tolerate flipped feed orientation
  }

  let changed = 0;
  const unmatched = [];
  for (const fm of fd.matches || []) {
    const fh = resolve(fm.homeTeam), fa = resolve(fm.awayTeam);
    if (!fh || !fa) { unmatched.push(`${fm.homeTeam?.name} vs ${fm.awayTeam?.name}`); continue; }
    const m = byPair[`${fh}|${fa}`];
    if (!m) { unmatched.push(`${fh} vs ${fa} (not scheduled)`); continue; }
    if (overrides.has(m.id)) continue;

    const ft = fm.score?.fullTime;
    let score = (typeof ft?.home === "number" && typeof ft?.away === "number")
      ? { home: ft.home, away: ft.away } : null;
    // feed score is relative to ITS home/away — remap to ours if flipped
    if (score && fh === m.awayCode) score = { home: score.away, away: score.home };

    const status = mapStatus(fm.status);
    const prev = results.matches[m.id];
    const next = score ? { ...score, status } : (prev ? { ...prev, status } : null);
    if (JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null)) {
      results.matches[m.id] = next;
      changed++;
    }
  }

  if (unmatched.length) console.warn(`WARNING: ${unmatched.length} feed matches unmapped:\n  ${unmatched.join("\n  ")}`);
  if (!changed) { console.log("No changes."); return; }
  results.updated = new Date().toISOString();
  writeFileSync(RESULTS, JSON.stringify(results, null, 2) + "\n");
  console.log(`Updated ${changed} match result(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
