// Olé Quiniela front-end. Loads the data files, renders the leaderboard,
// per-player pages and fixtures, and live-refreshes results.json so everyone
// following along sees standings update without reloading.
import { leaderboard, scoreMember, MAX_POINTS, resultOf } from "./scoring.js";

const REFRESH_MS = 90_000;            // poll results.json every 90s
const ME = "Felipe Ortiz";            // highlighted as "you"

const state = {
  teams: [], byCode: {}, matches: [], byId: {},
  predictions: null, results: null,
  tab: "leaderboard", player: null, lbCache: null, q: "",
};

const $ = (sel, el = document) => el.querySelector(sel);
const view = $("#view");

// ---------- data loading ----------
async function getJSON(path, bust = false) {
  const url = bust ? `${path}?t=${Date.now()}` : path;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

async function loadStatic() {
  const [teams, matches, predictions] = await Promise.all([
    getJSON("./data/teams.json"),
    getJSON("./data/matches.json"),
    getJSON("./data/predictions.json"),
  ]);
  state.teams = teams;
  state.byCode = Object.fromEntries(teams.map((t) => [t.code, t]));
  state.matches = matches;
  state.byId = Object.fromEntries(matches.map((m) => [m.id, m]));
  state.predictions = predictions;
}

async function loadResults() {
  try {
    state.results = await getJSON("./data/results.json", true);
  } catch {
    state.results = { updated: null, matches: {}, topScorer: null, leastConceded: null };
  }
  state.lbCache = leaderboard(state.predictions, state.matches, state.results);
}

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const teamName = (code) => state.byCode[code]?.name ?? code;
const flag = (code) => state.byCode[code]?.flag ?? "🏳️";
const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function actualOf(id) {
  const a = state.results?.matches?.[id];
  return a && typeof a.home === "number" ? a : null;
}
function fmtKick(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtUpdated(iso) {
  if (!iso) return "not started";
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 90) return "updated just now";
  if (diff < 3600) return `updated ${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `updated ${Math.round(diff / 3600)}h ago`;
  return `updated ${new Date(iso).toLocaleDateString()}`;
}

// Predicted scoreline, always rendered HOME–AWAY (home team's goals first) so
// it reads identically to the actual result and to standard scoreboards.
function pickScoreText(pick, m) {
  if (!pick) return "—";
  const hg = pick.hg ?? "?", ag = pick.ag ?? "?";
  return `<span class="sc">${flag(m.homeCode)} ${hg}-${ag} ${flag(m.awayCode)}</span>`;
}

// ---------- header chrome ----------
function paintHeader() {
  const played = state.matches.filter((m) => actualOf(m.id)).length;
  $("#prog-text").textContent = `${played} / ${state.matches.length}`;
  $("#prog-bar").style.width = `${(played / state.matches.length) * 100}%`;
  $("#upd-text").textContent = fmtUpdated(state.results?.updated);
  $("#footer").innerHTML =
    `36 members · 72 group-stage matches · max ${MAX_POINTS} pts &nbsp;·&nbsp; ` +
    `Scoring: <b style="color:var(--hit3)">3</b> exact score · ` +
    `<b style="color:var(--hit1)">1</b> correct result · ` +
    `<b style="color:var(--bonus)">2</b> each bonus`;
}

// ===================================================================
// LEADERBOARD
// ===================================================================
function renderLeaderboard() {
  const rows = state.lbCache;
  const q = state.q.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;

  const body = shown.map((r) => {
    const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : "";
    const rc = r.rank <= 3 ? `top${r.rank}` : "";
    const me = r.name === ME ? `<span class="me-badge">YOU</span>` : "";
    return `<tr data-player="${esc(r.name)}">
      <td class="rank ${rc}">${medal ? `<span class="medal">${medal}</span>` : r.rank}</td>
      <td><span class="pname">${esc(r.name)}</span>${me}</td>
      <td class="hide-sm"><div class="chips">
        <span class="chip g">${r.exacts} exact</span>
        <span class="chip y">${r.correct} correct</span>
        ${r.bonus ? `<span class="chip b">+${r.bonus} bonus</span>` : ""}
      </div></td>
      <td class="num"><span class="pts">${r.total}</span></td>
    </tr>`;
  }).join("");

  view.innerHTML = `
    <div class="search">
      <span class="ic">🔎</span>
      <input id="lb-search" type="search" placeholder="Search your name or another player…"
             value="${esc(state.q)}" autocomplete="off" />
    </div>
    <div class="section-title">
      <h2>Leaderboard</h2>
      <span class="hint">most correct → least · updates live as results come in</span>
    </div>
    <div class="card">
      <table class="board">
        <thead><tr>
          <th class="rank">#</th><th>Player</th>
          <th class="hide-sm">Breakdown</th><th class="num">Pts</th>
        </tr></thead>
        <tbody>${body || `<tr><td colspan="4" class="empty">No players match “${esc(state.q)}”.</td></tr>`}</tbody>
      </table>
    </div>
    <div class="legend">
      <span><i class="dot" style="background:var(--hit3)"></i> exact score · 3 pts</span>
      <span><i class="dot" style="background:var(--hit1)"></i> correct result · 1 pt</span>
      <span><i class="dot" style="background:var(--bonus)"></i> bonus pick · 2 pts</span>
      <span><i class="dot" style="background:var(--miss)"></i> missed</span>
    </div>`;

  const input = $("#lb-search");
  input.addEventListener("input", (e) => { state.q = e.target.value; renderLeaderboard(); });
  // keep focus + caret while typing
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  view.querySelectorAll("tr[data-player]").forEach((tr) =>
    tr.addEventListener("click", () => go("player", tr.dataset.player)));
}

// ===================================================================
// PLAYER PAGE
// ===================================================================
function renderPlayerPicker() {
  const names = state.predictions.members.slice().sort((a, b) => a.localeCompare(b));
  view.innerHTML = `
    <div class="search">
      <span class="ic">👤</span>
      <input id="pp-search" list="pp-names" type="search"
             placeholder="Type a player's name to see their full card…" autocomplete="off" />
      <datalist id="pp-names">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
    </div>
    <div class="section-title"><h2>Players</h2><span class="hint">${names.length} members — pick anyone to see every prediction</span></div>
    <div class="card"><table class="board"><tbody>
      ${state.lbCache.map((r) => `<tr data-player="${esc(r.name)}">
        <td class="rank ${r.rank <= 3 ? "top" + r.rank : ""}">${r.rank}</td>
        <td><span class="pname">${esc(r.name)}</span>${r.name === ME ? '<span class="me-badge">YOU</span>' : ""}</td>
        <td class="num"><span class="pts">${r.total}</span></td>
      </tr>`).join("")}
    </tbody></table></div>`;
  const input = $("#pp-search");
  input.addEventListener("change", () => {
    if (state.predictions.picks[input.value]) go("player", input.value);
  });
  view.querySelectorAll("tr[data-player]").forEach((tr) =>
    tr.addEventListener("click", () => go("player", tr.dataset.player)));
}

function renderPlayer(name) {
  if (!state.predictions.picks[name]) return renderPlayerPicker();
  const member = { picks: state.predictions.picks[name], specials: state.predictions.specials[name] };
  const s = scoreMember(member, state.matches, state.results);
  const row = state.lbCache.find((r) => r.name === name);
  const rank = row?.rank ?? "—";

  // group matches by matchday
  const byMd = {};
  for (const m of state.matches) (byMd[m.matchday] ??= []).push(m);

  const bonusState = (hit) => hit === null ? ["pend", "Pending"] : hit ? ["ok", "✓ +2"] : ["no", "Missed"];
  const [tsCls, tsLab] = bonusState(s.topScorer.hit);
  const [lcCls, lcLab] = bonusState(s.leastConceded.hit);
  const lcPick = s.leastConceded.pick ? `${flag(s.leastConceded.pick)} ${teamName(s.leastConceded.pick)}` : "—";

  const mdHtml = Object.keys(byMd).sort((a, b) => a - b).map((md) => {
    const items = byMd[md].map((m) => {
      const pick = member.picks[m.id];
      const ps = s.perMatch[m.id];
      const actual = actualOf(m.id);
      const cls = ps.status === "pending" ? "" : ps.status;
      const ppLabel = ps.status === "pending" ? "·" : ps.points;
      const actualHtml = actual
        ? `<div class="actual"><div class="lab" style="color:var(--muted-2);font-size:10.5px">RESULT</div><span class="sc">${flag(m.homeCode)} ${actual.home}-${actual.away} ${flag(m.awayCode)}</span></div>`
        : `<div class="actual mini">${esc(fmtKick(m.utcDate))}</div>`;
      return `<div class="pick ${cls}">
        <div class="match-wrap" style="min-width:0">
          <div class="teams">
            <span class="flag">${flag(m.homeCode)}</span> ${esc(teamName(m.homeCode))}
            <span class="vs">v</span>
            <span class="flag">${flag(m.awayCode)}</span> ${esc(teamName(m.awayCode))}
          </div>
          <div class="meta">Group ${m.group} · ${esc(fmtKick(m.utcDate))}</div>
        </div>
        <div class="right">
          <div class="ppick"><div class="lab">pick</div><span>${pickScoreText(pick, m)}</span></div>
          ${actualHtml}
          <div class="pp ${ps.status === "pending" ? "pending" : ps.status}">${ppLabel}</div>
        </div>
      </div>`;
    }).join("");
    const grp = [...new Set(byMd[md].map((m) => m.group))].sort().join(" · ");
    return `<div class="md-group">
      <div class="md-label">Matchday ${md} <span class="gtag">Groups ${grp}</span></div>
      <div class="card">${items}</div>
    </div>`;
  }).join("");

  view.innerHTML = `
    <div style="margin:14px 0 4px"><a href="#leaderboard" id="back" class="pill">← Leaderboard</a></div>
    <div class="card">
      <div class="player-head">
        <div class="avatar">${esc(initials(name))}</div>
        <div class="pi">
          <h2>${esc(name)} ${name === ME ? '<span class="me-badge">YOU</span>' : ""}</h2>
          <div class="sub">Rank <b style="color:var(--ink)">#${rank}</b> of ${state.predictions.members.length} · ${s.played}/72 matches scored</div>
        </div>
        <div class="score-box"><div class="big">${s.total}</div><div class="of">/ ${MAX_POINTS} pts</div></div>
      </div>
      <div class="stat-row">
        <div class="stat"><div class="v" style="color:var(--hit3)">${s.exacts}</div><div class="l">Exact scores · 3 pts</div></div>
        <div class="stat"><div class="v" style="color:var(--hit1)">${s.correct - s.exacts}</div><div class="l">Result only · 1 pt</div></div>
        <div class="stat"><div class="v">${s.correct}</div><div class="l">Total correct</div></div>
        <div class="stat"><div class="v" style="color:var(--bonus)">${s.bonus}</div><div class="l">Bonus pts</div></div>
      </div>
      <div class="bonus-row">
        <div class="bonus"><div><div class="bl">Top goal scorer</div><div class="bv">⚽ ${esc(member.specials?.topScorer || "—")}</div></div><span class="state ${tsCls}">${tsLab}</span></div>
        <div class="bonus"><div><div class="bl">Least conceded</div><div class="bv">🛡️ ${lcPick}</div></div><span class="state ${lcCls}">${lcLab}</span></div>
      </div>
    </div>
    ${mdHtml}`;
  $("#back").addEventListener("click", (e) => { e.preventDefault(); go("leaderboard"); });
}

// ===================================================================
// FIXTURES
// ===================================================================
function renderFixtures() {
  const byMd = {};
  for (const m of state.matches) (byMd[m.matchday] ??= []).push(m);
  const html = Object.keys(byMd).sort((a, b) => a - b).map((md) => {
    const items = byMd[md].map((m) => {
      const a = actualOf(m.id);
      const raw = state.results?.matches?.[m.id];
      const status = raw?.status || (a ? "FINISHED" : "SCHEDULED");
      const res = a ? `<span class="res">${a.home} – ${a.away}</span>`
        : `<span class="when">${esc(fmtKick(m.utcDate))}</span>`;
      // crowd favourite
      let hCount = 0, aCount = 0, tCount = 0;
      for (const name of state.predictions.members) {
        const p = state.predictions.picks[name][m.id];
        if (!p) continue;
        if (p.result === "H") hCount++; else if (p.result === "A") aCount++; else tCount++;
      }
      const tot = hCount + aCount + tCount || 1;
      const fav = Math.max(hCount, aCount, tCount);
      const favTxt = fav === hCount ? teamName(m.homeCode) : fav === aCount ? teamName(m.awayCode) : "Draw";
      return `<div class="fx">
        <div class="when">${esc(fmtKick(m.utcDate))}<br><span style="color:var(--muted-2)">Grp ${m.group}</span></div>
        <div>
          <div class="pair"><span class="flag">${flag(m.homeCode)}</span> ${esc(teamName(m.homeCode))}
            <span class="vs" style="color:var(--muted-2)"> v </span>
            <span class="flag">${flag(m.awayCode)}</span> ${esc(teamName(m.awayCode))}</div>
          <div class="mini" style="margin-top:3px">Crowd pick: <b style="color:var(--ink)">${esc(favTxt)}</b> (${Math.round(fav / tot * 100)}%)</div>
        </div>
        <div style="text-align:right">${res}<br><span class="statustag ${status}">${status === "SCHEDULED" ? "upcoming" : status.toLowerCase()}</span></div>
      </div>`;
    }).join("");
    const date = fmtKick(byMd[md][0].utcDate).split(",")[0];
    return `<div class="md-group"><div class="md-label">Matchday ${md} <span class="gtag">${esc(date)}</span></div><div class="card">${items}</div></div>`;
  }).join("");
  view.innerHTML = `<div class="section-title"><h2>Fixtures &amp; Results</h2><span class="hint">all 72 group-stage matches · live scores auto-update</span></div>${html}`;
}

// ===================================================================
// routing
// ===================================================================
function render() {
  paintHeader();
  document.querySelectorAll("#tabs button").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === state.tab));
  if (state.tab === "leaderboard") renderLeaderboard();
  else if (state.tab === "player") state.player ? renderPlayer(state.player) : renderPlayerPicker();
  else renderFixtures();
  window.scrollTo({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
}

function go(tab, player = null) {
  state.tab = tab; state.player = player;
  const hash = tab === "player" && player ? `#player/${encodeURIComponent(player)}` : `#${tab}`;
  if (location.hash !== hash) location.hash = hash; else render();
}

function fromHash() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (h.startsWith("player/")) { state.tab = "player"; state.player = h.slice(7); }
  else if (h === "player") { state.tab = "player"; state.player = null; }
  else if (h === "fixtures") state.tab = "fixtures";
  else state.tab = "leaderboard";
}

// ---------- boot ----------
async function boot() {
  document.querySelectorAll("#tabs button").forEach((b) =>
    b.addEventListener("click", () => go(b.dataset.tab)));
  window.addEventListener("hashchange", () => { fromHash(); render(); });

  await loadStatic();
  await loadResults();
  fromHash();
  render();

  // live refresh
  setInterval(async () => {
    const prev = state.results?.updated;
    await loadResults();
    paintHeader();
    if (state.results?.updated !== prev) render();   // re-render only on change
  }, REFRESH_MS);
}

boot().catch((e) => {
  view.innerHTML = `<div class="empty">Couldn't load Quiniela data.<br><span class="mini">${esc(e.message)}</span></div>`;
  console.error(e);
});
