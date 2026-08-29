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
    tees: [{ name: 'Green', rating: 74.9, slope: 135 }]
  };
}

function makeLakesideChampionshipCourse() {
  const pars = [4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 4, 3, 5, 4];
  const sis  = [11, 7, 3, 17, 1, 13, 5, 15, 9, 4, 16, 8, 2, 14, 6, 18, 12, 10];
  return {
    id: 'lakeside_championship',
    name: 'Lakeside (Championship Tees)',
    holes: pars.map((par, i) => ({ par, si: sis[i] })),
    tees: [{ name: 'Championship', rating: 75.1, slope: 138 }]
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
  bets: { smallStake: 15, bigStake: 10, trashSmall: 5, trashBig: 5, daytonaPointValue: 1 },
  holes: {},
  wolfHoles: {},
  dayHoles: {},
  roundStarted: false,
  currentHole: 1,
  startHole: 1,
  holeIndex: 0,
  wolfOrderShiftBase: 0,
  wolfOrder: [0, 1, 2, 3, 4],
  pendingWolf: null,
  superWolfEnabled: false,
  editingHole: null
};

// Migrations for older saved rounds.
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
if (!state.courses.some(c => c.id === 'lakeside_championship')) {
  state.courses.push(makeLakesideChampionshipCourse());
}
if (!state.bets.smallStake) state.bets.smallStake = 15;
if (!state.bets.bigStake) state.bets.bigStake = 10;
if (state.bets.trashSmall === undefined) state.bets.trashSmall = 5;
if (state.bets.trashBig === undefined) state.bets.trashBig = 5;
if (state.bets.daytonaPointValue === undefined) state.bets.daytonaPointValue = 1;
if (!state.holes) state.holes = {};
if (!state.dayHoles) state.dayHoles = {};
if (!state.roster) {
  state.roster = state.players.map((name, i) => ({
    id: 'roster_' + i + '_' + Date.now(),
    name,
    handicapIndex: state.handicapIndex[i] || 0
  }));
  state.playerRosterId = state.roster.map(r => r.id);
}
if (!state.playerRosterId) state.playerRosterId = [null, null, null, null, null];
if (state.roundStarted === undefined) state.roundStarted = false;
if (!state.currentHole) state.currentHole = 1;
if (!state.startHole) state.startHole = 1;
if (state.holeIndex === undefined) state.holeIndex = 0;
if (state.wolfOrderShiftBase === undefined) state.wolfOrderShiftBase = 0;
if (!state.wolfOrder) state.wolfOrder = [0, 1, 2, 3, 4];
if (state.pendingWolf === undefined) state.pendingWolf = null;
if (state.superWolfEnabled === undefined) state.superWolfEnabled = false;
if (state.editingHole === undefined) state.editingHole = null;

function activeHole() {
  return (state.editingHole !== null && state.editingHole !== undefined) ? state.editingHole : state.currentHole;
}

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
function coursePar(course) {
  course = course || activeCourse();
  return course.holes.reduce((sum, h) => sum + (Number(h.par) || 0), 0);
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
function lowestCourseHandicap() {
  return Math.min(...state.players.map((_, i) => courseHandicap(i)));
}
function playingHandicap(playerIdx) {
  return courseHandicap(playerIdx) - lowestCourseHandicap();
}
function strokesForPlayer(playerIdx, hole) {
  const h = playingHandicap(playerIdx);
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

/* ---------- Money formatting ---------- */
function fmtMoney(v) {
  const cls = v >= 0 ? 'money-pos' : 'money-neg';
  const rounded = Math.round(Math.abs(v));
  const text = v >= 0 ? `$${rounded}` : `($${rounded})`;
  return `<span class="${cls}">${text}</span>`;
}

/* ---------- Screen navigation ---------- */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}
function updateRoundBar() {
  const bar = document.getElementById('roundBar');
  if (state.roundStarted) {
    bar.style.display = 'flex';
    document.getElementById('holeIndicator').textContent = `Hole ${state.currentHole}`;
  } else {
    bar.style.display = 'none';
  }
}

document.getElementById('startRoundBtn').addEventListener('click', () => {
  showScreen('scrCourse');
  renderCourseCardList();
});

/* ---------- STEP 1: Course selection & library ---------- */
let addingNewCourseId = null;

function renderCourseCardList() {
  const list = document.getElementById('courseCardList');
  list.innerHTML = state.courses.map(c => `
    <div class="course-card ${c.id === state.activeCourseId ? 'selected' : ''}" data-id="${c.id}">
      <div>
        <div class="course-card-name">${c.name}</div>
        <div class="hint">Par ${coursePar(c)}, ${c.tees.length} tee${c.tees.length === 1 ? '' : 's'}</div>
      </div>
      <span class="course-card-edit" data-edit="${c.id}">Edit</span>
    </div>
  `).join('');

  list.querySelectorAll('.course-card').forEach(el => el.addEventListener('click', e => {
    if (e.target.closest('.course-card-edit')) return;
    state.activeCourseId = el.dataset.id;
    saveState();
    renderCourseCardList();
    document.getElementById('courseContinueBtn').disabled = false;
  }));
  list.querySelectorAll('.course-card-edit').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    openCourseEditor(el.dataset.edit, false);
  }));

  document.getElementById('courseContinueBtn').disabled = !state.activeCourseId;
}

