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
- **Socioeconomic cluster** (hint 3): CBS **publication 1955**, "אפיון
  יחידות גאוגרפיות וסיווגן לפי הרמה החברתית-כלכלית של האוכלוסייה בשנת 2021"
  (**2021** data), two tables combined — `t02.xlsx` (sheet `לוח 2`, header row
  5: local authorities, 201 rows with a code) and `t08.xlsx` (sheet `לוח ב`,
  header row 8: localities inside regional councils, 996 rows), both at
  `https://www.cbs.gov.il/he/publications/DocLib/2025/1955/<file>`. Columns:
  `סמל יישוב` (join key) and `אשכול 2021[4]` (the official 1-10 index). The 54
  regional-council rows in `t02` have a blank `סמל יישוב` and are skipped.
  Coverage: **1178 of 1211** guessable localities, including **48 of 48**
  large-tier cities. The 33 without a value are genuinely absent from CBS
  (Bedouin tribal entries, IDF camps, and a handful like נווה זוהר / מקווה
  ישראל) — do not invent values for them; hint 3 simply omits the cluster line
  for those localities (`profileParts` in `js/app.js`).
  This replaced an earlier data.gov.il CKAN source
  (`social_economic_cluster`, 2019) that covered only localities inside a
  regional council — 976/1211 and **zero** major cities, which silently
  disabled the cluster for Tel Aviv/Jerusalem/Haifa. Don't go back to it.
  **Ship only the cluster, never the rank or index value**: `t02`'s ranks run
  1-255 and `t08`'s 1-996 on two separately standardized scales (measured
  means 0.000 vs 0.549) and are not comparable across the two tables.
- **City-profile components** (hint 3): the *same* publication 1955 (**2021**
  data), the two tables that carry the 15 raw variables behind the index:
  `t01.xlsx` (sheet `לוח 1`, header row 6 — 255 local authorities, **201** with
  a `סמל יישוב`; the 54 regional councils have a blank code) and
  `appendix.xlsx` (sheet `נספח`, header row 5 — localities inside regional
  councils with 2,000+ residents, **81** data rows, א→ת complete, then
  footnotes). Both share one column layout: `(ערך, ציון תקן, דירוג)` triplets
  per variable, the variable name sitting directly over its `ערך` column —
  **ship `ערך` (the raw value), never the standard score or the rank** (those
  ranks are per-universe and not comparable across the two files, the same trap
  as the socioeconomic rank above). Their code sets are disjoint (0 overlap).
  Only **six** of the 15 variables are shipped: `חציון גיל`,
  `אחוז בעלי תואר אקדמי מבני 27-54`, `הכנסה חודשית ממוצעת לנפש`,
  `מספר כלי רכב בבעלות ל-100 תושבים בני 17 ומעלה`,
  `אחוז משפחות עם 4 ילדים ויותר`, `ממוצע מספר ימי שהייה בחו"ל`.
  **`daysAbroad` is a *per-year* average** over the whole population (no age
  restriction): the column header in the table omits the period, but the
  index's full documented variable name is `ממוצע מספר ימי שהייה בחו"ל בשנה`,
  so the shipped `CITY_PROFILE_FIELDS` label deliberately ends in `בשנה`.
  **`ממוצע שנות לימוד של בני 25-54` (average years of schooling) was cut
  deliberately** — too close to the bagrut figure. Don't add it back, and
  don't add the other eight components either. Coverage: **280 of 1211**
  guessable localities and **48 of 48** large-tier cities; it is all-or-nothing
  per locality (CBS publishes the 15 components together), so every covered
  locality has all six. That 280 is the ceiling for this publication — the
  components exist only at authority level plus those 81 large regional-council
  localities. `t07`/`t09` cover all 996 regional-council localities but carry
  the index/cluster only, and `t12`/`t13` are statistical *sub*-areas inside
  cities, not new localities; neither adds profile coverage.
- **Peripherality** (hint 3): CBS **publication 1917**, "מדד פריפריאליות של
  יישובים ושל רשויות מקומיות, **2020**", single table
  `https://www.cbs.gov.il/he/publications/DocLib/2023/1917/table_02.xlsx`
  (sheet `לוח 2`, header rows 3/5, 1213 rows with a code — every locality in
  the country, cities included). Columns: `סמל יישוב` plus the
  `מדד פריפריאליות 2020` group's `דירוג` (rank) and `אשכול` (1-10 cluster).
  Coverage: **1182 of 1211**, **48 of 48** large-tier. Direction matters and
  is easy to get backwards: **low = peripheral, high = central** for both the
  cluster (1 = most peripheral) and the rank (1 = most peripheral, 1213 = most
  central — Tel Aviv is 1212, Eilat is 3). Unlike the socioeconomic rank this
  one IS a single comparable national scale, so it's safe to show players.
