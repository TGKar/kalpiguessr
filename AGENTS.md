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
  absent). Real coverage as a result: **116 of 323** localities have a
  cluster value; the rest show `null` (UI: "אין נתון"). No other CKAN
  dataset with a *complete* (city + village) locality-level 1-10 cluster
  was found — searched data.gov.il broadly (`social_economic_cluster`,
  `citiesandsettelments`, `localities-in-israel`/`bycode2022` — that file's
  `אשכול רשויות מקומיות` field looked promising but turned out to be an
  unrelated regional-council sub-area code, not the socioeconomic index)
  before settling on this as the best real, joinable source.
- **Matriculation (bagrut) eligibility %** (hint 4): **not sourced** —
  `bagrutPct` is `null` for every locality in `data/socioeconomic.json`.
  This is a genuine, real CBS/Ministry-of-Education statistic (cited in
  press coverage as "special CBS processing"), but no authoritative
  locality-level dataset for it could be found as open, joinable,
  machine-readable data: it is absent from data.gov.il (searched under CBS,
  Ministry of Education, and RAMA/ראמ"ה organizations — the closest hits
  were `rama_meitzav`, an unrelated standardized-test dataset, and
  Ministry-of-Education "תמונה חינוכית" XLS resources that turned out to be
  2015/16-vintage and not datastore-indexed), and the CBS annual "הרשויות
  המקומיות בישראל" release that covers similar ground turned out (after
  building a from-scratch PDF text extractor, see below) to cover
  demographics/migration/wages/budget-by-cluster, not bagrut. Rather than
  transcribe numbers by hand from a news article or estimate, the field is
  left `null` everywhere — per the brief, a missing indicator should degrade
  gracefully ("אין נתון"), not be fabricated. If a real source turns up
  later, populate `bagrutPct` in `data/socioeconomic.json` the same way
  `cluster` is populated.

## Locality pool and exclusions

Join key across all three sources is the CBS locality code (סמל ישוב /
סמל יישוב — same numbering, different spelling across datasets). A locality
is included only if it has: a K25 result record, a K24 result record, *and*
a coordinate record, **and** eligible-voter count (בזב) ≥ 1000 in both
elections (drops tiny sub-1000-voter settlements whose vote-share bars are
dominated by single-digit vote counts and add noise rather than signal).
This yields **323 localities** (well above the ≥150–200 target). The build
script (kept at `/tmp/.../scratchpad/build_data.py` at generation time, not
in the repo) reconciled `sum(per-party votes) == valid votes (כשרים)` for
every kept locality with zero discrepancies before writing the committed
JSON.

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
- `localities.json`: canonical `[{ id, name }]` list, sorted by name. This
  exact order is also the fallback-rotation order for `answer-schedule.json`
  — do not reorder this file casually, since it changes which locality shows
  on un-overridden future dates.
- `answer-schedule.json`: `{ _meta: { epoch }, overrides: { "YYYY-MM-DD":
  localityId } }`. Fallback for any date without an override: `dayIndex =
  floor((date - epoch) / 86400000)`, answer = `localities[dayIndex mod
  length]` (local calendar dates, not UTC). Implemented in `js/app.js`
  (`pickAnswerId`). A separate "Random" mode (`pickRandomAnswerId`) picks
  uniformly from `localities.json` independent of date/schedule; the two
  modes share all guess/hint/win logic in `js/app.js` (`startRound(mode)`).
- `socioeconomic.json`: `{ localityId: { cluster: 1-10|null, bagrutPct:
  number|null } }`. See the provenance section above for what's real vs.
  `null` and why.

## Similarity hint methodology

Hint 3 (most similar locality) uses **Jensen-Shannon divergence** (`js/stats.js`)
over 25th-Knesset party vote-share vectors, not plain KL divergence: JSD is
symmetric (KL is not — "similar to X" should be a symmetric relation) and
handles parties with zero votes in a locality natively via the `0·log(0/x) := 0`
convention, so no artificial small-probability smoothing is needed the way
plain KL divergence would require.

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
before treating the UI itself as verified.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