function openCourseEditor(courseId, isNew) {
  state.activeCourseId = courseId;
  addingNewCourseId = isNew ? courseId : null;
  document.getElementById('courseEditorTitle').textContent = isNew ? 'Add Course' : 'Edit Course';
  document.getElementById('courseNameInput').value = activeCourse().name;
  document.getElementById('deleteCourseBtn').style.display = isNew ? 'none' : 'inline-block';
  renderCourseHoleTable();
  renderTeeTable();
  document.getElementById('courseEditorCard').style.display = 'block';
}

document.getElementById('addCourseBtn').addEventListener('click', () => {
  const id = 'course_' + Date.now();
  state.courses.push({
    id,
    name: 'New Course',
    holes: Array.from({length: 18}, (_, i) => ({ par: 4, si: i + 1 })),
    tees: [{ name: 'White', rating: 72.0, slope: 113 }]
  });
  saveState();
  openCourseEditor(id, true);
});

document.getElementById('courseNameInput').addEventListener('input', e => {
  activeCourse().name = e.target.value || 'New Course';
  saveState();
});

document.getElementById('saveCourseBtn').addEventListener('click', () => {
  addingNewCourseId = null;
  document.getElementById('courseEditorCard').style.display = 'none';
  renderCourseCardList();
});

document.getElementById('cancelCourseBtn').addEventListener('click', () => {
  if (addingNewCourseId) {
    state.courses = state.courses.filter(c => c.id !== addingNewCourseId);
    if (state.activeCourseId === addingNewCourseId) {
      state.activeCourseId = state.courses[0] ? state.courses[0].id : null;
    }
    addingNewCourseId = null;
    saveState();
  }
  document.getElementById('courseEditorCard').style.display = 'none';
  renderCourseCardList();
});

document.getElementById('deleteCourseBtn').addEventListener('click', () => {
  if (state.courses.length <= 1) { alert('You need at least one course.'); return; }
  if (!confirm(`Delete "${activeCourse().name}"?`)) return;
  state.courses = state.courses.filter(c => c.id !== state.activeCourseId);
  state.activeCourseId = state.courses[0].id;
  saveState();
  document.getElementById('courseEditorCard').style.display = 'none';
  renderCourseCardList();
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
  }));
  ttBody.querySelectorAll('.teeRating').forEach(el => el.addEventListener('input', e => {
    course.tees[e.target.dataset.idx].rating = Number(e.target.value) || 0;
    saveState();
  }));
  ttBody.querySelectorAll('.teeSlope').forEach(el => el.addEventListener('input', e => {
    course.tees[e.target.dataset.idx].slope = Number(e.target.value) || 113;
    saveState();
  }));
  ttBody.querySelectorAll('.removeTee').forEach(el => el.addEventListener('click', e => {
    if (course.tees.length <= 1) return;
    course.tees.splice(Number(e.target.dataset.idx), 1);
    state.playerTeeIdx = state.playerTeeIdx.map(idx => Math.min(idx, course.tees.length - 1));
    saveState();
    renderTeeTable();
  }));
}
document.getElementById('addTeeBtn').addEventListener('click', () => {
  activeCourse().tees.push({ name: 'New Tee', rating: 72.0, slope: 113 });
  saveState();
  renderTeeTable();
});

document.getElementById('courseContinueBtn').addEventListener('click', () => {
  if (!state.activeCourseId) return;
  showScreen('scrPlayers');
  renderRosterTable();
  renderPlayerTable();
});

/* ---------- STEP 2: Player Roster & today's players ---------- */
function rosterById(id) {
  return state.roster.find(r => r.id === id);
}
function renderRosterTable() {
  const body = document.querySelector('#rosterTable tbody');
  body.innerHTML = '';
  state.roster.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" data-id="${r.id}" class="rosterName" value="${r.name}"></td>
      <td><input type="text" inputmode="decimal" data-id="${r.id}" class="rosterHcp" value="${r.handicapIndex}"></td>
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
    renderRosterTable();
    renderPlayerTable();
  }));
}
document.getElementById('addRosterBtn').addEventListener('click', () => {
  const name = prompt('Player name:');
  if (!name) return;
  const hiRaw = prompt('Handicap Index:', '10.0');
  const hi = Number(hiRaw) || 0;
  state.roster.push({ id: 'roster_' + Date.now(), name, handicapIndex: hi });
  saveState();
  renderRosterTable();
  renderPlayerTable();
});