- **Matriculation (bagrut) eligibility %** (hint 3): the Ministry
  of Education's "שקיפות בחינוך" portal serves an **open, unauthenticated JSON
  API** — no key, no cookie. **Hostname matters and has cost two earlier
  investigations: `shkifut.education.gov.il` serves fine, while `edu.gov.il`
  403s and redirects to a gov.il landing page.** Two calls:
  `GET https://shkifut.education.gov.il/api/data/lists` → the 255 entries with
  `Mode == 2` are the local authorities; then per authority
  `GET https://shkifut.education.gov.il/api/data/rashutEduPic/?semelRashut=<Semel>&year=2024`
  → group `Id == 5` (בגרות) → class `Id == 12` → index `Id == "ACHUZ_ZAKAIM"`
  → `CompareValuesModel` entry named **`גרים ברשות`** (resident in the
  authority). **Use the resident series, not `לומדים ברשות`** (studying here):
  the studying series has two degenerate `0.0`s and a `100.0`, the resident one
  is clean (min 6.6, median 82.7, sd 15.1). Vintage **2024** (all 181 values;
  no year fallback was needed). Join: MoE `Semel` is the CBS locality code plus
  a check digit, so `cbs_id = Semel // 10` — validated against every authority
  whose `Semel // 10` hits a real CBS id, **zero mis-joins** (the 26 name
  disagreements are all spelling variants: קרית/קריית, נהריה/נהרייה, …).
  Coverage: **181 of 1211** guessable localities and **48 of 48** large-tier
  cities. That is near the structural ceiling — 230 of the 255 authorities have
  a value, but the rest are regional councils or merged authorities, and the
  ~950 villages inside regional councils have no authority-level bagrut rate in
  existence. **Caveat on 7 of the 181**: they join by normalized name rather
  than by code, and for five of those (באר טוביה 155, לכיש 24, מגידו 586,
  גזר 370, שפיר 692) the MoE entity is the eponymous *regional council*, so
  their figure is the whole council's, not that village's — all five are below
  every size tier's threshold, so they can only surface via an
  `answer-schedule.json` override. Values are baked into `data/bagrut.json` at
  build time; **never call this API from the browser** — it is an undocumented
  internal backend that can change shape without notice. The same endpoint also
  carries sibling per-authority indexes reachable exactly the same way —
  `ACHUZ_ZAKAIM_MITZTYEN` (excellence), `ACHUZ_ANGLIT_5YL` / `ACHUZ_MATEM_5YL`
  (5-unit English/maths), `ACHUZ_NESHIRA` (dropout), `GIUS_BANIM_LEZAVA`
  (enlistment) — none of them implemented.
  **The national average is not in the data.** Hint 3's bagrut bar draws a
  reference marker at `NATIONAL_BAGRUT_PCT` in `js/app.js` — a **hardcoded
  presentation constant** (2024: **76.6%**), not a per-locality figure and not a
  row in `data/bagrut.json`. It is stated to the player in the note under the
  bar, so if the per-locality vintage ever moves off 2024 this constant has to
  move with it.

**Fetching CBS data.** Direct file GETs under
`https://www.cbs.gov.il/he/publications/DocLib/<year>/<pub>/<file>` work fine
over plain unauthenticated `curl` with a normal browser User-Agent — CBS does
*not* block automated download. What looks like a block is that the
publication *pages* are JavaScript-rendered, so `curl`-ing a page returns an
empty shell. To enumerate a publication's files, use the SharePoint REST
folder listing, e.g.
`https://www.cbs.gov.il/he/publications/_api/web/GetFolderByServerRelativeUrl('/he/publications/DocLib/2025/1955')/Files?$select=Name,Length&$top=500`.
The sandbox has no `openpyxl`, no `pip` and no `unzip`; an `.xlsx` is a zip of
XML, so read it with stdlib `zipfile` + `xml.etree.ElementTree`, remembering
that `t="s"` cells hold indices into `xl/sharedStrings.xml`. (By contrast
`aws-e.data.gov.il` file downloads return 403 — use the CKAN
`datastore_search` API for data.gov.il, not the raw file URLs.)

