# Project agent memory

Static (no build step) Tradle/Worldle-style daily guessing game for Israeli
Knesset election results, in Hebrew/RTL. See `README.md` for how to run it.

## Data provenance

All election and locality data is real, sourced from official/authoritative
public datasets — nothing here is fabricated or approximated.

- **Vote results (25th Knesset, Nov 2022 and 24th Knesset, Mar 2021), by
  locality**: data.gov.il CKAN dataset `votes-knesset`
  (package id `26f9fa06-fcd7-4173-8df5-65797b63e857`), resources
  "תוצאות האמת של הבחירות לכנסת ה-25/24 לפי יישובים"
  (resource ids `b392b8ee-ba45-4ea0-bfed-f03a1a36e99c` for K25,
  `9921a347-8466-4ef4-81f9-22523c5c4632` for K24), pulled via the CKAN
  `datastore_search` API (`https://data.gov.il/api/3/action/datastore_search?resource_id=...`).
  Publisher: הוועדה המרכזית לבחירות לכנסת (Central Elections Committee).
- **Ballot letter → party name mapping**, per election: the CEC's own
  results sites (`votes25.bechirot.gov.il`, `votes24.bechirot.gov.il`) are a
  JS SPA that no longer serves usable content live, so the national-results
  page (which lists every ballot letter with its full party name) was
  recovered from the Wayback Machine at a post-election timestamp for each
  site (K25: snapshot `20221102175155`; K24: snapshot `20210411004331`,
  well after final results were certified). Cross-checked against the letter
  columns present in the `datastore_search` field list for each election —
  every letter in the CSV data has a corresponding name, and vice versa.
- **Locality coordinates**: data.gov.il CKAN dataset `localities-in-israel`
  (קובץ היישובים 2022), resource id `199b15db-3bcb-470e-ba03-73364737e352`,
  via `datastore_search`. This is the CBS "yishuvim" reference file. Its
  `קואורדינטות` field is a concatenated 12-digit ITM (Israel Transverse
  Mercator, EPSG:2039) easting/northing pair (6 digits each). Converted to
  WGS84 lat/lon with a from-scratch inverse Transverse-Mercator
  implementation (`/tmp/.../scratchpad/itm2wgs.py` used at data-build time,
  not shipped in the app since coordinates are pre-baked into
  `data/coords.json`) using GRS80 ellipsoid parameters and the official ITM
  projection parameters (central meridian 35°12'16.261"E, origin latitude
  31°44'03.817"N, false easting 219529.584, false northing 626907.390, scale
  1.0000067). Israel's ITM datum (Israel 1993) is GPS/ITRF-based and
  effectively coincides with WGS84 at this precision, so no separate datum
  shift was applied. Validated against several known-landmark coordinates
  (Jerusalem, Tel Aviv, Eilat) to within ~1km, which is expected since these
  are locality *centroids*, not landmark points — more than accurate enough
  for city-level distance/direction gameplay.