function renderPlayerTable() {
  const ptBody = document.querySelector('#playerTable tbody');
  ptBody.innerHTML = '';
  state.players.forEach((name, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" data-idx="${i}" class="playerName" value="${name}"></td>
      <td><input type="text" inputmode="decimal" data-idx="${i}" class="playerHcp" value="${state.handicapIndex[i]}"></td>
      <td class="courseHcpCell" data-idx="${i}">${courseHandicap(i)}</td>
      <td class="strokesGivenCell" data-idx="${i}">${playingHandicap(i)}</td>
    `;
    ptBody.appendChild(tr);
  });
  ptBody.querySelectorAll('.playerName').forEach(el => el.addEventListener('input', e => {
    const idx = Number(e.target.dataset.idx);
    state.players[idx] = e.target.value || `Player ${idx + 1}`;
    const rid = state.playerRosterId[idx];
    if (rid) rosterById(rid).name = state.players[idx];
    saveState();
  }));
  ptBody.querySelectorAll('.playerHcp').forEach(el => el.addEventListener('input', e => {
    const idx = Number(e.target.dataset.idx);
    state.handicapIndex[idx] = Number(e.target.value) || 0;
    const rid = state.playerRosterId[idx];
    if (rid) rosterById(rid).handicapIndex = state.handicapIndex[idx];
    saveState();
    updateCourseHcpCells();
  }));
}
function updateCourseHcpCells() {
  document.querySelectorAll('.courseHcpCell').forEach(el => {
    el.textContent = courseHandicap(Number(el.dataset.idx));
  });
  document.querySelectorAll('.strokesGivenCell').forEach(el => {
    el.textContent = playingHandicap(Number(el.dataset.idx));
  });
}

document.getElementById('playersBackBtn').addEventListener('click', () => {
  showScreen('scrCourse');
  renderCourseCardList();
});
document.getElementById('playersContinueBtn').addEventListener('click', () => {
  showScreen('scrBets');
  document.getElementById('smallStake').value = state.bets.smallStake;
  document.getElementById('bigStake').value = state.bets.bigStake;
  document.getElementById('trashSmall').value = state.bets.trashSmall;
  document.getElementById('trashBig').value = state.bets.trashBig;
  document.getElementById('daytonaPointValue').value = state.bets.daytonaPointValue;
  document.getElementById('superWolfEnabled').checked = state.superWolfEnabled;
});
document.getElementById('superWolfEnabled').addEventListener('change', e => {
  state.superWolfEnabled = e.target.checked;
  saveState();
});

/* ---------- STEP 3: Bets ---------- */
document.getElementById('smallStake').addEventListener('input', e => { state.bets.smallStake = Number(e.target.value) || 0; saveState(); });
document.getElementById('bigStake').addEventListener('input', e => { state.bets.bigStake = Number(e.target.value) || 0; saveState(); });
document.getElementById('trashSmall').addEventListener('input', e => { state.bets.trashSmall = Number(e.target.value) || 0; saveState(); });
document.getElementById('trashBig').addEventListener('input', e => { state.bets.trashBig = Number(e.target.value) || 0; saveState(); });
document.getElementById('daytonaPointValue').addEventListener('input', e => { state.bets.daytonaPointValue = Number(e.target.value) || 0; saveState(); });

document.getElementById('betsBackBtn').addEventListener('click', () => {
  showScreen('scrPlayers');
  renderRosterTable();
  renderPlayerTable();
});

document.getElementById('beginRoundBtn').addEventListener('click', () => {
  state.roundStarted = true;
  if (!state.currentHole) state.currentHole = 1;
  if (!state.wolfOrder) state.wolfOrder = [0, 1, 2, 3, 4];
  saveState();
  updateRoundBar();
  renderHoleSetup();
  showScreen('scrHoleSetup');
});

/* ---------- Hole Setup (once, at round start) ---------- */
function renderHoleSetup() {
  document.getElementById('startHoleInput').value = state.currentHole || 1;
  const wrap = document.getElementById('wolfOrderList');
  wrap.innerHTML = state.players.map((_, pos) => `
    <div class="wolf-order-row">
      <span class="wolf-order-num">${pos + 1}.</span>
      <select data-pos="${pos}" class="wolfOrderSel">
        ${state.players.map((p, pi) => `<option value="${pi}">${p}</option>`).join('')}
      </select>
    </div>
  `).join('');
  wrap.querySelectorAll('.wolfOrderSel').forEach(el => {
    const pos = Number(el.dataset.pos);
    el.value = state.wolfOrder[pos] !== undefined ? state.wolfOrder[pos] : pos;
  });
}
document.getElementById('holeSetupContinueBtn').addEventListener('click', () => {
  state.currentHole = Number(document.getElementById('startHoleInput').value) || 1;
  state.startHole = state.currentHole;
  state.holeIndex = 0;
  state.wolfOrderShiftBase = 0;
  const sels = document.querySelectorAll('.wolfOrderSel');
  state.wolfOrder = Array.from(sels).map(el => Number(el.value));
  saveState();
  updateRoundBar();
  prepareTeeShotScreen();
  showScreen('scrTeeShot');
});

/* ---------- Post Tee Shot ---------- */
function prepareTeeShotScreen() {
  const hole = activeHole();
  document.getElementById('teeShotTitle').textContent = `Hole ${hole} — Post Tee Shot${state.editingHole ? ' (Editing)' : ''}`;
  const wolfSel = document.getElementById('wolfPlayer');
  wolfSel.innerHTML = state.players.map((p, i) => `<option value="${i}">${p}</option>`).join('');

  const shift = ((state.holeIndex - state.wolfOrderShiftBase) % NUM_PLAYERS + NUM_PLAYERS) % NUM_PLAYERS;
  const teeOrder = state.wolfOrder.slice(shift).concat(state.wolfOrder.slice(0, shift));
  const suggested = teeOrder[0];
  const existing = state.wolfHoles[hole];
  wolfSel.value = existing ? existing.wolf : suggested;
  document.getElementById('wolfOrderHint').innerHTML = `<b>Hole ${hole} tee order:</b><br>` +
    teeOrder.map((p, i) => `${i + 1}. ${state.players[p]}${i === 0 ? ' (wolf)' : ''}`).join('<br>');

  updateWolfPartnerOptions();
  document.getElementById('wolfMode').value = existing ? existing.mode : 'partner';
  toggleWolfPartnerVisibility();
  if (existing && existing.partner !== null && existing.partner !== undefined) {
    document.getElementById('wolfPartner').value = existing.partner;
  }
  updateRoundBar();
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
}
document.getElementById('wolfPlayer').addEventListener('change', updateWolfPartnerOptions);
document.getElementById('wolfMode').addEventListener('change', toggleWolfPartnerVisibility);

function randomizeDaytonaForHole(hole) {
  const idxs = state.players.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  state.dayHoles[hole] = { teamOf2: idxs.slice(0, 2), teamOf3: idxs.slice(2, 5) };
}

document.getElementById('teeShotContinueBtn').addEventListener('click', () => {
  const hole = activeHole();
  const wolf = Number(document.getElementById('wolfPlayer').value);
  const mode = document.getElementById('wolfMode').value;
  const partner = mode === 'partner' ? Number(document.getElementById('wolfPartner').value) : null;
  state.pendingWolf = { wolf, mode, partner };
  if (!state.dayHoles[hole] || !state.dayHoles[hole].teamOf2) {
    randomizeDaytonaForHole(hole);
  }
  saveState();
  prepareEnterScoresScreen();
  showScreen('scrEnterScores');
});

/* ---------- Enter Scores ---------- */
function prepareEnterScoresScreen() {
  const hole = activeHole();
  const course = activeCourse();
  document.getElementById('enterScoresTitle').textContent = `Hole ${hole} — Enter Scores${state.editingHole ? ' (Editing)' : ''}`;
  document.getElementById('holeParHint').textContent = `Par ${course.holes[hole - 1].par}, Stroke Index ${course.holes[hole - 1].si}`;

  const pw = state.pendingWolf || {};
  const isPartner = pw.mode === 'partner';
  const wolfTeamNames = isPartner
    ? `${state.players[pw.wolf]} & ${state.players[pw.partner]}`
    : `${state.players[pw.wolf]} (lone wolf)`;
  const oppNames = state.players.filter((_, i) => i !== pw.wolf && (!isPartner || i !== pw.partner)).join(', ');
  document.getElementById('wolfTeamsRef').innerHTML = `<b>Wolf:</b> ${wolfTeamNames} vs ${oppNames}`;

  const day = state.dayHoles[hole];
  if (day) {
    document.getElementById('daytonaTeamsRef').innerHTML = `<b>Daytona:</b> ${day.teamOf2.map(i => state.players[i]).join(' & ')} (2) vs ${day.teamOf3.map(i => state.players[i]).join(', ')} (3, every 2-man combo played)`;
  }

  document.getElementById('holeTrashALabel').childNodes[0].textContent = isPartner
    ? 'Trash won by small team (wolf + partner) '
    : 'Trash won by wolf ';
  document.getElementById('holeTrashBLabel').childNodes[0].textContent = isPartner
    ? 'Trash won by big team (other 3) '
    : 'Trash won by the other 4 ';

  const existingHole = state.holes[hole];
  const grid = document.getElementById('holeScores');
  grid.innerHTML = state.players.map((p, i) => `
    <div>
      <label for="holeScore${i}">${p}</label>
      <input type="text" inputmode="numeric" pattern="[0-9]*" id="holeScore${i}" value="${existingHole && existingHole.scores[i] !== undefined ? existingHole.scores[i] : ''}">
    </div>
  `).join('');

  const existingWolfHole = state.wolfHoles[hole];
  document.getElementById('wolfHammers').value = existingWolfHole ? (existingWolfHole.hammers || 0) : 0;
  document.getElementById('holeTrashA').value = existingWolfHole ? (existingWolfHole.trashA || 0) : 0;
  document.getElementById('holeTrashB').value = existingWolfHole ? (existingWolfHole.trashB || 0) : 0;

  updateRoundBar();
}

document.getElementById('submitHoleBtn').addEventListener('click', () => {
  const hole = activeHole();
  const scores = {};
  let missing = false;
  state.players.forEach((_, i) => {
    const v = document.getElementById(`holeScore${i}`).value;
    if (v === '') missing = true;
    scores[i] = v;
  });
  if (missing) { alert('Enter gross scores for all 5 players.'); return; }

  state.holes[hole] = { scores };
  const pw = state.pendingWolf || { wolf: 0, mode: 'partner', partner: 1 };
  const hammers = Number(document.getElementById('wolfHammers').value) || 0;
  const trashA = Number(document.getElementById('holeTrashA').value) || 0;
  const trashB = Number(document.getElementById('holeTrashB').value) || 0;
  state.wolfHoles[hole] = { wolf: pw.wolf, mode: pw.mode, partner: pw.partner, hammers, trashA, trashB };
  state.editingHole = null;
  saveState();
  prepareHoleSummary(hole);
  showScreen('scrHoleSummary');
});

/* ---------- Wolf math ---------- */
function computeWolfHole(hole, data) {
  const { wolf, mode, partner, hammers, trashA, trashB } = data;
  const scores = state.holes[hole].scores;
  const nets = state.players.map((_, i) => netScore(i, hole, scores[i]));
  const par = activeCourse().holes[hole - 1].par;

  let teamA, teamB, isPartner;
  if (mode === 'partner') {
    teamA = [wolf, partner];
    teamB = state.players.map((_, i) => i).filter(i => i !== wolf && i !== partner);
    isPartner = true;
  } else {
    teamA = [wolf];
    teamB = state.players.map((_, i) => i).filter(i => i !== wolf);
    isPartner = false;
  }

  const aBest = Math.min(...teamA.map(i => nets[i]));
  const bBest = Math.min(...teamB.map(i => nets[i]));

  const birdieCount = state.players.reduce((count, _, i) => Number(scores[i]) <= par - 1 ? count + 1 : count, 0);
  const multiplier = Math.pow(2, hammers) * Math.pow(2, birdieCount);

  const wolfPayouts = state.players.map(() => 0);
  const trashPayouts = state.players.map(() => 0);
  let tie = (aBest === bBest);
  let winners = [], losers = [];

  if (isPartner) {
    const rateA = state.bets.smallStake * multiplier;
    const rateB = state.bets.bigStake * multiplier;
    if (!tie) {
      if (aBest < bBest) { winners = teamA; losers = teamB; }
      else { winners = teamB; losers = teamA; }
      teamA.forEach(i => { wolfPayouts[i] += (winners === teamA ? rateA : -rateA); });
      teamB.forEach(i => { wolfPayouts[i] += (winners === teamB ? rateB : -rateB); });
    }
    for (let k = 0; k < trashA; k++) {
      teamA.forEach(i => { trashPayouts[i] += state.bets.trashSmall; });
      teamB.forEach(i => { trashPayouts[i] -= state.bets.trashBig; });
    }
    for (let k = 0; k < trashB; k++) {
      teamB.forEach(i => { trashPayouts[i] += state.bets.trashBig; });
      teamA.forEach(i => { trashPayouts[i] -= state.bets.trashSmall; });
    }
  } else {
    const rate = state.bets.bigStake * multiplier;
    if (!tie) {
      if (aBest < bBest) { winners = teamA; losers = teamB; }
      else { winners = teamB; losers = teamA; }
      winners.forEach(w => { wolfPayouts[w] += rate * losers.length; });
      losers.forEach(l => { wolfPayouts[l] -= rate * winners.length; });
    }
    for (let k = 0; k < trashA; k++) {
      teamA.forEach(w => { trashPayouts[w] += state.bets.trashBig * teamB.length; });
      teamB.forEach(l => { trashPayouts[l] -= state.bets.trashBig; });
    }
    for (let k = 0; k < trashB; k++) {
      teamB.forEach(w => { trashPayouts[w] += state.bets.trashBig; });
      teamA.forEach(l => { trashPayouts[l] -= state.bets.trashBig * teamB.length; });
    }
  }

  const payouts = state.players.map((_, i) => wolfPayouts[i] + trashPayouts[i]);

  return { nets, teamA, teamB, aBest, bBest, tie, winners, losers, multiplier, payouts, wolfPayouts, trashPayouts, birdieCount, isPartner };
}

function formatWolfHoleResult(hole, data) {
  const r = computeWolfHole(hole, data);
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
  const wolfPayoutLine = state.players.map((p, i) => `${p} ${fmtMoney(r.wolfPayouts[i])}`).join(', ');
  const trashPayoutLine = state.players.map((p, i) => `${p} ${fmtMoney(r.trashPayouts[i])}`).join(', ');
  const totalPayoutLine = state.players.map((p, i) => `${p} ${fmtMoney(r.payouts[i])}`).join(', ');
  return `<div class="result-row"><b>Hole ${hole}</b>: ${wolfName} is wolf ${modeLabel}<br>${outcome}${trashNote}<br><span class="hint">Wolf: ${wolfPayoutLine}</span><br><span class="hint">Trash: ${trashPayoutLine}</span><br><span class="hint">Total: ${totalPayoutLine}</span></div>`;
}

/* ---------- Daytona math ---------- */
// The 2-man team's number is fixed for the hole. Instead of the 3-man team dropping
// its middle score, the 2-man team plays each of the three possible 2-man pairings
// from the 3-man team as a separate mini-match, and the payouts from all three sum up.
function computeDaytonaHole(hole, data) {
  const scores = state.holes[hole].scores;
  const nets = state.players.map((_, i) => netScore(i, hole, scores[i]));
  const par = activeCourse().holes[hole - 1].par;
  const isBirdie = i => Number(scores[i]) <= par - 1;
  const rate = state.bets.daytonaPointValue;

  const [a1, a2] = data.teamOf2;
  const teamAnets = [nets[a1], nets[a2]].sort((x, y) => x - y);
  const teamABirdied = data.teamOf2.some(isBirdie);

  const [b1, b2, b3] = data.teamOf3;
  const combos = [[b1, b2], [b1, b3], [b2, b3]];

  const payouts = state.players.map(() => 0);
  const games = combos.map(pair => {
    const pairBirdied = pair.some(isBirdie);
    let numA = teamAnets[0] * 10 + teamAnets[1];
    let flippedA = false;
    if (pairBirdied) { numA = teamAnets[1] * 10 + teamAnets[0]; flippedA = true; }

    const pairNets = [nets[pair[0]], nets[pair[1]]].sort((x, y) => x - y);
    let numB = pairNets[0] * 10 + pairNets[1];
    let flippedB = false;
    if (teamABirdied) { numB = pairNets[1] * 10 + pairNets[0]; flippedB = true; }

    const diff = Math.abs(numA - numB);
    const gamePayouts = state.players.map(() => 0);
    let money = 0;
    // Each losing player pays the full point differential individually; winners split that pot evenly.
    if (numA < numB) {
      money = diff * rate * pair.length;
      pair.forEach(i => { gamePayouts[i] -= diff * rate; payouts[i] -= diff * rate; });
      data.teamOf2.forEach(i => { gamePayouts[i] += money / data.teamOf2.length; payouts[i] += money / data.teamOf2.length; });
    } else if (numB < numA) {
      money = diff * rate * data.teamOf2.length;
      data.teamOf2.forEach(i => { gamePayouts[i] -= diff * rate; payouts[i] -= diff * rate; });
      pair.forEach(i => { gamePayouts[i] += money / pair.length; payouts[i] += money / pair.length; });
    }

    return { pair, numA, numB, diff, money, flippedA, flippedB, payouts: gamePayouts };
  });

  return { nets, rate, games, payouts };
}

function formatDaytonaHoleResult(hole, data) {
  const r = computeDaytonaHole(hole, data);
  const teamAName = data.teamOf2.map(i => state.players[i]).join(' & ');
  const teamBName = data.teamOf3.map(i => state.players[i]).join(', ');
  const gamesHtml = r.games.map(g => {
    const pairName = g.pair.map(i => state.players[i]).join(' & ');
    let outcome;
    if (g.numA === g.numB) outcome = `Push — both ${g.numA}.`;
    else if (g.numA < g.numB) outcome = `<span class="win-text">${teamAName} win $${Math.round(g.money)}</span> (${g.numA} vs ${g.numB}, $${r.rate}/pt)`;
    else outcome = `<span class="win-text">${pairName} win $${Math.round(g.money)}</span> (${g.numB} vs ${g.numA}, $${r.rate}/pt)`;
    const flipNote = [
      g.flippedA ? `${pairName} birdied — ${teamAName}'s number flipped` : '',
      g.flippedB ? `${teamAName} birdied — ${pairName}'s number flipped` : ''
    ].filter(Boolean).join('; ');
    const involved = data.teamOf2.concat(g.pair);
    const gamePayoutLine = involved.map(i => `${state.players[i]} ${fmtMoney(g.payouts[i])}`).join(', ');
    return `<div class="hint"><b>${teamAName} vs ${pairName}:</b> ${outcome}${flipNote ? ` (${flipNote})` : ''}<br>${gamePayoutLine}</div>`;
  }).join('');
  const payoutLine = state.players.map((p, i) => `${p} ${fmtMoney(r.payouts[i])}`).join(', ');
  return `<div class="result-row"><b>Hole ${hole}</b>: ${teamAName} (2) vs ${teamBName} (3, every 2-man combo played)<br>${gamesHtml}<br><span class="hint">${payoutLine}</span></div>`;
}

