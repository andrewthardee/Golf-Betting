/* ---------- State ---------- */
const NUM_PLAYERS = 5;
const STORAGE_KEY = 'fairwayStakesRound';

function makeDefaultCourse() {
  return {
    id: 'default',
    name: 'Default Course',
    holes: Array.from({length: 18}, (_, i) => ({ par: 4, si: i + 1 })),
    tees: [{ name: 'White', rating: 72.0, slope: 113 }]
  };
}

function makeLakesideCourse() {
  const pars = [4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 4, 3, 5, 4];
  const sis  = [11, 7, 3, 17, 1, 13, 5, 15, 9, 4, 16, 8, 2, 14, 6, 18, 12, 10];
  return {
    id: 'lakeside_green',
    name: 'Lakeside (Green Tees)',
    holes: pars.map((par, i) => ({ par, si: sis[i] })),
    // Rating/slope weren't on the scorecard photo — update these from the actual tee marker.
    tees: [{ name: 'Green', rating: 72.0, slope: 113 }]
  };
}

let state = loadState() || {
  players: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5'],
  handicapIndex: [0, 0, 0, 0, 0],
  playerTeeIdx: [0, 0, 0, 0, 0],
  playerRosterId: [null, null, null, null, null],
  roster: [],
  courses: [makeDefaultCourse()],
  activeCourseId: 'default',
  bets: { smallStake: 15, bigStake: 10, matchUnit: 1 },
  holes: {},       // shared gross scores: { [hole]: { scores: {0..4: gross} } }
  wolfHoles: {},    // { [hole]: { wolf, mode, partner, hammers, trashA, trashB } }
  dayHoles: {}      // { [hole]: { teamOf2, teamOf3 } }
};

// Migrate older saved rounds (single manual course, raw course handicaps).
if (!state.courses) {
  const migrated = makeDefaultCourse();
  if (state.course) migrated.holes = state.course;
  state.courses = [migrated];
  state.activeCourseId = 'default';
}
if (!state.handicapIndex) {
  state.handicapIndex = state.handicaps ? state.handicaps.slice() : [0, 0, 0, 0, 0];
}
if (!state.playerTeeIdx) state.playerTeeIdx = [0, 0, 0, 0, 0];
if (!state.courses.some(c => c.id === 'lakeside_green')) {
  state.courses.push(makeLakesideCourse());
}
if (!state.bets.smallStake) state.bets.smallStake = 15;
if (!state.bets.bigStake) state.bets.bigStake = 10;
if (!state.holes) state.holes = {};
if (!state.dayHoles) state.dayHoles = {};

// Migrate older saved rounds (no roster yet) — seed the roster from today's 5 players.
if (!state.roster) {
  state.roster = state.players.map((name, i) => ({
    id: 'roster_' + i + '_' + Date.now(),
    name,
    handicapIndex: state.handicapIndex[i] || 0
  }));
  state.playerRosterId = state.roster.map(r => r.id);
}
if (!state.playerRosterId) state.playerRosterId = [null, null, null, null, null];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------- Course / Handicap (GHIN-style) ---------- */
function activeCourse() {
  return state.courses.find(c => c.id === state.activeCourseId) || state.courses[0];
}
function coursePar() {
  return activeCourse().holes.reduce((sum, h) => sum + (Number(h.par) || 0), 0);
}
function activeTee(playerIdx) {
  const course = activeCourse();
  const idx = state.playerTeeIdx[playerIdx] || 0;
  return course.tees[idx] || course.tees[0] || { rating: coursePar(), slope: 113 };
}
// Course Handicap = Round(Handicap Index x (Slope/113) + (Course Rating - Par)) — same formula GHIN uses.
function courseHandicap(playerIdx) {
  const hi = Number(state.handicapIndex[playerIdx]) || 0;
  const tee = activeTee(playerIdx);
  const slope = Number(tee.slope) || 113;
  const rating = tee.rating !== undefined && tee.rating !== null && tee.rating !== '' ? Number(tee.rating) : coursePar();
  return Math.round(hi * (slope / 113) + (rating - coursePar()));
}

/* ---------- Strokes ---------- */
function strokesForPlayer(playerIdx, hole) {
  const h = courseHandicap(playerIdx);
  const si = activeCourse().holes[hole - 1].si;
  const base = Math.floor(h / 18);
  const extra = (si <= (h % 18)) ? 1 : 0;
  return base + extra;
}
function netScore(playerIdx, hole, gross) {
  if (gross === undefined || gross === null || gross === '') return null;
  return Number(gross) - strokesForPlayer(playerIdx, hole);
}
function holeHasScores(hole) {
  const h = state.holes[hole];
  if (!h || !h.scores) return false;
  return state.players.every((_, i) => h.scores[i] !== undefined && h.scores[i] !== '');
}

