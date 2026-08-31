# Kalpiguessr (knesset-guessr)

A daily Tradle/Worldle-style guessing game for Israeli Knesset election results.
Every day the app picks a locality (yishuv) and shows only its 25th Knesset
(Nov 2022) vote-distribution bar chart. Guess the locality by name; each wrong
guess shows the distance (km) and compass direction to the real answer.

Plain static HTML/CSS/JS — no build step, no framework, no server-side code.

## Running locally

```bash
./run.sh          # serves on http://localhost:8000/
./run.sh 8765      # or pick a port
```

or directly:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in a browser. It must be served over HTTP
(not opened as a `file://` URL) so `fetch()` can load the JSON files in `data/`.

## Daily vs. Random mode

The mode switcher near the top of the page ("יומי" / "אקראי") picks how
today's locality is selected:

- **Daily** (default): the answer comes from `data/answer-schedule.json`,
  the same for every visitor on a given calendar day.
- **Random**: a locality is picked uniformly at random from
  `data/localities.json` on each visit or "משחק אקראי חדש" click. Guessing,
  distance/direction feedback, and hints all work identically in both modes.

In Daily mode, a date picker lets you replay any earlier date's puzzle
(clamped to today — no peeking at a future date). Every hint you reveal adds
1 to the guess count shown on a win, the same as a wrong guess.

## Changing the daily answer

Edit `data/answer-schedule.json` by hand — add an entry to `overrides` mapping
a `YYYY-MM-DD` date (local time) to a locality `id` from `data/localities.json`.
Any date without an explicit override falls back to a deterministic rotation
through `data/localities.json`. See `AGENTS.md` for the exact algorithm and
data sourcing/exclusion details.

## Project layout

- `index.html`, `style.css`, `js/` — the app itself.
- `data/results-25.json`, `data/results-24.json` — per-locality vote counts
  for the 25th (2022) and 24th (2021) Knesset elections.
- `data/parties-25.json`, `data/parties-24.json` — ballot-letter → party-name
  maps for each election.
- `data/coords.json` — per-locality WGS84 lat/lon (converted from the
  official ITM grid — see `AGENTS.md`).
- `data/socioeconomic.json` — per-locality CBS socioeconomic cluster (1-10),
  used for hint 4 (hidden when a locality has no cluster value) — see
  `AGENTS.md` for coverage and source caveats.
- `data/localities.json` — the canonical list of playable localities
  (autocomplete source + fallback rotation order).
- `data/answer-schedule.json` — hand-editable date → locality mapping.

## Data sources

Official Israeli Central Elections Committee results and CBS locality data
via data.gov.il. Full source URLs, join logic, exclusions, and the
similarity-hint methodology are documented in `AGENTS.md`.