/* ---------- Match Play math ---------- */
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
function holeMatchResults(hole) {
  const pairs = allPairs();
  const data = state.holes[hole];
  const nets = state.players.map((_, i) => netScore(i, hole, data.scores[i]));
  return pairs.map(([i, j]) => {
    let winner = null;
    if (nets[i] < nets[j]) winner = i;
    else if (nets[j] < nets[i]) winner = j;
    return { i, j, winner };
  });
}
function renderMatchplay(targetId) {
  const status = computeMatchStatuses();
  const rowDiff = (r, c) => {
    const i = Math.min(r, c), j = Math.max(r, c);
    const s = status[`${i}-${j}`].diff;
    return r === i ? s : -s;
  };
  const header = `<tr><th>Player is up</th>${state.players.map(p => `<th>${p}</th>`).join('')}</tr>`;
  const rows = state.players.map((p, r) => {
    const cells = state.players.map((_, c) => {
      if (r === c) return `<td class="mp-diag"></td>`;
      const d = rowDiff(r, c);
      if (d === 0) return `<td>AS</td>`;
      const cls = d > 0 ? 'money-pos' : 'money-neg';
      const text = d > 0 ? `${d} up` : `${-d} dn`;
      return `<td class="${cls}">${text}</td>`;
    }).join('');
    return `<tr><th>${p}</th>${cells}</tr>`;
  }).join('');
  document.getElementById(targetId).innerHTML = `<div class="table-scroll"><table class="totals-table mp-grid"><thead>${header}</thead><tbody>${rows}</tbody></table></div>`;
}

