(function () {
  'use strict';

  const DATA_FILES = {
    localities: 'data/localities.json',
    results25: 'data/results-25.json',
    results24: 'data/results-24.json',
    coords: 'data/coords.json',
    parties25: 'data/parties-25.json',
    parties24: 'data/parties-24.json',
    schedule: 'data/answer-schedule.json',
    socioeconomic: 'data/socioeconomic.json',
    peripherality: 'data/peripherality.json',
    bagrut: 'data/bagrut.json',
    cityprofile: 'data/cityprofile.json',
  };

  const state = {
    localities: [],
    localitiesById: new Map(),
    results25: null,
    results24: null,
    coords: null,
    parties25: null,
    parties24: null,
    partyLetters25: [],
    schedule: null,
    socioeconomic: null,
    peripherality: null,
    bagrut: null,
    cityprofile: null,
    sizeTierPools: null,
    sizeTier: 'medium',
    mode: 'daily',
    dailyDate: null,
    answerId: null,
    guesses: [],
    hintPenalty: 0,
    won: false,
    activeSuggestionIndex: -1,
    currentSuggestions: [],
  };

  async function fetchJson(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return res.json();
  }

  function localDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Deterministic fallback: rotate through the randomEligible subset of the
  // committed locality list (in data/localities.json's relative order)
  // indexed by whole days since the epoch. data/answer-schedule.json can
  // override any specific date by hand with ANY guessable locality,
  // randomEligible or not.
  function pickAnswerId(schedule, localities, dateStr) {
    if (schedule.overrides && schedule.overrides[dateStr]) {
      return schedule.overrides[dateStr];
    }
    const eligible = localities.filter((loc) => loc.randomEligible);
    const epoch = (schedule._meta && schedule._meta.epoch) || '2024-01-01';
    const epochDate = new Date(`${epoch}T00:00:00`);
    const today = new Date(`${dateStr}T00:00:00`);
    const dayIndex = Math.floor((today - epochDate) / 86400000);
    const n = eligible.length;
    const idx = ((dayIndex % n) + n) % n;
    return eligible[idx].id;
  }

  function pickRandomAnswerId(pool) {
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx].id;
  }

  // Random-mode-only size tiers, layered on top of (and independent from)
  // randomEligible: 'medium' IS the existing randomEligible subset (323
  // localities, unchanged); 'small' is a looser >=1000-eligible-voters-in-K25
  // cut (no both-elections requirement, so it's a superset of 'medium');
  // 'large' is every guessable locality with K25 eligible voters >= 30000
  // (currently 48 — not a fixed round number, it'll shift if the underlying
  // data ever changes). Daily mode's fallback rotation and
  // answer-schedule.json overrides only ever use randomEligible directly
  // (see pickAnswerId) and never touch these pools.
  const SIZE_TIERS = ['small', 'medium', 'large'];
  const LARGE_TIER_MIN_ELIGIBLE = 30000;

  function computeSizeTierPools(localities, results25) {
    const small = localities.filter((loc) => {
      const rec = results25[loc.id];
      return rec && rec.eligible >= 1000;
    });
    const medium = localities.filter((loc) => loc.randomEligible);
    const large = localities.filter((loc) => {
      const rec = results25[loc.id];
      return rec && rec.eligible >= LARGE_TIER_MIN_ELIGIBLE;
    });
    return { small, medium, large };
  }

  const MIN_VOTE_SHARE_PCT = 0.1;

  function renderBarChart(container, votes, partiesMap, validTotal) {
    container.innerHTML = '';
    const entries = Object.entries(votes)
      .map(([letter, count]) => ({
        letter,
        name: partiesMap[letter] || letter,
        count,
        pct: (count / validTotal) * 100,
      }))
      .filter((entry) => entry.pct >= MIN_VOTE_SHARE_PCT)
      .sort((a, b) => b.count - a.count);

    if (entries.length === 0) {
      container.innerHTML = '<p class="history-empty">אין נתונים להצגה.</p>';
      return;
    }

    const maxPct = entries[0].pct;
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'bar-row';

      const label = document.createElement('div');
      label.className = 'bar-label';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'party-name';
      nameSpan.textContent = entry.name;
      const letterSpan = document.createElement('span');
      letterSpan.className = 'party-letter';
      letterSpan.textContent = entry.letter;
      label.appendChild(nameSpan);
      label.appendChild(letterSpan);

      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = `${(entry.pct / maxPct) * 100}%`;
      track.appendChild(fill);

      const pctLabel = document.createElement('div');
      pctLabel.className = 'bar-pct';
      pctLabel.textContent = `${entry.pct.toFixed(1)}%`;

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(pctLabel);
      container.appendChild(row);
    }
  }

  function formatDistance(km) {
    if (km < 10) return `${km.toFixed(1)} ק"מ`;
    return `${Math.round(km)} ק"מ`;
  }

  // Maps Geo.compassLabel's Hebrew word (bearing bucketing stays in geo.js
  // untouched) to a display arrow. The Hebrew word is kept as a
  // title/aria-label for accessibility rather than dropped.
  const DIRECTION_ARROWS = {
    'צפון': '↑',
    'צפון-מזרח': '↗',
    'מזרח': '→',
    'דרום-מזרח': '↘',
    'דרום': '↓',
    'דרום-מערב': '↙',
    'מערב': '←',
    'צפון-מערב': '↖',
  };

  function renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    if (state.guesses.length === 0) {
      list.innerHTML = '<li class="history-empty">עדיין לא ניחשתם. התחילו להקליד למעלה.</li>';
      return;
    }
    // Most recent guess first.
    for (let i = state.guesses.length - 1; i >= 0; i--) {
      const g = state.guesses[i];
      const li = document.createElement('li');
      if (g.correct) li.classList.add('correct');

      const nameEl = document.createElement('span');
      nameEl.className = 'guess-name';
      nameEl.textContent = g.name;

      const distEl = document.createElement('span');
      distEl.className = 'guess-distance';
      distEl.textContent = g.correct ? 'זהו זה!' : formatDistance(g.distance);

      const dirEl = document.createElement('span');
      dirEl.className = 'guess-direction';
      if (g.correct) {
        dirEl.textContent = '🎯';
      } else {
        dirEl.textContent = DIRECTION_ARROWS[g.direction] || g.direction;
        dirEl.title = g.direction;
        dirEl.setAttribute('aria-label', g.direction);
      }

      li.appendChild(nameEl);
      li.appendChild(distEl);
      li.appendChild(dirEl);
      list.appendChild(li);
    }
  }

  function showWin() {
    state.won = true;
    const answer = state.localitiesById.get(state.answerId);
    const banner = document.getElementById('win-banner');
    const text = document.getElementById('win-text');
    const count = state.guesses.length + state.hintPenalty;
    const guessWord = count === 1 ? 'ניחוש אחד' : `${count} ניחושים`;
    text.textContent = `כל הכבוד! היישוב הוא ${answer.name}. פתרתם ב-${guessWord}.`;
    banner.hidden = false;

    const input = document.getElementById('guess-input');
    input.disabled = true;
    input.placeholder = 'המשחק הסתיים';
  }

  function submitGuess(localityId) {
    if (state.won) return;
    const guessed = state.localitiesById.get(localityId);
    const answer = state.localitiesById.get(state.answerId);
    if (!guessed || !answer) return;

    if (localityId === state.answerId) {
      state.guesses.push({ name: guessed.name, correct: true });
      renderHistory();
      showWin();
      return;
    }

    const guessCoord = state.coords[localityId];
    const answerCoord = state.coords[state.answerId];
    const distance = Geo.haversineKm(guessCoord.lat, guessCoord.lon, answerCoord.lat, answerCoord.lon);
    const bearing = Geo.bearingDeg(guessCoord.lat, guessCoord.lon, answerCoord.lat, answerCoord.lon);
    const direction = Geo.compassLabel(bearing);

    state.guesses.push({ name: guessed.name, correct: false, distance, direction });
    renderHistory();
  }

  function normalizeForSearch(str) {
    return str.replace(/["'`׳״]/g, '').replace(/[\s-]+/g, ' ').trim().toLowerCase();
  }

  function setupAutocomplete() {
    const input = document.getElementById('guess-input');
    const list = document.getElementById('suggestions');

    function closeSuggestions() {
      list.hidden = true;
      list.innerHTML = '';
      state.currentSuggestions = [];
      state.activeSuggestionIndex = -1;
      input.setAttribute('aria-expanded', 'false');
    }

    function renderSuggestions(matches) {
      list.innerHTML = '';
      state.currentSuggestions = matches;
      state.activeSuggestionIndex = -1;
      if (matches.length === 0) {
        closeSuggestions();
        return;
      }
      matches.forEach((loc, i) => {
        const li = document.createElement('li');
        li.textContent = loc.name;
        li.setAttribute('role', 'option');
        li.dataset.id = loc.id;
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          chooseSuggestion(i);
        });
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function chooseSuggestion(index) {
      const loc = state.currentSuggestions[index];
      if (!loc) return;
      input.value = '';
      closeSuggestions();
      submitGuess(loc.id);
    }

    function updateActiveHighlight() {
      const items = list.querySelectorAll('li');
      items.forEach((li, i) => li.classList.toggle('active', i === state.activeSuggestionIndex));
    }

    input.addEventListener('input', () => {
      const q = normalizeForSearch(input.value);
      if (!q) {
        closeSuggestions();
        return;
      }
      const matches = state.localities
        .filter((loc) => normalizeForSearch(loc.name).includes(q))
        .slice(0, 8);
      renderSuggestions(matches);
    });

    input.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.activeSuggestionIndex = Math.min(
          state.activeSuggestionIndex + 1,
          state.currentSuggestions.length - 1
        );
        updateActiveHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.activeSuggestionIndex = Math.max(state.activeSuggestionIndex - 1, 0);
        updateActiveHighlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (state.activeSuggestionIndex >= 0) {
          chooseSuggestion(state.activeSuggestionIndex);
        } else if (state.currentSuggestions.length === 1) {
          chooseSuggestion(0);
        }
      } else if (e.key === 'Escape') {
        closeSuggestions();
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(closeSuggestions, 100);
    });

    document.getElementById('guess-form').addEventListener('submit', (e) => e.preventDefault());
  }

  function setupHints() {
    const buttons = document.querySelectorAll('.hint-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const hint = btn.dataset.hint;
        const output = document.getElementById(`hint-${hint}`);
        const nowShown = output.hidden;
        output.hidden = !nowShown;
        btn.setAttribute('aria-pressed', String(nowShown));
        if (nowShown) populateHint(hint);
      });
    });
  }

  // Hint 6's six CBS socioeconomic component variables, in display order.
  // CBS publishes median age as whole years, so it's shown without a decimal;
  // the rest keep one decimal, and income is whole shekels. Deliberately
  // excludes `ממוצע שנות לימוד` (average years of schooling) — see AGENTS.md.
  const CITY_PROFILE_FIELDS = [
    { key: 'medianAge', label: 'גיל חציוני', format: (v) => `${Math.round(v)}` },
    { key: 'academicPct', label: 'בעלי תואר אקדמי (גילאי 27-54)', format: (v) => `${v.toFixed(1)}%` },
    { key: 'incomePerPerson', label: 'הכנסה חודשית ממוצעת לנפש', format: (v) => `${Math.round(v).toLocaleString('he-IL')} ₪` },
    { key: 'vehiclesPer100', label: 'כלי רכב בבעלות ל-100 תושבים בני 17 ומעלה', format: (v) => v.toFixed(1) },
    { key: 'families4PlusPct', label: 'משפחות עם 4 ילדים ויותר', format: (v) => `${v.toFixed(1)}%` },
    { key: 'daysAbroad', label: 'ממוצע ימי שהייה בחו"ל', format: (v) => v.toFixed(1) },
  ];

  // Every hint costs a guess, charged exactly once: the same dataset.filled
  // gate that stops a hint's content from being re-fetched also stops the
  // guess count from double-counting a hint that's toggled closed and
  // reopened. Centralized here so every hint type pays the same way.
  function populateHint(hint) {
    const out = document.getElementById(`hint-${hint}`);
    if (out.dataset.filled) return;
    out.dataset.filled = '1';
    state.hintPenalty++;

    const answer = state.results25[state.answerId];
    if (hint === 'turnout') {
      const turnoutPct = ((answer.voters / answer.eligible) * 100).toFixed(1);
      out.innerHTML = `
        <p>בעלי זכות בחירה: <strong>${answer.eligible.toLocaleString('he-IL')}</strong></p>
        <p>הצביעו בפועל: <strong>${answer.voters.toLocaleString('he-IL')}</strong> (${turnoutPct}% אחוז הצבעה)</p>
      `;
    } else if (hint === 'k24') {
      const rec24 = state.results24[state.answerId];
      const container = document.getElementById('chart-24');
      renderBarChart(container, rec24.votes, state.parties24, rec24.valid);
    } else if (hint === 'similar') {
      const { id } = Stats.findMostSimilarLocality(state.answerId, state.results25, state.partyLetters25);
      const similarName = state.localitiesById.get(id).name;
      out.innerHTML = `<p>היישוב עם פילוג הקולות הדומה ביותר הוא <strong>${similarName}</strong>.</p>`;
    } else if (hint === 'socioeconomic') {
      // Two datasets, one hint, one charge: both lines share the single
      // dataset.filled gate above, so neither adds a second hintPenalty.
      const socioRec = state.socioeconomic[state.answerId];
      const bagrutRec = state.bagrut[state.answerId];
      let html = '';
      if (socioRec && socioRec.cluster != null) {
        html += `<p>אשכול חברתי-כלכלי (למ"ס, 2021): <strong>${socioRec.cluster}</strong> (מתוך 1-10)</p>`;
      }
      if (bagrutRec && bagrutRec.pct != null) {
        html += `<p>זכאות לבגרות (משרד החינוך, ${bagrutRec.year}): <strong>${bagrutRec.pct}%</strong> מתלמידי כיתות י"ב הגרים ביישוב</p>`;
      }
      out.innerHTML = html;
    } else if (hint === 'peripherality') {
      // CBS peripherality: cluster 1 = most peripheral, 10 = most central, and
      // the 1-1213 national rank runs the same way (rank 1 = most peripheral).
      const rec = state.peripherality[state.answerId];
      out.innerHTML = `
        <p>אשכול פריפריאליות (למ"ס): <strong>${rec.cluster}</strong> (מתוך 1-10; 1 = פריפריאלי ביותר, 10 = מרכזי ביותר)</p>
        <p>דירוג ארצי: <strong>${rec.rank}</strong> מתוך 1,213 יישובים (ככל שהדירוג גבוה יותר, היישוב מרכזי יותר)</p>
      `;
    } else if (hint === 'cityprofile') {
      // Six CBS component variables, up to six lines — but still a single
      // charge, taken at the shared dataset.filled gate above, exactly like
      // hint 4's two lines. Fields with no value are omitted line by line;
      // startRound hides the whole block when all six are null.
      const rec = state.cityprofile[state.answerId];
      const lines = CITY_PROFILE_FIELDS
        .filter((f) => rec && rec[f.key] != null)
        .map((f) => `<p>${f.label}: <strong>${f.format(rec[f.key])}</strong></p>`);
      out.innerHTML = `<p class="hint-source">נתוני הלמ"ס לשנת 2021:</p>${lines.join('')}`;
    }
  }

  function resetHints() {
    document.querySelectorAll('.hint-btn').forEach((btn) => {
      btn.setAttribute('aria-pressed', 'false');
    });
    document.querySelectorAll('.hint-output').forEach((out) => {
      out.hidden = true;
      delete out.dataset.filled;
      if (!out.querySelector('.bar-chart')) out.innerHTML = '';
    });
  }

  function formatDateForDisplay(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  // Starts (or restarts) a round in the given mode: picks a new answer,
  // clears guesses/hints/win state, and re-renders the answer's 25th-Knesset
  // chart. Used both for the initial load and for mode/round switches. For
  // 'daily' mode, dateStr picks which day's puzzle to resolve via the same
  // pickAnswerId(schedule, localities, dateStr) used for today; omitted, it
  // defaults to today's local date (the archive date-picker is what supplies
  // an explicit dateStr for earlier days).
  function startRound(mode, dateStr) {
    state.mode = mode;
    const today = localDateStr(new Date());

    if (mode === 'random') {
      state.answerId = pickRandomAnswerId(state.sizeTierPools[state.sizeTier]);
      state.dailyDate = null;
    } else {
      let target = dateStr || today;
      if (target > today) target = today; // never reveal a future date's answer
      state.dailyDate = target;
      state.answerId = pickAnswerId(state.schedule, state.localities, target);
    }
    state.guesses = [];
    state.hintPenalty = 0;
    state.won = false;

    const answerRec = state.results25[state.answerId];
    renderBarChart(document.getElementById('chart-25'), answerRec.votes, state.parties25, answerRec.valid);
    renderHistory();
    resetHints();

    // Hint 4 carries two independent datasets; hide it only when neither has a value.
    const socioRec = state.socioeconomic[state.answerId];
    const bagrutRec = state.bagrut[state.answerId];
    document.getElementById('hint-block-socioeconomic').hidden =
      (!socioRec || socioRec.cluster == null) && (!bagrutRec || bagrutRec.pct == null);

    const periRec = state.peripherality[state.answerId];
    document.getElementById('hint-block-peripherality').hidden = !periRec || periRec.cluster == null;

    const profileRec = state.cityprofile[state.answerId];
    document.getElementById('hint-block-cityprofile').hidden =
      !profileRec || CITY_PROFILE_FIELDS.every((f) => profileRec[f.key] == null);

    const input = document.getElementById('guess-input');
    input.disabled = false;
    input.value = '';
    input.placeholder = 'הקלידו שם יישוב...';

    document.getElementById('win-banner').hidden = true;

    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.setAttribute('aria-selected', String(btn.dataset.mode === mode));
    });
    document.getElementById('new-random-btn').hidden = mode !== 'random';

    const sizeTierWrap = document.getElementById('size-tier-wrap');
    sizeTierWrap.hidden = mode !== 'random';

    const datePickerWrap = document.getElementById('date-picker-wrap');
    datePickerWrap.hidden = mode !== 'daily';
    if (mode === 'daily') {
      const dateInput = document.getElementById('date-picker');
      const status = document.getElementById('date-picker-status');
      dateInput.value = state.dailyDate;
      status.textContent = state.dailyDate === today ? 'היום' : formatDateForDisplay(state.dailyDate);
    }
  }

  function setupModeSwitcher() {
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => startRound(btn.dataset.mode));
    });
    document.getElementById('new-random-btn').addEventListener('click', () => startRound('random'));
  }

  // Moving the slider immediately re-rolls a fresh round from the newly
  // selected tier's pool (same reset behavior as "משחק אקראי חדש").
  function setupSizeTierSlider() {
    const slider = document.getElementById('size-tier-slider');
    slider.addEventListener('input', () => {
      state.sizeTier = SIZE_TIERS[Number(slider.value)];
      startRound('random');
    });
  }

  function setupDatePicker() {
    const dateInput = document.getElementById('date-picker');
    const today = localDateStr(new Date());
    dateInput.max = today;
    dateInput.addEventListener('change', () => {
      if (!dateInput.value) return;
      startRound('daily', dateInput.value);
    });
  }

  async function init() {
    const [localities, results25, results24, coords, parties25, parties24, schedule,
      socioeconomic, peripherality, bagrut, cityprofile] =
      await Promise.all([
        fetchJson(DATA_FILES.localities),
        fetchJson(DATA_FILES.results25),
        fetchJson(DATA_FILES.results24),
        fetchJson(DATA_FILES.coords),
        fetchJson(DATA_FILES.parties25),
        fetchJson(DATA_FILES.parties24),
        fetchJson(DATA_FILES.schedule),
        fetchJson(DATA_FILES.socioeconomic),
        fetchJson(DATA_FILES.peripherality),
        fetchJson(DATA_FILES.bagrut),
        fetchJson(DATA_FILES.cityprofile),
      ]);

    state.localities = localities;
    state.localitiesById = new Map(localities.map((loc) => [loc.id, loc]));
    state.results25 = results25;
    state.results24 = results24;
    state.coords = coords;
    state.parties25 = parties25;
    state.parties24 = parties24;
    state.partyLetters25 = Object.keys(parties25);
    state.schedule = schedule;
    state.socioeconomic = socioeconomic;
    state.peripherality = peripherality;
    state.bagrut = bagrut;
    state.cityprofile = cityprofile;
    state.sizeTierPools = computeSizeTierPools(localities, results25);

    setupAutocomplete();
    setupHints();
    setupModeSwitcher();
    setupSizeTierSlider();
    setupDatePicker();
    startRound('daily');
  }

  init().catch((err) => {
    console.error(err);
    const app = document.getElementById('app');
    app.innerHTML = `<p style="color:#c15b4a">שגיאה בטעינת הנתונים: ${err.message}</p>`;
  });
})();