/* ---------- Tabs ---------- */
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.tab).classList.add('active');
  renderAll();
});

/* ---------- Setup rendering ---------- */
function renderSetup() {
  renderCourseSelect();
  renderCourseHoleTable();
  renderTeeTable();
  renderRosterTable();
  renderPlayerTable();

  document.getElementById('smallStake').value = state.bets.smallStake;
  document.getElementById('bigStake').value = state.bets.bigStake;
  document.getElementById('matchUnit').value = state.bets.matchUnit;
}

function renderCourseSelect() {
  const sel = document.getElementById('courseSelect');
  sel.innerHTML = state.courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  sel.value = state.activeCourseId;
}
document.getElementById('courseSelect').addEventListener('change', e => {
  state.activeCourseId = e.target.value;
  state.playerTeeIdx = state.playerTeeIdx.map(() => 0);
  saveState();
  renderSetup();
});
document.getElementById('newCourseBtn').addEventListener('click', () => {
  const name = prompt('New course name:', 'New Course');
  if (!name) return;
  const id = 'course_' + Date.now();
  state.courses.push({
    id, name,
    holes: Array.from({length: 18}, (_, i) => ({ par: 4, si: i + 1 })),
    tees: [{ name: 'White', rating: 72.0, slope: 113 }]
  });
  state.activeCourseId = id;
  saveState();
  renderSetup();
});
document.getElementById('renameCourseBtn').addEventListener('click', () => {
  const course = activeCourse();
  const name = prompt('Rename course:', course.name);
  if (!name) return;
  course.name = name;
  saveState();
  renderSetup();
});
document.getElementById('deleteCourseBtn').addEventListener('click', () => {
  if (state.courses.length <= 1) { alert('You need at least one course.'); return; }
  if (!confirm(`Delete "${activeCourse().name}"?`)) return;
  state.courses = state.courses.filter(c => c.id !== state.activeCourseId);
  state.activeCourseId = state.courses[0].id;
  saveState();
  renderSetup();
});

function renderCourseHoleTable() {
  const course = activeCourse();
  const ctBody = document.querySelector('#courseTable tbody');
  ctBody.innerHTML = '';
  course.holes.forEach((h, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><input type="number" data-idx="${i}" class="holePar" value="${h.par}" min="3" max="6"></td>
      <td><input type="number" data-idx="${i}" class="holeSi" value="${h.si}" min="1" max="18"></td>
    `;
    ctBody.appendChild(tr);
  });
  ctBody.querySelectorAll('.holePar').forEach(el => el.addEventListener('input', e => {
    course.holes[e.target.dataset.idx].par = Number(e.target.value) || 4;
    saveState();
    renderPlayerTable();
  }));
  ctBody.querySelectorAll('.holeSi').forEach(el => el.addEventListener('input', e => {
    course.holes[e.target.dataset.idx].si = Number(e.target.value) || 1;
    saveState();
  }));
}

function renderTeeTable() {
  const course = activeCourse();
  const ttBody = document.querySelector('#teeTable tbody');
  ttBody.innerHTML = '';
  course.tees.forEach((t, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" data-idx="${i}" class="teeName" value="${t.name}"></td>
      <td><input type="number" data-idx="${i}" class="teeRating" value="${t.rating}" min="50" max="90" step="0.1"></td>
      <td><input type="number" data-idx="${i}" class="teeSlope" value="${t.slope}" min="55" max="155" step="1"></td>
      <td>${course.tees.length > 1 ? `<button type="button" class="danger removeTee" data-idx="${i}">✕</button>` : ''}</td>
    `;
    ttBody.appendChild(tr);
  });
  ttBody.querySelectorAll('.teeName').forEach(el => el.addEventListener('input', e => {
    course.tees[e.target.dataset.idx].name = e.target.value || 'Tee';
    saveState();
    renderPlayerTable();
  }));
  ttBody.querySelectorAll('.teeRating').forEach(el => el.addEventListener('input', e => {
    course.tees[e.target.dataset.idx].rating = Number(e.target.value) || 0;
    saveState();
    renderPlayerTable();
  }));
  ttBody.querySelectorAll('.teeSlope').forEach(el => el.addEventListener('input', e => {
    course.tees[e.target.dataset.idx].slope = Number(e.target.value) || 113;
    saveState();
    renderPlayerTable();
  }));
  ttBody.querySelectorAll('.removeTee').forEach(el => el.addEventListener('click', e => {
    if (course.tees.length <= 1) return;
    course.tees.splice(Number(e.target.dataset.idx), 1);
    state.playerTeeIdx = state.playerTeeIdx.map(idx => Math.min(idx, course.tees.length - 1));
    saveState();
    renderSetup();
  }));
}
document.getElementById('addTeeBtn').addEventListener('click', () => {
  activeCourse().tees.push({ name: 'New Tee', rating: 72.0, slope: 113 });
  saveState();
  renderSetup();
});