- **Socioeconomic cluster** (hint 4): data.gov.il CKAN dataset
  `social_economic_cluster` ("אשכול כלכלי חברתי של מועצות מקומיות ויישובים
  לשנת 2019"), resource id `7c860e04-9f8d-41c2-9f24-6249958d2081`, field
  `ESHKOL 2019` (CBS official 1-10 socioeconomic index), joined on
  `LOCALITY SYMBOL` = our locality id. This CBS resource, despite its title,
  only covers localities *within* one of Israel's ~54 regional councils
  (villages/kibbutzim/moshavim under a מועצה אזורית) — it does not include
  standalone cities or local councils (e.g. Tel Aviv, Jerusalem, Haifa are
  absent). Real coverage as a result: **976 of 1211** guessable localities
  have a cluster value. Rather than show a hollow "אין נתון" for the rest,
  hint 4's button+output are hidden entirely for those localities
  (`startRound` checks `state.socioeconomic[answerId].cluster` — see
  `js/app.js`). No other CKAN dataset with a *complete* (city + village)
  locality-level 1-10 cluster was found — searched data.gov.il broadly
  (`social_economic_cluster`, `citiesandsettelments`,
  `localities-in-israel`/`bycode2022` — that file's `אשכול רשויות מקומיות`
  field looked promising but turned out to be an unrelated regional-council
  sub-area code, not the socioeconomic index) before settling on this as the
  best real, joinable source.
- **Matriculation (bagrut) eligibility %**: investigated for hint 4 (searched
  data.gov.il under CBS/Ministry-of-Education/RAMA orgs, and read a CBS
  annual local-authorities release via a from-scratch PDF text extractor —
  none of it covered bagrut at locality level) and dropped entirely rather
  than ship a field that would always be `null`. Not present anywhere in the
  UI, `js/app.js`, or `data/socioeconomic.json` — don't reintroduce a
  `bagrutPct`-shaped field without an actual source behind it.

## Locality pool: guessable vs. randomEligible (two-tier model)

Join key across all three sources is the CBS locality code (סמל ישוב /
סמל יישוב — same numbering, different spelling across datasets). There is
one list, `data/localities.json`, with two independent concerns split by a
per-entry boolean:

- **Guessable** (inclusion in the list at all): a locality is included if it
  has a K25 result record, a K24 result record, *and* a coordinate record —
  full three-way join completeness, no fabrication, no partial records. This
  yields **1211 localities** — essentially every real Israeli locality with
  complete data across the three sources (a locality drops out only if the
  CBS coordinate file has no `קואורדינטות` value for it, which excludes ~32
  entries; K25/K24 vote data and the coordinate file's locality set are
  otherwise an exact match). Every guessable locality is a valid autocomplete
  match, unconditionally — `state.localities` in `js/app.js` is this whole
  list, never filtered by `randomEligible`.
- **`randomEligible: true|false`** (auto-selection eligibility): computed as
  eligible-voter count (בזב) ≥ 1000 in *both* K25 and K24 — the same rule
  that used to gate inclusion in the old single-tier pool, now demoted to a
  flag. **323 of 1211** localities are `randomEligible` (this is exactly the
  old pool, unchanged). It drops tiny sub-1000-voter settlements whose
  vote-share bars are dominated by single-digit vote counts and add noise
  rather than signal. `pickRandomAnswerId` (Random mode) and `pickAnswerId`'s
  no-override fallback rotation (Daily mode) in `js/app.js` both filter to
  `randomEligible === true` before selecting/rotating — the fallback rotation
  index is the locality's position within that filtered subset, not its
  position in the full list.

`data/answer-schedule.json` overrides are unaffected by `randomEligible` and
are the intentional way to feature a `randomEligible: false` locality (e.g.
a small town like מג'דל שמס, id `4201`) on a specific date — see
`js/app.js` (`pickAnswerId`).

A locality-data build/reconciliation script (kept at
`/tmp/.../scratchpad/` at generation time, not in the repo) pulled the full
CKAN datasets (no eligible-voter filter applied at fetch time), reconciled
`sum(per-party votes) == valid votes (כשרים)` for all 1211 kept localities
with zero discrepancies, and confirmed the old 323-locality pool is exactly
reproduced by the `randomEligible` rule applied to the new, larger pool.

Locality display names use the CBS reference file's spelling (`data/localities.json`),
which is more consistently punctuated (geresh/gershayim, parentheses for
kibbutz/moshav qualifiers) than the CEC's own locality-name column.

## Data files (`data/`)

- `results-25.json` / `results-24.json`: `{ localityId: { eligible, voters,
  invalid, valid, votes: { partyLetter: count } } }`.
- `parties-25.json` / `parties-24.json`: `{ partyLetter: partyName }`. Party
  sets differ between the two elections (real party splits/mergers/threshold
  changes between 2021 and 2022) — this is expected, not a bug.
- `coords.json`: `{ localityId: { lat, lon } }` (WGS84).
- `localities.json`: canonical `[{ id, name, randomEligible }]` list, sorted
  by name — see the two-tier model above. This exact order (filtered to
  `randomEligible === true`) is the fallback-rotation order for
  `answer-schedule.json` — do not reorder this file casually, since it
  changes which locality shows on un-overridden future dates.
- `answer-schedule.json`: `{ _meta: { epoch }, overrides: { "YYYY-MM-DD":
  localityId } }`. Fallback for any date without an override: `eligible =
  localities.filter(l => l.randomEligible)`, `dayIndex = floor((date -
  epoch) / 86400000)`, answer = `eligible[dayIndex mod eligible.length]`
  (local calendar dates, not UTC). Implemented in `js/app.js`
  (`pickAnswerId`). A separate "Random" mode (`pickRandomAnswerId`) picks
  uniformly from that same `randomEligible` subset, independent of
  date/schedule; the two modes share all guess/hint/win logic in
  `js/app.js` (`startRound(mode)`).
- `socioeconomic.json`: `{ localityId: { cluster: 1-10|null } }`. See the
  provenance section above for coverage and why there's no `bagrutPct`.

## Similarity hint methodology

Hint 3 (most similar locality) uses **Jensen-Shannon divergence** (`js/stats.js`)
over 25th-Knesset party vote-share vectors, not plain KL divergence: JSD is
symmetric (KL is not — "similar to X" should be a symmetric relation) and
handles parties with zero votes in a locality natively via the `0·log(0/x) := 0`
convention, so no artificial small-probability smoothing is needed the way
plain KL divergence would require.

## Game mechanics notes

- **Hints cost a guess.** This supersedes the original brief's "no
  penalty/cost" hints — a later product decision (fix round 2) made every
  hint reveal add 1 to the same count shown in the win banner
  ("פתרתם ב-N ניחושים"), via `state.hintPenalty` in `js/app.js`. The charge
  happens exactly once per hint, at the `dataset.filled` transition inside
  `populateHint` — closing and reopening an already-revealed hint must not
  charge again. Hints never get their own row in the guess-history list,
  only wrong/correct locality guesses do.
- **Vote-share bars hide anything under 0.1%.** `renderBarChart` filters by
  `pct >= 0.1`, applied identically to the current-round chart and the
  24th-Knesset hint chart since both go through that one function.
- **Daily mode has an archive date-picker.** `startRound('daily', dateStr)`
  resolves any past date through the same `pickAnswerId` used for today; the
  picker's native `max` is clamped to today and `startRound` also clamps
  defensively (a manually-typed future date falls back to today) so a
  future day's answer can never leak early. Random mode has no date concept.

## Testing notes

No Chrome/Chromium binary is available in the sandbox this app was built in,
so browser-based visual verification (`chrome-devtools-axi`) could not be
run. Instead, `js/geo.js` and `js/stats.js` (pure logic, no DOM) were
exercised in a Node harness against the real committed data: haversine
distance/bearing validated against known city-pairs (e.g. Jerusalem→Tel Aviv
≈54km NW), and the JSD similarity hint sanity-checked (Tel Aviv's most
similar locality by vote pattern comes out as Givatayim — its adjacent,
demographically similar neighbor, which is a strong correctness signal).
`data/answer-schedule.json` fallback logic and full data-join integrity (0
localities missing coords/results in either election) were also verified
this way. Chrome is still unavailable as of the follow-up round that added
Random mode and hint 4 (socioeconomic/bagrut) — that round's `startRound`,
`pickRandomAnswerId`, and `socioeconomic.json` join were likewise verified
by loading the real committed JSON in Node (2000 random draws all resolved
to valid localities; all 323 localities have a `socioeconomic.json` entry).
If Chrome becomes available, a manual pass (guess flow, autocomplete, RTL
layout, all four hints, both mode-switcher buttons) is still worth doing
before treating the UI itself as verified. Still true as of the round that
added the 0.1% vote-share filter, arrow-glyph directions, the Daily-mode
archive date-picker, and the hint-cost/hint-4-visibility changes — all
verified the same way (Node harness against the real committed JSON: the
0.1% filter checked against Tel Aviv's real vote breakdown, several archive
dates resolved through `pickAnswerId` to real localities, all 8 compass
labels confirmed to map to an arrow). Still true as of the round that split
the pool into guessable (1211) vs. `randomEligible` (323) — verified in Node
against the real committed JSON: zero localities missing any of the three
joined data sources, K25/K24 vote-sum reconciliation clean for all 1211,
`randomEligible` reproduces the old 323-locality pool exactly, 2000 fallback
rotation draws and 5000 `pickRandomAnswerId` draws all landed on
`randomEligible === true` localities, מג'דל שמס (id `4201`, real sub-1000
K24 eligible-voter count) confirmed guessable with `randomEligible: false`
and correctly featurable via an `answer-schedule.json` override, and today's
existing override (`4501`) still resolves correctly.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
