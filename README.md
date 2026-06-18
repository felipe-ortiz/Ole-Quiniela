# ⚽ Olé Quiniela 2026

A live leaderboard for the 2026 World Cup **Olé Quiniela** group-stage prediction
pool. Members enter once, then everyone follows along: search any player to see
their full prediction card, and the board re-sorts itself (most correct → least)
as real match results come in.

Static site — no backend, no build step. Publishes straight to **GitHub Pages**.

- **36 members**, **72 group-stage matches**, plus two bonus picks.
- **Scoring:** `3` correct result **and** exact score · `1` correct result ·
  `2` correct top goal scorer · `2` correct least-conceded team · **max 220**.
- **Live updates:** a GitHub Action pulls scores from football-data.org every
  15 minutes and commits `data/results.json`; the page recomputes points in the
  browser and re-ranks everyone.

## Pages

- **🏆 Leaderboard** — ranked standings, search, tie-breaks (exact scores, then
  correct results). Click any row → that player's card.
- **👤 Players** — every member's full prediction card: all 72 picks grouped by
  matchday, colour-coded green/yellow/red, plus the two bonus picks. Deep-links
  like `#player/Felipe%20Ortiz` are shareable.
- **📅 Fixtures** — all 72 matches with kickoff times, live scores, status, and
  the "crowd pick" for each game.

---

## Publish to GitHub Pages

1. Create a new repo (e.g. `ole-quiniela`) and push this folder to `main`.
   ```bash
   git remote add origin https://github.com/<you>/ole-quiniela.git
   git push -u origin main
   ```
2. **Settings → Pages → Build and deployment → Source: _Deploy from a branch_**,
   branch `main`, folder `/ (root)`. Save.
3. Your site goes live at `https://<you>.github.io/ole-quiniela/`. Share that
   link with the group.

That's it for a working site. The board will show everyone at 0 until results
start coming in (next section).

## Turn on live results (the auto-update Action)

1. Get a free API key at <https://www.football-data.org/client/register>.
2. In the repo: **Settings → Secrets and variables → Actions → New repository
   secret**, name it **`FOOTBALL_DATA_TOKEN`**, paste the key.
3. **Actions** tab → enable workflows if prompted → open **“Update results”** →
   **Run workflow** to populate immediately. After that it runs every 15 minutes
   during the group stage (Jun 11–28) and commits `data/results.json` whenever a
   score changes. Each commit redeploys Pages, so the leaderboard updates itself.

### The two bonus picks (manual)

Top goal scorer and least-conceded team are only known at the **end** of the
group stage, so set them by hand once. Edit `data/results.json`:

```json
{
  "topScorer": "Mbappe",        // matched loosely: last name + accents are fine
  "leastConceded": "ESP",       // a 3-letter team code from data/teams.json
  ...
}
```

Commit and push — everyone who picked them gets +2 each automatically.

### Fixing a wrong/auto score by hand

Add the match id to `overrides` and set the score; the Action will never
overwrite it:

```json
"overrides": ["MEXvRSA"],
"matches": { "MEXvRSA": { "home": 2, "away": 0, "status": "FINISHED" } }
```

### Faster live updates (optional but recommended)

The schedule is set to run every 5 min during **9 AM–10 PM Pacific**, but
**GitHub's built-in cron is best-effort and heavily throttled** — in practice it
only fires every 1–2 hours under load, so scores can lag badly during a match.

To get genuinely fast (~1–3 min) updates, trigger the workflow from a free
external pinger instead of relying on GitHub's scheduler:

1. Create a **fine-grained Personal Access Token** (GitHub → Settings →
   Developer settings → Fine-grained tokens) scoped to the `Ole-Quiniela` repo
   with **Actions: Read and write**. Copy it.
2. Create a free job at **[cron-job.org](https://cron-job.org)** (or any cron
   service):
   - **URL** `https://api.github.com/repos/felipe-ortiz/Ole-Quiniela/actions/workflows/update-results.yml/dispatches`
   - **Method** `POST`
   - **Headers** `Accept: application/vnd.github+json` ·
     `Authorization: Bearer <YOUR_TOKEN>` · `X-GitHub-Api-Version: 2022-11-28`
   - **Body** `{"ref":"main"}`
   - **Schedule** every 2–3 min, 9 AM–10 PM Pacific
3. Each ping runs the same job immediately (it still respects `overrides` and
   only commits on a real change). The repo is public, so Actions minutes are
   free.

This bypasses GitHub's flaky scheduler; the cron above stays as a backup.

---

## Data & rebuilding

| File | What it is |
|------|------------|
| `data/teams.json` | 48 teams: code, name, flag, group, FIFA rank |
| `data/matches.json` | 72 fixtures: stable id, group, matchday, kickoff, venue |
| `data/predictions.json` | every member's 72 picks + 2 bonus picks |
| `data/results.json` | actual results (kept up to date by the Action) |
| `js/scoring.js` | the scoring engine (shared by the site and the tests) |
| `source/2026_Quiniela_Members.xlsx` | the original member spreadsheet |

Predictions are parsed from the spreadsheet. To rebuild after editing it
(team-name typos are auto-corrected, and every scoreline is normalised to
**home–away** order — a winner-first cell like an away "Scotland 2-0" is stored
as `0-2` home–away, matching the live results feed and standard scoreboards):

```bash
pip3 install openpyxl
python3 scripts/build_data.py source/2026_Quiniela_Members.xlsx   # never touches results.json
node  scripts/test-scoring.mjs                                    # 55 checks
```

The build reuses the committed `data/matches.json` as the fixture schedule, so
it's fully self-contained.