/* ---------- Player Roster ---------- */
function rosterById(id) {
  return state.roster.find(r => r.id === id);
}
function renderRosterTable() {
  const body = document.querySelector('#rosterTable tbody');
  body.innerHTML = '';
  state.roster.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" data-id="${r.id}" class="rosterName" value="${r.name}"></td>
      <td><input type="number" data-id="${r.id}" class="rosterHcp" value="${r.handicapIndex}" min="-10" max="54" step="0.1"></td>
      <td><button type="button" class="danger removeRoster" data-id="${r.id}">✕</button></td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll('.rosterName').forEach(el => el.addEventListener('input', e => {
    const r = rosterById(e.target.dataset.id);
    r.name = e.target.value || r.name;
    saveState();
    renderPlayerTable();
  }));
  body.querySelectorAll('.rosterHcp').forEach(el => el.addEventListener('input', e => {
    const r = rosterById(e.target.dataset.id);
    r.handicapIndex = Number(e.target.value) || 0;
    saveState();
    renderPlayerTable();
  }));
  body.querySelectorAll('.removeRoster').forEach(el => el.addEventListener('click', e => {
    const id = e.target.dataset.id;
    if (!confirm('Remove this player from the roster?')) return;
    state.roster = state.roster.filter(r => r.id !== id);
    state.playerRosterId = state.playerRosterId.map(rid => rid === id ? null : rid);
    saveState();
    renderSetup();
  }));
}
document.getElementById('addRosterBtn').addEventListener('click', () => {
  const name = prompt('Player name:');
  if (!name) return;
  const hiRaw = prompt('Handicap Index:', '10.0');
  const hi = Number(hiRaw) || 0;
  state.roster.push({ id: 'roster_' + Date.now(), name, handicapIndex: hi });
  saveState();
  renderSetup();
});