## Locality pool: guessable vs. randomEligible vs. Random-mode size tiers

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

**Random-mode size tiers** are a third, independent dimension layered on top
of the above, computed client-side (no new data files) by
`computeSizeTierPools` in `js/app.js` and selected via a 3-position slider
(קטן/בינוני/גדול) that's only visible in Random mode — Daily mode's
fallback rotation and `answer-schedule.json` overrides are untouched by this
and still use `randomEligible` directly through `pickAnswerId`, unmodified:

- **קטן (small)**: every guessable locality with K25 (`results-25.json`)
  `eligible >= 1000` — looser than `randomEligible` (no K24 requirement), so
  it's a superset of בינוני. **331 of 1211**.
- **בינוני (medium)**: exactly the `randomEligible === true` set — **323**,
  byte-identical to the pool above, unchanged.
- **גדול (large)**: every guessable locality with K25 (`results-25.json`)
  `eligible >= 30000` — a fixed threshold, not a fixed count, so this number
  will shift if the underlying data ever changes. **48 of 1211** as of the
  currently committed data (Israel's largest cities/towns; Jerusalem/Tel
  Aviv/Haifa are all in it; large is a subset of קטן since 30000 > 1000).

`pickRandomAnswerId(pool)` now takes the pool array directly (whichever tier
is selected, via `state.sizeTierPools[state.sizeTier]`) instead of filtering
`randomEligible` itself — Random mode's default tier is `medium`, so
first-visit behavior is unchanged from before this feature existed.

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
- `socioeconomic.json`: `{ localityId: { cluster: 1-10|null } }`, an entry for
  every one of the 1211 guessable localities.
- `peripherality.json`: `{ localityId: { cluster: 1-10|null, rank:
  1-1213|null } }`, same shape/coverage convention — an entry for all 1211,
  both fields `null` together where CBS has no value.
- `bagrut.json`: `{ localityId: { pct: number|null, year: number|null } }`,
  same convention again — an entry for all 1211, both fields `null` together,
  181 with a value (all `year` 2024).
- `cityprofile.json`: `{ localityId: { medianAge, academicPct,
  incomePerPerson, vehiclesPer100, families4PlusPct, daysAbroad } }`, each
  `number|null`; an entry for all 1211, all six `null` together, **280** with
  values. 2021 CBS data — see the provenance section for the six variables'
  Hebrew labels and the one deliberately excluded.
  All four back hint 3 — see the provenance section above for their sources,
  coverage counts, the peripherality rank direction, and the bagrut
  join/series caveats.

## Wrong-guess feedback: percentile axes

The primary feedback on a wrong guess is one sentence naming the **single
biggest difference** between the guessed locality and the secret one; distance
and direction are only a late-game aid (see game mechanics). `DIFF_AXES` in
`js/app.js` holds the nine axes (each `{ key, source, field, up, down }`, the
`source` being a `state` data map), their percentile counts matching each
data file's coverage.

- **Latitude and longitude are deliberately NOT axes.** Adding them re-creates
  the geographic-guessing game this feedback exists to replace. Don't.
- **`vehiclesPer100` is deliberately NOT an axis either**, even though hint 3
  still displays it as one of the six profile figures. Being in
  `CITY_PROFILE_FIELDS` is not a reason to re-add it to `DIFF_AXES`.
- **Percentiles, not z-scores.** `buildPercentileTables()` ranks each axis over
  **its own population** (every locality holding that axis, not the answer
  pool) and maps rank → `[0,1]`; tied values share one percentile so an
  identical pair really does come out at gap 0. Standard scores were rejected:
  the distributions are heavy-tailed, flat or bimodal, so city size can reach a
  ~17-sd gap while peripherality rank caps around 3.5 and the biggest-gap
  contest degenerates into a contest about distribution shape.
- **Selection** is the strictly largest absolute percentile gap over axes where
  *both* localities have a value, ties going to the earlier axis in
  `DIFF_AXES` — deterministic, unweighted, no randomness. `size` covers all
  1211, so a shared axis always exists; a zero gap falls back to a neutral
  "very similar" line (27 of the 732,655 unordered pairs), and the
  no-shared-axis branch returns `''` rather than throwing.
