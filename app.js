/* ---------- State ---------- */
const NUM_PLAYERS = 5;
const STORAGE_KEY = 'fairwayStakesRound';

const defaultCourse = Array.from({length: 18}, (_, i) => ({ par: 4, si: i + 1 }));

let state = loadState() || {
  players: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5'],
  handicaps: [0, 0, 0, 0, 0],
  course: defaultCourse,
  bets: { smallStake: 15, bigStake: 10, matchUnit: 1 },
  holes: {},       // shared gross scores: { [hole]: { scores: {0..4: gross} } }
  wolfHoles: {},    // { [hole]: { wolf, mode, partner, hammers, trashA, trashB } }
  dayHoles: {}      // { [hole]: { teamOf2, teamOf3 } }
};
if (!state.bets.smallStake) state.bets.smallStake = 15;
if (!state.bets.bigStake) state.bets.bigStake = 10;
if (!state.holes) state.holes = {};
if (!state.dayHoles) state.dayHoles = {};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------- Strokes ---------- */
function strokesForPlayer(playerIdx, hole) {
  const h = Number(state.handicaps[playerIdx]) || 0;
  const si = state.course[hole - 1].si;
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
  const ptBody = document.querySelector('#playerTable tbody');
  ptBody.innerHTML = '';
  state.players.forEach((name, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" data-idx="${i}" class="playerName" value="${name}"></td>
      <td><input type="number" data-idx="${i}" class="playerHcp" value="${state.handicaps[i]}" min="0" max="54"></td>
    `;
    ptBody.appendChild(tr);
  });
  ptBody.querySelectorAll('.playerName').forEach(el => el.addEventListener('input', e => {
    state.players[e.target.dataset.idx] = e.target.value || `Player ${Number(e.target.dataset.idx)+1}`;
    saveState(); renderAll();
  }));
  ptBody.querySelectorAll('.playerHcp').forEach(el => el.addEventListener('input', e => {
    state.handicaps[e.target.dataset.idx] = Number(e.target.value) || 0;
    saveState();
  }));

  const ctBody = document.querySelector('#courseTable tbody');
  ctBody.innerHTML = '';
  state.course.forEach((h, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><input type="number" data-idx="${i}" class="holePar" value="${h.par}" min="3" max="6"></td>
      <td><input type="number" data-idx="${i}" class="holeSi" value="${h.si}" min="1" max="18"></td>
    `;
    ctBody.appendChild(tr);
  });
  ctBody.querySelectorAll('.holePar').forEach(el => el.addEventListener('input', e => {
    state.course[e.target.dataset.idx].par = Number(e.target.value) || 4;
    saveState();
  }));
  ctBody.querySelectorAll('.holeSi').forEach(el => el.addEventListener('input', e => {
    state.course[e.target.dataset.idx].si = Number(e.target.value) || 1;
    saveState();
  }));

  document.getElementById('smallStake').value = state.bets.smallStake;
  document.getElementById('bigStake').value = state.bets.bigStake;
  document.getElementById('matchUnit').value = state.bets.matchUnit;
}
document.getElementById('smallStake').addEventListener('input', e => { state.bets.smallStake = Number(e.target.value) || 0; saveState(); });
document.getElementById('bigStake').addEventListener('input', e => { state.bets.bigStake = Number(e.target.value) || 0; saveState(); });
document.getElementById('matchUnit').addEventListener('input', e => { state.bets.matchUnit = Number(e.target.value) || 0; saveState(); });

document.getElementById('resetRound').addEventListener('click', () => {
  if (!confirm('This clears all scores, teams, and results for the round. Continue?')) return;
  const names = state.players, hcps = state.handicaps, course = state.course, bets = state.bets;
  state = { players: names, handicaps: hcps, course, bets, holes: {}, wolfHoles: {}, dayHoles: {} };
  saveState();
  renderAll();
});

/* ---------- SCORECARD ---------- */
function renderScorecardInputs() {
  const hole = Number(document.getElementById('scHole').value) || 1;
  const existing = state.holes[hole];
  document.getElementById('scPar').textContent = `Par ${state.course[hole - 1].par}, Stroke Index ${state.course[hole - 1].si}`;
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
  const par = state.course[hole - 1].par;

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
  const par = state.course[hole - 1].par;
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