function renderPlayerTable() {
  const course = activeCourse();
  const ptBody = document.querySelector('#playerTable tbody');
  ptBody.innerHTML = '';
  state.players.forEach((name, i) => {
    const rosterOptions = `<option value="">One-off / custom</option>` +
      state.roster.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><select data-idx="${i}" class="playerRosterSel">${rosterOptions}</select></td>
      <td><input type="text" data-idx="${i}" class="playerName" value="${name}"></td>
      <td><input type="number" data-idx="${i}" class="playerHcp" value="${state.handicapIndex[i]}" min="-10" max="54" step="0.1"></td>
      <td><select data-idx="${i}" class="playerTeeSel">${course.tees.map((t, ti) => `<option value="${ti}">${t.name}</option>`).join('')}</select></td>
      <td class="courseHcpCell">${courseHandicap(i)}</td>
    `;
    ptBody.appendChild(tr);
  });
  ptBody.querySelectorAll('.playerRosterSel').forEach(el => {
    el.value = state.playerRosterId[el.dataset.idx] || '';
    el.addEventListener('change', e => {
      const idx = Number(e.target.dataset.idx);
      const rid = e.target.value || null;
      state.playerRosterId[idx] = rid;
      if (rid) {
        const r = rosterById(rid);
        state.players[idx] = r.name;
        state.handicapIndex[idx] = r.handicapIndex;
      }
      saveState();
      renderAll();
    });
  });
  ptBody.querySelectorAll('.playerName').forEach(el => el.addEventListener('input', e => {
    const idx = Number(e.target.dataset.idx);
    state.players[idx] = e.target.value || `Player ${idx + 1}`;
    const rid = state.playerRosterId[idx];
    if (rid) rosterById(rid).name = state.players[idx];
    saveState(); renderAll();
  }));
  ptBody.querySelectorAll('.playerHcp').forEach(el => el.addEventListener('input', e => {
    const idx = Number(e.target.dataset.idx);
    state.handicapIndex[idx] = Number(e.target.value) || 0;
    const rid = state.playerRosterId[idx];
    if (rid) rosterById(rid).handicapIndex = state.handicapIndex[idx];
    saveState();
    renderPlayerTable();
  }));
  ptBody.querySelectorAll('.playerTeeSel').forEach(el => {
    el.value = state.playerTeeIdx[el.dataset.idx] || 0;
    el.addEventListener('change', e => {
      state.playerTeeIdx[e.target.dataset.idx] = Number(e.target.value) || 0;
      saveState();
      renderPlayerTable();
    });
  });
}

document.getElementById('smallStake').addEventListener('input', e => { state.bets.smallStake = Number(e.target.value) || 0; saveState(); });
document.getElementById('bigStake').addEventListener('input', e => { state.bets.bigStake = Number(e.target.value) || 0; saveState(); });
document.getElementById('matchUnit').addEventListener('input', e => { state.bets.matchUnit = Number(e.target.value) || 0; saveState(); });

document.getElementById('resetRound').addEventListener('click', () => {
  if (!confirm('This clears all scores, teams, and results for the round (course library and players stay). Continue?')) return;
  const names = state.players, handicapIndex = state.handicapIndex, playerTeeIdx = state.playerTeeIdx;
  const playerRosterId = state.playerRosterId, roster = state.roster;
  const courses = state.courses, activeCourseId = state.activeCourseId, bets = state.bets;
  state = { players: names, handicapIndex, playerTeeIdx, playerRosterId, roster, courses, activeCourseId, bets, holes: {}, wolfHoles: {}, dayHoles: {} };
  saveState();
  renderAll();
});

/* ---------- SCORECARD ---------- */
function renderScorecardInputs() {
  const hole = Number(document.getElementById('scHole').value) || 1;
  const existing = state.holes[hole];
  document.getElementById('scPar').textContent = `Par ${activeCourse().holes[hole - 1].par}, Stroke Index ${activeCourse().holes[hole - 1].si}`;
  const grid = document.getElementById('scScores');
  grid.innerHTML = state.players.map((p, i) => `
    <div>
      <label for="scScore${i}">${p}</label>
      <input type="number" id="scScore${i}" min="1" value="${existing && existing.scores[i] !== undefined ? existing.scores[i] : ''}">
    </div>
  `).join('');
}
document.getElementById('scHole').addEventListener('input', renderScorecardInputs);

document.getElementById('scSubmit').addEventListener('click', () => {
  const hole = Number(document.getElementById('scHole').value) || 1;
  const scores = {};
  let missing = false;
  state.players.forEach((_, i) => {
    const v = document.getElementById(`scScore${i}`).value;
    if (v === '') missing = true;
    scores[i] = v;
  });
  if (missing) { alert('Enter gross scores for all 5 players.'); return; }
  state.holes[hole] = { scores };
  saveState();
  renderAll();
});

function renderScorecardSummary() {
  const holes = Object.keys(state.holes).map(Number).filter(holeHasScores).sort((a, b) => a - b);
  const el = document.getElementById('scSummary');
  if (holes.length === 0) { el.innerHTML = '<p class="hint">No holes entered yet.</p>'; return; }
  el.innerHTML = `<table class="totals-table"><thead><tr><th>Hole</th>${state.players.map(p => `<th>${p}</th>`).join('')}</tr></thead><tbody>${
    holes.map(h => `<tr><td>${h}</td>${state.players.map((_, i) => `<td>${state.holes[h].scores[i]}</td>`).join('')}</tr>`).join('')
  }</tbody></table>`;
}

/* ---------- WOLF ---------- */
function wolfOrderForHole(hole) {
  return (hole - 1) % NUM_PLAYERS;
}

function renderWolfInputs() {
  const hole = Number(document.getElementById('wolfHole').value) || 1;
  const wolfSel = document.getElementById('wolfPlayer');
  wolfSel.innerHTML = state.players.map((p, i) => `<option value="${i}">${p}</option>`).join('');

  const hintEl = document.getElementById('wolfScoreHint');
  if (!holeHasScores(hole)) {
    hintEl.textContent = `No scores yet for hole ${hole} — enter them on the Scorecard tab first.`;
  } else {
    hintEl.textContent = `Scores loaded for hole ${hole}: ` + state.players.map((p, i) => `${p} ${state.holes[hole].scores[i]}`).join(', ');
  }

  const suggested = wolfOrderForHole(hole);
  const existing = state.wolfHoles[hole];
  wolfSel.value = existing ? existing.wolf : suggested;
  document.getElementById('wolfOrderHint').textContent = `Suggested rotation: ${state.players[suggested]} is wolf this hole.`;

  updateWolfPartnerOptions();
  document.getElementById('wolfMode').value = existing ? existing.mode : 'partner';
  document.getElementById('wolfHammers').value = existing ? existing.hammers : 0;
  document.getElementById('wolfTrashA').value = existing ? (existing.trashA || 0) : 0;
  document.getElementById('wolfTrashB').value = existing ? (existing.trashB || 0) : 0;
  toggleWolfPartnerVisibility();

  if (existing && existing.partner !== null && existing.partner !== undefined) {
    document.getElementById('wolfPartner').value = existing.partner;
  }
}
function updateWolfPartnerOptions() {
  const wolfIdx = Number(document.getElementById('wolfPlayer').value);
  const partnerSel = document.getElementById('wolfPartner');
  partnerSel.innerHTML = state.players
    .map((p, i) => i)
    .filter(i => i !== wolfIdx)
    .map(i => `<option value="${i}">${state.players[i]}</option>`)
    .join('');
}
function toggleWolfPartnerVisibility() {
  const mode = document.getElementById('wolfMode').value;
  document.getElementById('wolfPartnerWrap').style.display = mode === 'partner' ? 'block' : 'none';
  document.getElementById('wolfTrashALabel').childNodes[0].textContent = mode === 'partner'
    ? 'Trash won by small team (wolf + partner) '
    : 'Trash won by wolf ';
  document.getElementById('wolfTrashBLabel').childNodes[0].textContent = mode === 'partner'
    ? 'Trash won by big team (other 3) '
    : 'Trash won by the other 4 ';
}
document.getElementById('wolfHole').addEventListener('input', renderWolfInputs);
document.getElementById('wolfPlayer').addEventListener('change', updateWolfPartnerOptions);
document.getElementById('wolfMode').addEventListener('change', toggleWolfPartnerVisibility);

document.getElementById('wolfSubmit').addEventListener('click', () => {
  const hole = Number(document.getElementById('wolfHole').value) || 1;
  if (!holeHasScores(hole)) { alert('Enter gross scores for this hole on the Scorecard tab first.'); return; }
  const wolf = Number(document.getElementById('wolfPlayer').value);
  const mode = document.getElementById('wolfMode').value;
  const partner = mode === 'partner' ? Number(document.getElementById('wolfPartner').value) : null;
  const hammers = Number(document.getElementById('wolfHammers').value) || 0;
  const trashA = Number(document.getElementById('wolfTrashA').value) || 0;
  const trashB = Number(document.getElementById('wolfTrashB').value) || 0;

  state.wolfHoles[hole] = { wolf, mode, partner, hammers, trashA, trashB };
  saveState();
  renderWolf();
});

function computeWolfHole(hole, data) {
  const { wolf, mode, partner, hammers, trashA, trashB } = data;
  const scores = state.holes[hole].scores;
  const nets = state.players.map((_, i) => netScore(i, hole, scores[i]));
  const par = activeCourse().holes[hole - 1].par;

  let teamA, teamB, isPartner;
  if (mode === 'partner') {
    teamA = [wolf, partner];               // small team, $/man = smallStake
    teamB = state.players.map((_, i) => i).filter(i => i !== wolf && i !== partner); // big team
    isPartner = true;
  } else {
    teamA = [wolf];                        // lone wolf
    teamB = state.players.map((_, i) => i).filter(i => i !== wolf);
    isPartner = false;
  }

  const aBest = Math.min(...teamA.map(i => nets[i]));
  const bBest = Math.min(...teamB.map(i => nets[i]));

  const birdieCount = state.players.reduce((count, _, i) => Number(scores[i]) <= par - 1 ? count + 1 : count, 0);
  const multiplier = Math.pow(2, hammers) * Math.pow(2, birdieCount);

  const payouts = state.players.map(() => 0);
  let tie = (aBest === bBest);
  let winners = [], losers = [];

  if (isPartner) {
    const rateA = state.bets.smallStake * multiplier;
    const rateB = state.bets.bigStake * multiplier;
    if (!tie) {
      if (aBest < bBest) { winners = teamA; losers = teamB; }
      else { winners = teamB; losers = teamA; }
    }
    if (!tie) {
      teamA.forEach(i => { payouts[i] += (winners === teamA ? rateA : -rateA); });
      teamB.forEach(i => { payouts[i] += (winners === teamB ? rateB : -rateB); });
    }
    // Trash: winning side's team gets its own rate, losing side's team loses its own rate, per trash
    for (let k = 0; k < trashA; k++) {
      teamA.forEach(i => { payouts[i] += state.bets.smallStake; });
      teamB.forEach(i => { payouts[i] -= state.bets.bigStake; });
    }
    for (let k = 0; k < trashB; k++) {
      teamB.forEach(i => { payouts[i] += state.bets.bigStake; });
      teamA.forEach(i => { payouts[i] -= state.bets.smallStake; });
    }
  } else {
    // Lone wolf: flat big-team rate for everyone, pairwise (loser pays each winner)
    const rate = state.bets.bigStake * multiplier;
    if (!tie) {
      if (aBest < bBest) { winners = teamA; losers = teamB; }
      else { winners = teamB; losers = teamA; }
      winners.forEach(w => { payouts[w] += rate * losers.length; });
      losers.forEach(l => { payouts[l] -= rate * winners.length; });
    }
    for (let k = 0; k < trashA; k++) {
      teamA.forEach(w => { payouts[w] += state.bets.bigStake * teamB.length; });
      teamB.forEach(l => { payouts[l] -= state.bets.bigStake; });
    }
    for (let k = 0; k < trashB; k++) {
      teamB.forEach(w => { payouts[w] += state.bets.bigStake; });
      teamA.forEach(l => { payouts[l] -= state.bets.bigStake * teamB.length; });
    }
  }

  return { nets, teamA, teamB, aBest, bBest, tie, winners, losers, multiplier, payouts, birdieCount, isPartner };
}

function renderWolf() {
  renderWolfInputs();
  const results = document.getElementById('wolfResults');
  const holes = Object.keys(state.wolfHoles).map(Number).filter(h => holeHasScores(h)).sort((a, b) => a - b);
  if (holes.length === 0) { results.innerHTML = '<p class="hint">No holes recorded yet.</p>'; }
  else {
    results.innerHTML = holes.map(h => {
      const data = state.wolfHoles[h];
      const r = computeWolfHole(h, data);
      const wolfName = state.players[data.wolf];
      const modeLabel = data.mode === 'partner' ? `w/ ${state.players[data.partner]}` : (data.mode === 'lone' ? '(voluntary lone wolf)' : '(forced lone wolf)');
      let outcome;
      if (r.tie) outcome = `Push — tied at net ${r.aBest}.`;
      else {
        const winNames = r.winners.map(i => state.players[i]).join(' & ');
        outcome = `<span class="win-text">${winNames} win the hole</span> (net ${Math.min(r.aBest, r.bBest)} beats ${Math.max(r.aBest, r.bBest)}, hammers: ${data.hammers}${r.birdieCount > 0 ? `, gross birdies: ${r.birdieCount}` : ''}, bet multiplier x${r.multiplier})`;
      }
      const trashNote = (data.trashA || data.trashB)
        ? `<br><span class="hint">Trash: ${data.trashA || 0} to ${data.mode === 'partner' ? 'small team' : 'wolf'}, ${data.trashB || 0} to ${data.mode === 'partner' ? 'big team' : 'the other 4'}</span>`
        : '';
      return `<div class="result-row"><b>Hole ${h}</b>: ${wolfName} is wolf ${modeLabel}<br>${outcome}${trashNote}</div>`;
    }).join('');
  }

  const totals = document.getElementById('wolfTotals');
  const sums = state.players.map(() => 0);
  holes.forEach(h => {
    const r = computeWolfHole(h, state.wolfHoles[h]);
    r.payouts.forEach((p, i) => sums[i] += p);
  });
  totals.innerHTML = `<table class="totals-table">${state.players.map((p, i) => `<tr><td>${p}</td><td class="${sums[i] >= 0 ? 'money-pos' : 'money-neg'}">${sums[i] >= 0 ? '+' : ''}$${sums[i].toFixed(2)}</td></tr>`).join('')}</table>`;
}

/* ---------- DAYTONA ---------- */
function renderDaytonaInputs() {
  const hole = Number(document.getElementById('dayHole').value) || 1;
  const existing = state.dayHoles[hole];

  const hintEl = document.getElementById('dayScoreHint');
  if (!holeHasScores(hole)) {
    hintEl.textContent = `No scores yet for hole ${hole} — enter them on the Scorecard tab first.`;
  } else {
    hintEl.textContent = `Scores loaded for hole ${hole}: ` + state.players.map((p, i) => `${p} ${state.holes[hole].scores[i]}`).join(', ');
  }

  const display = document.getElementById('dayTeamsDisplay');
  if (existing && existing.teamOf2) {
    display.innerHTML = `Team A (2, $${state.bets.smallStake}/man): <b>${existing.teamOf2.map(i => state.players[i]).join(' & ')}</b><br>Team B (3, $${state.bets.bigStake}/man, best+worst count): <b>${existing.teamOf3.map(i => state.players[i]).join(', ')}</b>`;
  } else {
    display.textContent = 'Click "Randomize Teams" to assign teams for this hole.';
  }
}
document.getElementById('dayHole').addEventListener('input', renderDaytonaInputs);

document.getElementById('dayRandomize').addEventListener('click', () => {
  const hole = Number(document.getElementById('dayHole').value) || 1;
  const idxs = state.players.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  state.dayHoles[hole] = { teamOf2: idxs.slice(0, 2), teamOf3: idxs.slice(2, 5) };
  saveState();
  renderDaytonaInputs();
});

document.getElementById('dayCompute').addEventListener('click', () => {
  const hole = Number(document.getElementById('dayHole').value) || 1;
  if (!holeHasScores(hole)) { alert('Enter gross scores for this hole on the Scorecard tab first.'); return; }
  if (!state.dayHoles[hole] || !state.dayHoles[hole].teamOf2) { alert('Randomize teams for this hole first.'); return; }
  saveState();
  renderDaytona();
});

function computeDaytonaHole(hole, data) {
  const scores = state.holes[hole].scores;
  const nets = state.players.map((_, i) => netScore(i, hole, scores[i]));
  const par = activeCourse().holes[hole - 1].par;
  const isBirdie = i => Number(scores[i]) <= par - 1;

  const [a1, a2] = data.teamOf2;
  const teamAnets = [nets[a1], nets[a2]].sort((x, y) => x - y);
  let numA = teamAnets[0] * 10 + teamAnets[1];

  const bNets = data.teamOf3.map(i => nets[i]);
  const best = Math.min(...bNets);
  const worst = Math.max(...bNets);
  const teamBnets = [best, worst].sort((x, y) => x - y);
  let numB = teamBnets[0] * 10 + teamBnets[1];

  const teamABirdied = data.teamOf2.some(isBirdie);
  const teamBBirdied = data.teamOf3.some(isBirdie);
  let flippedA = false, flippedB = false;
  if (teamBBirdied) { numA = teamAnets[1] * 10 + teamAnets[0]; flippedA = true; }
  if (teamABirdied) { numB = teamBnets[1] * 10 + teamBnets[0]; flippedB = true; }

  const diff = Math.abs(numA - numB);
  let rate, money;
  const payouts = state.players.map(() => 0);
  if (numA < numB) {
    rate = state.bets.smallStake;
    money = diff * rate;
    data.teamOf2.forEach(i => payouts[i] += money / data.teamOf2.length);
    data.teamOf3.forEach(i => payouts[i] -= money / data.teamOf3.length);
  } else if (numB < numA) {
    rate = state.bets.bigStake;
    money = diff * rate;
    data.teamOf3.forEach(i => payouts[i] += money / data.teamOf3.length);
    data.teamOf2.forEach(i => payouts[i] -= money / data.teamOf2.length);
  } else {
    rate = 0; money = 0;
  }

  return { nets, numA, numB, diff, rate, money, payouts, teamABirdied, teamBBirdied, flippedA, flippedB };
}

function renderDaytona() {
  renderDaytonaInputs();
  const results = document.getElementById('dayResults');
  const holes = Object.keys(state.dayHoles).map(Number).filter(h => state.dayHoles[h].teamOf2 && holeHasScores(h)).sort((a, b) => a - b);
  if (holes.length === 0) { results.innerHTML = '<p class="hint">No holes recorded yet.</p>'; }
  else {
    results.innerHTML = holes.map(h => {
      const data = state.dayHoles[h];
      const r = computeDaytonaHole(h, data);
      const teamAName = data.teamOf2.map(i => state.players[i]).join(' & ');
      const teamBName = data.teamOf3.map(i => state.players[i]).join(', ');
      let outcome;
      if (r.numA === r.numB) outcome = `Push — both ${r.numA}.`;
      else if (r.numA < r.numB) outcome = `<span class="win-text">${teamAName} win $${r.money.toFixed(2)}</span> (${r.numA} vs ${r.numB}, $${r.rate}/pt)`;
      else outcome = `<span class="win-text">${teamBName} win $${r.money.toFixed(2)}</span> (${r.numB} vs ${r.numA}, $${r.rate}/pt)`;
      const flipNote = [
        r.flippedA ? `${teamBName} birdied — ${teamAName}'s number flipped` : '',
        r.flippedB ? `${teamAName} birdied — ${teamBName}'s number flipped` : ''
      ].filter(Boolean).join('; ');
      return `<div class="result-row"><b>Hole ${h}</b>: ${teamAName} (2) vs ${teamBName} (3)<br>${outcome}${flipNote ? `<br><span class="hint">${flipNote}</span>` : ''}</div>`;
    }).join('');
  }

  const totals = document.getElementById('dayTotals');
  const sums = state.players.map(() => 0);
  holes.forEach(h => {
    const r = computeDaytonaHole(h, state.dayHoles[h]);
    r.payouts.forEach((p, i) => sums[i] += p);
  });
  totals.innerHTML = `<table class="totals-table">${state.players.map((p, i) => `<tr><td>${p}</td><td class="${sums[i] >= 0 ? 'money-pos' : 'money-neg'}">${sums[i] >= 0 ? '+' : ''}$${sums[i].toFixed(2)}</td></tr>`).join('')}</table>`;
}