- **Intensity** comes from the gap via `INTENSITY_MUCH_GAP` / `INTENSITY_SOME_GAP`
  (0.5 / 0.2), named constants at the top of `js/app.js` because they are
  expected to be re-tuned after play.
- **Both localities' real values ARE printed**, on a second line under the
  comparative sentence (`differenceDetail` returns `{ text, values }`, rendered
  as `.guess-difference` + `.guess-difference-values` — the one `values` string
  is split back on the shared `VALUES_SEPARATOR` constant so each half becomes
  its own chip; that split is presentational and the wording of each half is
  untouched). This **reverses** the
  original "comparative only, never reveal a value" rule: the captain asked for
  the numbers and accepts that they make the secret locality easier to
  identify — don't "fix" it back to comparative-only. The zero-gap neutral line
  has no winning axis and so carries no values. Each axis's `format` comes from
  the shared `FMT` map that `CITY_PROFILE_FIELDS` also uses, so a figure reads
  identically in the hint and in the feedback; the CBS source values are raw
  floats (income `7611.4655…`, academic % `43.3669…`) and are never printable
  as-is.
- **`periRank` direction is the easy one to get backwards**: high rank =
  central, rank 1 = most peripheral (see the peripherality provenance entry).

## Visual direction: "Ballot"

The whole UI is styled as Israel's physical ballot slip (פתק הצבעה): warm
paper, black ink, **hard** offset shadows (`box-shadow: 3px 3px 0 <color>`,
2px for chips) rather than blur, **square corners everywhere — no
`border-radius` at all**, 1px `--border` on cards and 2px ink on interactive
things, and one red accent used sparingly. `style.css` is the whole of it;
there is no build step and no framework.

- **Tokens** live in one `:root` block at the top of `style.css`: `--bg`
  `#efe9dc`, `--card` `#fdfcf8`, `--ink` `#1a1815`, `--border` `#ddd4c2`,
  `--muted` `#6e6558`, `--faint` `#a09582`, `--accent` `#c2382b`,
  `--bar-track` `#ece5d5`, `--dashed-divider` `#e8e0cf`. Use the tokens, not
  literals. (This replaced an earlier teal/green palette — don't reintroduce
  it.)
- **Fonts** are Hebrew-first, loaded by the single Google Fonts `<link>` in
  `index.html`'s head: **Secular One** (`--font-display`, weight 400 only) for
  the title, locality names, big numbers, ballot letters and percentages, and
  **Assistant** 400/600/700 (`--font-body`) for everything else. Both fall back
  through Noto Sans Hebrew / Arial Hebrew to `sans-serif`. The old
  `"Segoe UI", Arial, Helvetica` stack was the single worst thing about the
  previous look — Latin faces that merely happen to carry Hebrew glyphs.
- **Layout order in `index.html` is deliberate**: header, mode/tier/date
  controls, rules box, **the vote chart, then the guess input + pip counter**,
  win banner, history, hints. The chart is the puzzle, so it comes first; the
  guess box then sits directly above the previous-guesses list it feeds, which
  keeps a guess and its feedback in one glance. An earlier round had the input
  above the chart (to keep it off the fold) — that was the captain's correction,
  don't put it back. The page title is Hebrew (`קלפיגסר`) in both `<head>` and
  the header; an earlier brief that said to keep it Latin was wrong.
- **The vote chart must never get its own scrollbar.** `.bar-chart` carries no
  `max-height` and no `overflow` — it grows and the page scrolls. Each
  `.bar-row` is a four-column grid (boxed ballot letter, bar, party name,
  percentage) separated by a dashed `--dashed-divider` line, collapsing at
  ≤560px to letter | bar + % over the name. `renderBarChart` emits those four
  cells in that DOM order.
- **`PARTY_COLORS` in `js/app.js` is presentation only.** It maps a ballot
  letter to a bar colour for the twelve lists that cleared or approached the
  threshold in 2022/2021, echoing a party's own familiar colour where there is
  a well-known one; everything else — including any list whose colour we are
  not confident of — falls through to `PARTY_COLOR_FALLBACK` (`#8b857a`) rather
  than being guessed at. **It carries no political classification**: no bloc,
  no left/right grouping, no legend claiming one, and no game logic reads it.
  Don't turn it into one, and don't invent a colour to fill a gap.