/* ---------- Money Summary ---------- */
function renderSummary(targetId) {
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

  const totalSums = state.players.map((_, i) => wolfSums[i] + daySums[i]);

  const rows = state.players.map((p, i) => `
    <tr>
      <td>${p}</td>
      <td>${fmtMoney(wolfSums[i])}</td>
      <td>${fmtMoney(daySums[i])}</td>
      <td><b>${fmtMoney(totalSums[i])}</b></td>
    </tr>
  `).join('');

  document.getElementById(targetId).innerHTML = `
    <table class="totals-table">
      <thead><tr><th>Player</th><th>Wolf</th><th>Daytona</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ---------- Super Wolf (last 3 holes) ---------- */
function computeMoneyTotals() {
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
  return state.players.map((_, i) => wolfSums[i] + daySums[i]);
}

let pendingSuperWolfOrder = null;

function prepareSuperWolfScreen() {
  const hole = state.currentHole;
  document.getElementById('superWolfTitle').textContent = `Hole ${hole} — Super Wolf`;
  const totals = computeMoneyTotals();
  const order = state.players.map((_, i) => i).sort((a, b) => totals[a] - totals[b]);
  pendingSuperWolfOrder = order;
  document.getElementById('superWolfOrderList').innerHTML = `<b>New tee order for Hole ${hole} (most $ down first, most $ up last):</b><br>` +
    order.map((p, i) => `${i + 1}. ${state.players[p]} ${fmtMoney(totals[p])}${i === 0 ? ' — Super Wolf, sets new bets' : ''}`).join('<br>');
  document.getElementById('swSmallStake').value = state.bets.smallStake;
  document.getElementById('swBigStake').value = state.bets.bigStake;
  document.getElementById('swTrashSmall').value = state.bets.trashSmall;
  document.getElementById('swTrashBig').value = state.bets.trashBig;
  document.getElementById('swDaytonaPointValue').value = state.bets.daytonaPointValue;
  updateRoundBar();
}

document.getElementById('superWolfContinueBtn').addEventListener('click', () => {
  state.bets.smallStake = Number(document.getElementById('swSmallStake').value) || 0;
  state.bets.bigStake = Number(document.getElementById('swBigStake').value) || 0;
  state.bets.trashSmall = Number(document.getElementById('swTrashSmall').value) || 0;
  state.bets.trashBig = Number(document.getElementById('swTrashBig').value) || 0;
  state.bets.daytonaPointValue = Number(document.getElementById('swDaytonaPointValue').value) || 0;
  state.wolfOrder = pendingSuperWolfOrder;
  state.wolfOrderShiftBase = state.holeIndex;
  saveState();
  prepareTeeShotScreen();
  showScreen('scrTeeShot');
});

/* ---------- Hole Summary screen ---------- */
function prepareHoleSummary(hole) {
  document.getElementById('holeSummaryTitle').textContent = `Hole ${hole} Summary`;
  document.getElementById('holeSummaryWolf').innerHTML = formatWolfHoleResult(hole, state.wolfHoles[hole]);
  document.getElementById('holeSummaryDaytona').innerHTML = formatDaytonaHoleResult(hole, state.dayHoles[hole]);

  const results = holeMatchResults(hole);
  document.getElementById('holeSummaryMatches').innerHTML = results.map(r => {
    const nameA = state.players[r.i], nameB = state.players[r.j];
    const text = r.winner === null ? 'Halved' : `${state.players[r.winner]} wins the hole`;
    return `<div class="match-card"><b>${nameA} vs ${nameB}</b>: ${text}</div>`;
  }).join('');
  updateRoundBar();
}

document.getElementById('viewStandingsBtn').addEventListener('click', () => {
  prepareStandings();
  showScreen('scrStandings');
});

document.getElementById('editHoleBtn').addEventListener('click', () => {
  const hole = Number(document.getElementById('editHoleInput').value) || 1;
  if (hole < 1 || hole > 18 || !holeHasScores(hole)) { alert('That hole has not been played yet.'); return; }
  state.editingHole = hole;
  saveState();
  prepareTeeShotScreen();
  showScreen('scrTeeShot');
});

function prepareStandings() {
  renderSummary('standingsSummary');
  renderMatchplay('standingsMatches');
  renderScoreTotals('standingsScores');
  const roundComplete = state.holeIndex >= 17;
  document.getElementById('roundCompleteMsg').style.display = roundComplete ? 'block' : 'none';
  document.getElementById('nextHoleBtn').style.display = roundComplete ? 'none' : 'block';
}

function renderScoreTotals(targetId) {
  const frontHoles = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const backHoles = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  const cellFor = (h, i) => {
    const hd = state.holes[h];
    return hd && hd.scores[i] !== undefined && hd.scores[i] !== '' ? hd.scores[i] : '';
  };
  const rowHtml = h => `<tr><td>${h}</td>${state.players.map((_, i) => `<td>${cellFor(h, i)}</td>`).join('')}</tr>`;
  const sumFor = (holes, i) => holes.reduce((s, h) => s + Number(state.holes[h].scores[i]), 0);
  const outComplete = frontHoles.every(holeHasScores);
  const inComplete = backHoles.every(holeHasScores);
  const totalRowHtml = (label, holes, complete) =>
    `<tr><td><b>${label}</b></td>${state.players.map((_, i) => `<td><b>${complete ? sumFor(holes, i) : ''}</b></td>`).join('')}</tr>`;
  document.getElementById(targetId).innerHTML = `
    <div class="table-scroll">
      <table class="totals-table sc-grid">
        <thead><tr><th>Hole</th>${state.players.map(p => `<th>${p}</th>`).join('')}</tr></thead>
        <tbody>
          ${frontHoles.map(rowHtml).join('')}
          ${totalRowHtml('Out', frontHoles, outComplete)}
          ${backHoles.map(rowHtml).join('')}
          ${totalRowHtml('In', backHoles, inComplete)}
          ${totalRowHtml('Total', frontHoles.concat(backHoles), outComplete && inComplete)}
        </tbody>
      </table>
    </div>
  `;
}

document.getElementById('standingsLink').addEventListener('click', () => {
  prepareStandings();
  showScreen('scrStandings');
});

document.getElementById('nextHoleBtn').addEventListener('click', () => {
  if (state.holeIndex >= 17) return;
  state.holeIndex += 1;
  state.currentHole = ((state.startHole - 1 + state.holeIndex) % 18) + 1;
  state.pendingWolf = null;
  saveState();
  if (state.superWolfEnabled && [15, 16, 17].includes(state.holeIndex)) {
    prepareSuperWolfScreen();
    showScreen('scrSuperWolf');
  } else {
    prepareTeeShotScreen();
    showScreen('scrTeeShot');
  }
});

/* ---------- Full Data (old tabs, view/edit fallback) ---------- */
document.getElementById('fullDataLink').addEventListener('click', () => {
  document.getElementById('tabs').style.display = 'flex';
  switchTab('setup');
});
document.getElementById('closeFullData').addEventListener('click', () => {
  document.getElementById('tabs').style.display = 'none';
  showScreen('scrTeeShot');
  prepareTeeShotScreen();
});
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn || btn.id === 'closeFullData') return;
  switchTab(btn.dataset.tab);
});
function switchTab(tabId) {
  document.querySelectorAll('#tabs .tab').forEach(t => t.classList.remove('active'));
  const btn = document.querySelector(`#tabs .tab[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');
  showScreen(tabId);
  renderFullData();
}
function renderFullData() {
  document.getElementById('setupCourseName').textContent = `Course: ${activeCourse().name}`;
  document.getElementById('setupBetSummary').textContent = `Wolf: $${state.bets.smallStake}/$${state.bets.bigStake} (small/big team). Trash: $${state.bets.trashSmall}/$${state.bets.trashBig}. Daytona: $${state.bets.daytonaPointValue}/pt. Match Play: status only, no $.`;

  renderScorecardInputs();
  renderScorecardSummary();

  const wolfHoles = Object.keys(state.wolfHoles).map(Number).filter(h => holeHasScores(h)).sort((a, b) => a - b);
  document.getElementById('wolfResults').innerHTML = wolfHoles.length
    ? wolfHoles.map(h => formatWolfHoleResult(h, state.wolfHoles[h])).join('')
    : '<p class="hint">No holes recorded yet.</p>';
  const wolfOnlySums = state.players.map(() => 0);
  const trashSums = state.players.map(() => 0);
  wolfHoles.forEach(h => {
    const r = computeWolfHole(h, state.wolfHoles[h]);
    r.wolfPayouts.forEach((p, i) => wolfOnlySums[i] += p);
    r.trashPayouts.forEach((p, i) => trashSums[i] += p);
  });
  const fmt = v => `<td>${fmtMoney(v)}</td>`;
  document.getElementById('wolfTotals').innerHTML = `<table class="totals-table"><thead><tr><th>Player</th><th>Wolf</th><th>Trash</th><th>Total</th></tr></thead><tbody>${
    state.players.map((p, i) => `<tr><td>${p}</td>${fmt(wolfOnlySums[i])}${fmt(trashSums[i])}${fmt(wolfOnlySums[i] + trashSums[i])}</tr>`).join('')
  }</tbody></table>`;

  const dayHoles = Object.keys(state.dayHoles).map(Number).filter(h => state.dayHoles[h].teamOf2 && holeHasScores(h)).sort((a, b) => a - b);
  document.getElementById('dayResults').innerHTML = dayHoles.length
    ? dayHoles.map(h => formatDaytonaHoleResult(h, state.dayHoles[h])).join('')
    : '<p class="hint">No holes recorded yet.</p>';
  const daySums = state.players.map(() => 0);
  dayHoles.forEach(h => { computeDaytonaHole(h, state.dayHoles[h]).payouts.forEach((p, i) => daySums[i] += p); });
  document.getElementById('dayTotals').innerHTML = `<table class="totals-table">${state.players.map((p, i) => `<tr><td>${p}</td><td>${fmtMoney(daySums[i])}</td></tr>`).join('')}</table>`;

  renderMatchplay('mpMatches');
  renderSummary('summaryTable');
}