/* ---------- MATCH PLAY ---------- */
function allPairs() {
  const pairs = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    for (let j = i + 1; j < NUM_PLAYERS; j++) pairs.push([i, j]);
  }
  return pairs;
}

function computeMatchStatuses() {
  const pairs = allPairs();
  const holes = Object.keys(state.holes).map(Number).filter(holeHasScores).sort((a, b) => a - b);
  const status = {};
  pairs.forEach(([i, j]) => { status[`${i}-${j}`] = { diff: 0, holesPlayed: 0 }; });

  holes.forEach(h => {
    const data = state.holes[h];
    const nets = state.players.map((_, idx) => netScore(idx, h, data.scores[idx]));
    pairs.forEach(([i, j]) => {
      const key = `${i}-${j}`;
      status[key].holesPlayed++;
      if (nets[i] < nets[j]) status[key].diff++;
      else if (nets[j] < nets[i]) status[key].diff--;
    });
  });
  return status;
}

function renderMatchplay() {
  const status = computeMatchStatuses();
  const container = document.getElementById('mpMatches');
  const pairs = allPairs();
  container.innerHTML = pairs.map(([i, j]) => {
    const s = status[`${i}-${j}`];
    const nameA = state.players[i], nameB = state.players[j];
    let statusText;
    if (s.diff === 0) statusText = 'All Square';
    else if (s.diff > 0) statusText = `${nameA} ${s.diff} up`;
    else statusText = `${nameB} ${-s.diff} up`;
    const money = s.diff * state.bets.matchUnit;
    const moneyText = money === 0 ? '' : (money > 0
      ? ` — ${nameB} owes ${nameA} $${Math.abs(money).toFixed(2)}`
      : ` — ${nameA} owes ${nameB} $${Math.abs(money).toFixed(2)}`);
    return `<div class="match-card"><b>${nameA} vs ${nameB}</b>: ${statusText} through ${s.holesPlayed} hole(s)${moneyText}</div>`;
  }).join('');
}