- **`[hidden]` needs `style.css`'s `[hidden] { display: none !important; }`.**
  Everything toggled from `js/app.js` hides via the `hidden` attribute, whose
  UA `display: none` loses to any component `display` rule — that silently
  broke the size-tier slider and the date picker, both `display: flex`. The
  `!important` base rule is what makes attribute toggling work at all; keep it,
  and don't reach for a `.hidden` class instead.
- **Dark mode was deliberately not done.** A paper metaphor needs its own
  dark-variant design decision, which the captain has not made; there are no
  `prefers-color-scheme` blocks and adding one is out of scope until asked.

## Game mechanics notes

- **Hints cost guesses, and the cost is per-hint.** This supersedes the
  original brief's "no penalty/cost" hints — a later product decision (fix
  round 2) made a hint reveal add to the same count shown in the win banner
  ("פתרתם ב-N ניחושים"), via `state.hintPenalty` in `js/app.js`. **`HINT_COSTS`**
  (next to the tuning knobs at the top of `js/app.js`) holds the amount per
  hint key: hints 1–2 cost 1, **hint 3 costs 2** (it pools four datasets);
  an unlisted key falls back to 1. The charge happens exactly once per hint,
  at the `dataset.filled` transition inside `populateHint` — that is still the
  **only** place a cost is applied, and closing and reopening an
  already-revealed hint must not charge again. A hint whose cost is not 1
  states it in its own button label in `index.html` (hint 3 reads
  `רמז 3: פרופיל היישוב (2 ניחושים)`, its cost suffix wrapped in a
  `.hint-btn-cost` span so it can print in `--accent`); hints 1 and 2
  deliberately carry no "(1 ניחוש)" suffix. Keep label and `HINT_COSTS` in
  sync. Hints never get their own row in the guess-history list, only
  wrong/correct locality guesses do.
  **Two UI copy lines still say every hint counts as one guess** —
  `index.html`'s rules box (`כל רמז נספר כניחוש`, captain-verbatim text, see
  commit f855dcd) and the `.hint-cost-note` above the hint buttons. Both are
  now inaccurate for hint 3 and are awaiting a captain wording decision; do
  not reword them unprompted.
- **Distance/direction unlock when the visible counter reaches
  `DISTANCE_UNLOCK_GUESS` (5).** The gate is `state.guesses.length +
  state.hintPenalty` — the same number rendered into `#guess-counter` and shown
  in the win banner — so **opening hints DOES bring the map forward**. This is
  the captain's intent and the deliberate *reversal* of the earlier rule (6
  actual guesses, hints excluded); don't "fix" it back to guesses-only.
  Opening a hint therefore re-renders the history, and since `renderHistory`
  rebuilds the list each call, the unlocking event retroactively adds distance
  to the earlier rows too. The rules box's `מהניחוש החמישי` line must track
  this constant.
- **Every guess row is a `<button>` that expands that locality's K25 vote
  chart** (`aria-expanded`, several rows may be open at once; tooltips were
  rejected as touch-hostile). It reuses `renderBarChart` unchanged and must
  never touch `state.guesses` or `state.hintPenalty`.
- **A collapsible "איך משחקים" rules box** sits above the chart, expanded by
  default, its collapsed state in `localStorage` under `kalpiguessr.rulesCollapsed`
  inside try/catch (the accessor throws in some privacy modes).
- **Vote-share bars hide anything under 1%** (`MIN_VOTE_SHARE_PCT`, raised
  from 0.1). `renderBarChart` holds the only filter, so it applies identically
  to all three of its call sites — the current-round chart, the 24th-Knesset
  hint chart and an expanded guess row. `.chart-note` under the chart in
  `index.html` states the floor to the player.
- **Daily mode has an archive date-picker.** `startRound('daily', dateStr)`
  resolves any past date through the same `pickAnswerId` used for today; the
  picker's native `max` is clamped to today and `startRound` also clamps
  defensively (a manually-typed future date falls back to today) so a
  future day's answer can never leak early. Random mode has no date concept.
- **Random mode has a size-tier slider** (קטן/בינוני/גדול), hidden in Daily
  mode. Moving it immediately re-rolls a fresh round from the newly selected
  tier's pool (same reset as the "משחק אקראי חדש" button). See the size-tier
  section above for the three pools and `pickRandomAnswerId`'s tier param.