function renderScorecardInputs() {
  const hole = Number(document.getElementById('scHole').value) || 1;
  const existing = state.holes[hole];
  document.getElementById('scPar').textContent = `Par ${activeCourse().holes[hole - 1].par}, Stroke Index ${activeCourse().holes[hole - 1].si}`;
  const grid = document.getElementById('scScores');
  grid.innerHTML = state.players.map((p, i) => `
    <div>
      <label for="scScore${i}">${p}</label>
      <input type="text" inputmode="numeric" pattern="[0-9]*" id="scScore${i}" value="${existing && existing.scores[i] !== undefined ? existing.scores[i] : ''}">
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
  renderFullData();
});
function renderScorecardSummary() {
  const holes = Object.keys(state.holes).map(Number).filter(holeHasScores).sort((a, b) => a - b);
  const el = document.getElementById('scSummary');
  if (holes.length === 0) { el.innerHTML = '<p class="hint">No holes entered yet.</p>'; return; }
  el.innerHTML = `<table class="totals-table"><thead><tr><th>Hole</th>${state.players.map(p => `<th>${p}</th>`).join('')}</tr></thead><tbody>${
    holes.map(h => `<tr><td>${h}</td>${state.players.map((_, i) => `<td>${state.holes[h].scores[i]}</td>`).join('')}</tr>`).join('')
  }</tbody></table>`;
}

document.getElementById('resetRound').addEventListener('click', () => {
  if (!confirm('This clears all scores, teams, and results for the round (course library and players stay). Continue?')) return;
  const names = state.players, handicapIndex = state.handicapIndex, playerTeeIdx = state.playerTeeIdx;
  const playerRosterId = state.playerRosterId, roster = state.roster;
  const courses = state.courses, activeCourseId = state.activeCourseId, bets = state.bets;
  state = {
    players: names, handicapIndex, playerTeeIdx, playerRosterId, roster, courses, activeCourseId, bets,
    holes: {}, wolfHoles: {}, dayHoles: {}, roundStarted: false, currentHole: 1, startHole: 1, holeIndex: 0, wolfOrderShiftBase: 0, wolfOrder: [0, 1, 2, 3, 4], pendingWolf: null, superWolfEnabled: false, editingHole: null
  };
  saveState();
  document.getElementById('tabs').style.display = 'none';
  updateRoundBar();
  showScreen('home');
});

document.getElementById('newRoundLink').addEventListener('click', () => {
  document.getElementById('resetRound').click();
});

/* ---------- Initial load ---------- */
updateRoundBar();
if (state.roundStarted) {
  prepareTeeShotScreen();
  showScreen('scrTeeShot');
} else {
  showScreen('home');
}