function matchplayPayouts() {
  const status = computeMatchStatuses();
  const pairs = allPairs();
  const sums = state.players.map(() => 0);
  pairs.forEach(([i, j]) => {
    const s = status[`${i}-${j}`];
    const money = s.diff * state.bets.matchUnit;
    sums[i] += money;
    sums[j] -= money;
  });
  return sums;
}

/* ---------- SUMMARY ---------- */
function renderSummary() {
  const wolfSums = state.players.map(() => 0);
  Object.keys(state.wolfHoles).filter(h => holeHasScores(Number(h))).forEach(h => {
    const r = computeWolfHole(Number(h), state.wolfHoles[h]);
    r.payouts.forEach((p, i) => wolfSums[i] += p);
  });

  const daySums = state.players.map(() => 0);
  Object.keys(state.dayHoles).filter(h => state.dayHoles[h].teamOf2 && holeHasScores(Number(h))).forEach(h => {
    const r = computeDaytonaHole(Number(h), state.dayHoles[h]);
    r.payouts.forEach((p, i) => daySums[i] += p);
  });

  const mpSums = matchplayPayouts();

  const totalSums = state.players.map((_, i) => wolfSums[i] + daySums[i] + mpSums[i]);

  const rows = state.players.map((p, i) => `
    <tr>
      <td>${p}</td>
      <td class="${wolfSums[i] >= 0 ? 'money-pos' : 'money-neg'}">${wolfSums[i] >= 0 ? '+' : ''}$${wolfSums[i].toFixed(2)}</td>
      <td class="${daySums[i] >= 0 ? 'money-pos' : 'money-neg'}">${daySums[i] >= 0 ? '+' : ''}$${daySums[i].toFixed(2)}</td>
      <td class="${mpSums[i] >= 0 ? 'money-pos' : 'money-neg'}">${mpSums[i] >= 0 ? '+' : ''}$${mpSums[i].toFixed(2)}</td>
      <td class="${totalSums[i] >= 0 ? 'money-pos' : 'money-neg'}"><b>${totalSums[i] >= 0 ? '+' : ''}$${totalSums[i].toFixed(2)}</b></td>
    </tr>
  `).join('');

  document.getElementById('summaryTable').innerHTML = `
    <table class="totals-table">
      <thead><tr><th>Player</th><th>Wolf</th><th>Daytona</th><th>Match Play</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ---------- Render All ---------- */
function renderAll() {
  renderSetup();
  renderScorecardInputs();
  renderScorecardSummary();
  renderWolf();
  renderDaytona();
  renderMatchplay();
  renderSummary();
}

renderAll();