- **Exactly three hints** (`רמז 1`/`2`/`3`, no gaps): 1 turnout, 2 the K24
  vote chart, 3 the combined locality profile. An earlier
  most-similar-locality hint (Jensen-Shannon divergence over K25 vote shares,
  `js/stats.js`) was **deleted** along with that file and `state.partyLetters25`,
  its only consumer — don't resurrect either.
  Adding a hint means: a `hint-block` + `hint-btn`/`hint-output` pair in
  `index.html`, a branch in `populateHint`, and (if the data is incomplete) a
  hide line in `startRound`, and an entry in `HINT_COSTS` if it costs anything
  other than 1 — never a second `state.hintPenalty` write site.
- **Hint 3 pools four independently-covered datasets into one block**, drawn
  as three kinds of visual, not as `label: value` lines (an earlier round's
  eleven text lines were replaced). In display order: socioeconomic cluster and
  peripherality cluster each as a **ten-segment scale** (`clusterScaleHtml`,
  first N segments filled, numeral beside the label), peripherality carrying its
  national rank plus `פריפריאלי`/`מרכזי` end labels beneath — those labels are
  now the only thing stating the direction, so getting them backwards is silent;
  then bagrut as a **bar with a marker at the national average**; then the six
  `CITY_PROFILE_FIELDS` as a **three-column grid of number-first cards** under
  the "נתוני הלמ"ס לשנת 2021" sub-header (median age is whole years because CBS
  publishes it that way; the card labels are the same `CITY_PROFILE_FIELDS`
  strings the wrong-guess feedback uses, deliberately not shortened for the
  grid). `profileParts` in `js/app.js` resolves the four parts; each contributes
  its own block only when present, and `startRound` hides the whole hint only
  when **none** of the four do. Coverage: socioeconomic 1178,
  peripherality 1182, bagrut 181, profile 280 — union **1182 of 1211**, 29
  hidden, because peripherality is a strict superset of the other three (verified,
  zero localities have a part but no peripherality). The button label is the
  fixed `רמז 3: פרופיל היישוב (2 ניחושים)`: the old per-dataset dynamic label existed so the
  hint couldn't promise a line it wouldn't show, and with four parts a generic
  label achieves that without enumerating 15 combinations.
  **Many lines, still exactly one charge** — taken at the shared
  `dataset.filled` gate in `populateHint`, never per line or per part. That
  one charge is `HINT_COSTS.profile`, i.e. **2**, so opening hint 3 moves the
  counter 0→2 and reaches the `DISTANCE_UNLOCK_GUESS` gate after only three
  other guesses.
- **The live guess counter is square pips, not a number** — `#guess-counter`
  is the pip container and `renderGuessPips` fills it. Filled count is
  `state.guesses.length + state.hintPenalty`, the same number the win banner
  uses and the distance gate reads. Two rules the captain set explicitly:
  **always at least `DISTANCE_UNLOCK_GUESS` (5) pips**, even at zero, so the
  threshold is visible before it is reached; and **past five the row keeps
  growing, never capped and never switched back to a numeral** — seven counted
  guesses is seven filled pips. Hint 3 costs two, so the count can jump by two.
  The fifth pip carries `.pip-boundary` (a small gap + tick) *only* once the row
  is longer than five, keeping the threshold legible without a label. The
  container's `aria-label` carries the number for screen readers. It is
  rendered inside `renderHistory`, which is why opening a hint calls
  `renderHistory`.

## Testing notes

No Chrome/Chromium binary has been available in any sandbox this app was
built in, so browser-based visual verification (`chrome-devtools-axi`) has
never been run. Every round instead verifies with a **Node (or Python)
harness run against the real committed JSON in `data/`** — never fixtures,
never synthetic data. Things that method has established and that a future
round should re-check when it touches them:

- `js/geo.js` is pure logic with no DOM, so it runs directly in Node:
  haversine distance/bearing matches known city-pairs (Jerusalem→Tel Aviv
  ≈54km NW) and all 8 compass labels map to an arrow.
- Data-join integrity: all 1211 guessable localities have coords, K25 and K24
  records, and a `socioeconomic.json`, `peripherality.json`, `bagrut.json` and
  `cityprofile.json` entry, and K25/K24 per-party vote sums reconcile against
  `valid` with zero discrepancies.
- Call `populateHint('profile')` over all 1211 localities against the stubbed
  `state` and count the emitted blocks per locality — the cheapest proof of the
  hint's parts/hidden split without a browser. By present-part combination:
  29 with none (hidden) / 4 peripherality only / 893 socio+peri / 5
  socio+peri+bagrut / 104 socio+peri+profile / 176 all four. Assert per
  locality that blocks == parts present, that each cluster scale emits exactly
  10 segments, that the card count matches the non-null `CITY_PROFILE_FIELDS`,
  and that `state.hintPenalty` advances by exactly `HINT_COSTS.profile` (**2**)
  and not at all on a re-open. Check the peripherality direction here too, not
  only in the wrong-guess feedback: Tel Aviv (cluster 10) must fill all ten
  segments and Eilat (cluster 1) exactly one.
- Pip counter: `renderGuessPips` at counts 0/3/5/7/12 must emit 5/5/5/7/12 pips
  with 0/3/5/7/12 filled, and `.pip-boundary` only when the row exceeds five.
- **DOM-dependent code can be run in Node too**, without jsdom: strip
  `js/app.js`'s IIFE wrapper and its trailing `init().catch(...)`, `new
  Function` the body with a ~40-line `document` stub (createElement returning a
  plain object with `children`/`dataset`/`classList`/`addEventListener`) and
  stubbed `Geo`, then populate the returned `state` from the real JSON. That
  exercises `renderHistory`/`submitGuess`/the row toggles for real — how the
  distance gate, the expandable charts and the hint-charge invariants were
  verified. Cheaper and more honest than lifting branches out with a regex.
- Wrong-guess feedback: sweeping all 732,655 unordered pairs yields zero
  errors, zero empty sentences and 27 zero-gap (neutral-line) pairs; over
  25,000 random secret/guess pairs the axis win split is size 42.1%,
  socioCluster 25.2%, periRank 18.8%, everything else ≤3.4%. **Those figures
  depend on how the pairs are sampled** — drawing both localities uniformly
  from all 1211 instead gives ≈35/30/30 on unchanged code, so compare a split
  against the same sampler (or against the previous commit) before calling it a
  regression. A wildly different split means the percentile tables or the axis
  coverage broke. Also assert the
  `periRank` direction explicitly (Tel Aviv, rank 1212, must read as *more
  central* than Eilat, rank 3). Assert the printed values too: no
  `\d+\.\d{3,}` may survive into a sentence, both Hebrew labels must be
  present, and the neutral line must carry none.
- Answer selection: resolve several dates (an override, a fallback, an
  archive date) through `pickAnswerId`, and draw a few thousand times per
  size tier through `pickRandomAnswerId`, confirming every draw lands in the
  intended pool. When a change is *supposed* to leave selection alone, prove
  it with a zero-diff on `pickAnswerId`/`pickRandomAnswerId`/
  `computeSizeTierPools` as well as by re-resolving known dates.
- Current data coverage for reference: guessable 1211, `randomEligible` 323,
  size tiers small 331 / medium 323 / large 48; socioeconomic 1178,
  peripherality 1182, bagrut 181, city profile 280 — the last three all
  48/48 large-tier. Hint 3 visible for 1182 (their union), hidden for 29.

**The "Ballot" look has never been seen rendered**, neither the original
restyle nor the corrections on top of it (Hebrew title, chart-above-input order,
pip counter, 1% floor, the hint 3 redesign). Both rounds were verified only
structurally: id set cross-checked in both directions against `js/app.js`,
brace-balanced byte-diff of `pickAnswerId`/`pickRandomAnswerId`/
`computeSizeTierPools`/`DIFF_AXES`/`buildPercentileTables`/`differenceDetail`/
`distanceUnlocked`/`HINT_COSTS`/`CITY_PROFILE_FIELDS` against the previous
commit, every class the JS emits confirmed present in `style.css`, and the
harness checks above. If Chrome ever becomes available, a manual pass is still
worth doing before treating the UI itself as verified: guess flow,
autocomplete, RTL layout, all three hints (including that hint 3 hides for the
29 localities with no CBS value at all, and renders only the blocks a partial
locality has), the pip counter past five, the wrong-guess sentence and the
counter-5 distance unlock (reachable by hints alone), expanding a guess row
(pointer and keyboard), the rules box and its remembered collapsed state, the
archive date-picker, the size-tier slider, both mode-switcher buttons, and —
for the look specifically — phone width (~390px) with nothing overflowing
horizontally, the chart's folded two-line rows, and hint 3's stat grid folding
from three columns to two.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
