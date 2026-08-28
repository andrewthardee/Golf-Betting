/* ---------- State ---------- */
const NUM_PLAYERS = 5;
const STORAGE_KEY = 'fairwayStakesRound';

const defaultCourse = Array.from({length: 18}, (_, i) => ({ par: 4, si: i + 1 }));

let state = loadState() || {
  players: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5'],
  handicaps: [0, 0, 0, 0, 0],
  course: defaultCourse,
  bets: { wolfUnit: 1, vegasUnit: 1, matchUnit: 1 },
  wolfHoles: {},
  vegasHoles: {},
  mpHoles: {}
};

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

  document.getElementById('wolfUnit').value = state.bets.wolfUnit;
  document.getElementById('vegasUnit').value = state.bets.vegasUnit;
  document.getElementById('matchUnit').value = state.bets.matchUnit;
}
document.getElementById('wolfUnit').addEventListener('input', e => { state.bets.wolfUnit = Number(e.target.value) || 0; saveState(); });
document.getElementById('vegasUnit').addEventListener('input', e => { state.bets.vegasUnit = Number(e.target.value) || 0; saveState(); });
document.getElementById('matchUnit').addEventListener('input', e => { state.bets.matchUnit = Number(e.target.value) || 0; saveState(); });

document.getElementById('resetRound').addEventListener('click', () => {
  if (!confirm('This clears all scores, teams, and results for the round. Continue?')) return;
  const names = state.players, hcps = state.handicaps, course = state.course, bets = state.bets;
  state = { players: names, handicaps: hcps, course, bets, wolfHoles: {}, vegasHoles: {}, mpHoles: {} };
  saveState();
  renderAll();
});

/* ---------- WOLF ---------- */
function wolfOrderForHole(hole) {
  // Simple rotation: wolf order cycles through players 0..4 based on hole number
  return (hole - 1) % NUM_PLAYERS;
}

function renderWolfInputs() {
  const hole = Number(document.getElementById('wolfHole').value) || 1;
  const wolfSel = document.getElementById('wolfPlayer');
  const partnerSel = document.getElementById('wolfPartner');
  wolfSel.innerHTML = state.players.map((p, i) => `<option value="${i}">${p}</option>`).join('');

  const suggested = wolfOrderForHole(hole);
  const existing = state.wolfHoles[hole];
  wolfSel.value = existing ? existing.wolf : suggested;
  document.getElementById('wolfOrderHint').textContent = `Suggested rotation: ${state.players[suggested]} is wolf this hole.`;

  updateWolfPartnerOptions();
  document.getElementById('wolfMode').value = existing ? existing.mode : 'partner';
  document.getElementById('wolfHammers').value = existing ? existing.hammers : 0;
  toggleWolfPartnerVisibility();

  const grid = document.getElementById('wolfScores');
  grid.innerHTML = state.players.map((p, i) => `
    <div>
      <label for="wolfScore${i}">${p}</label>
      <input type="number" id="wolfScore${i}" min="1" value="${existing && existing.scores[i] !== undefined ? existing.scores[i] : ''}">
    </div>
  `).join('');

  if (existing && existing.partner !== null && existing.partner !== undefined) {
    partnerSel.value = existing.partner;
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
}
document.getElementById('wolfHole').addEventListener('input', renderWolfInputs);
document.getElementById('wolfPlayer').addEventListener('change', updateWolfPartnerOptions);
document.getElementById('wolfMode').addEventListener('change', toggleWolfPartnerVisibility);

document.getElementById('wolfSubmit').addEventListener('click', () => {
  const hole = Number(document.getElementById('wolfHole').value) || 1;
  const wolf = Number(document.getElementById('wolfPlayer').value);
  const mode = document.getElementById('wolfMode').value;
  const partner = mode === 'partner' ? Number(document.getElementById('wolfPartner').value) : null;
  const hammers = Number(document.getElementById('wolfHammers').value) || 0;
  const scores = {};
  let missing = false;
  state.players.forEach((_, i) => {
    const v = document.getElementById(`wolfScore${i}`).value;
    if (v === '') missing = true;
    scores[i] = v;
  });
  if (missing) { alert('Enter gross scores for all 5 players.'); return; }

  state.wolfHoles[hole] = { wolf, mode, partner, hammers, scores };
  saveState();
  renderWolf();
});

function computeWolfHole(hole, data) {
  const { wolf, mode, partner, hammers, scores } = data;
  const nets = state.players.map((_, i) => netScore(i, hole, scores[i]));
  const par = state.course[hole - 1].par;

  let team, opp;
  if (mode === 'partner') {
    team = [wolf, partner];
    opp = state.players.map((_, i) => i).filter(i => i !== wolf && i !== partner);
  } else {
    team = [wolf];
    opp = state.players.map((_, i) => i).filter(i => i !== wolf);
  }

  const teamBest = Math.min(...team.map(i => nets[i]));
  const oppBest = Math.min(...opp.map(i => nets[i]));

  const birdieCount = state.players.reduce((count, _, i) => Number(scores[i]) <= par - 1 ? count + 1 : count, 0);

  const isLone = mode !== 'partner';
  const betPerPair = state.bets.wolfUnit * Math.pow(2, hammers) * Math.pow(2, birdieCount) * (isLone ? 2 : 1);

  let winners, losers, tie = false;
  if (teamBest < oppBest) { winners = team; losers = opp; }
  else if (oppBest < teamBest) { winners = opp; losers = team; }
  else { tie = true; winners = []; losers = []; }

  const payouts = state.players.map(() => 0);
  if (!tie) {
    winners.forEach(w => { payouts[w] += betPerPair * losers.length; });
    losers.forEach(l => { payouts[l] -= betPerPair * winners.length; });
  }

  return { nets, team, opp, teamBest, oppBest, tie, winners, losers, betPerPair, payouts, birdieCount };
}

function renderWolf() {
  renderWolfInputs();
  const results = document.getElementById('wolfResults');
  const holes = Object.keys(state.wolfHoles).map(Number).sort((a, b) => a - b);
  if (holes.length === 0) { results.innerHTML = '<p class="hint">No holes recorded yet.</p>'; }
  else {
    results.innerHTML = holes.map(h => {
      const data = state.wolfHoles[h];
      const r = computeWolfHole(h, data);
      const wolfName = state.players[data.wolf];
      const modeLabel = data.mode === 'partner' ? `w/ ${state.players[data.partner]}` : (data.mode === 'lone' ? '(voluntary lone wolf)' : '(forced lone wolf)');
      let outcome;
      if (r.tie) outcome = `<span>Push — tied at net ${r.teamBest}.</span>`;
      else {
        const winNames = r.winners.map(i => state.players[i]).join(' & ');
        const birdieNote = r.birdieCount > 0 ? `, gross birdies: ${r.birdieCount} (bet doubled x${r.birdieCount})` : '';
        outcome = `<span class="win-text">${winNames} win $${(r.betPerPair * r.losers.length).toFixed(2)} total</span> (net ${Math.min(r.teamBest, r.oppBest)} beats ${Math.max(r.teamBest, r.oppBest)}, $${r.betPerPair.toFixed(2)}/player, hammers: ${data.hammers}${birdieNote})`;
      }
      return `<div class="result-row"><b>Hole ${h}</b>: ${wolfName} is wolf ${modeLabel}<br>${outcome}</div>`;
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

/* ---------- VEGAS ---------- */
function renderVegasInputs() {
  const hole = Number(document.getElementById('vegasHole').value) || 1;
  const existing = state.vegasHoles[hole];
  const display = document.getElementById('vegasTeamsDisplay');
  if (existing) {
    display.innerHTML = `Team A (2): <b>${existing.teamOf2.map(i => state.players[i]).join(' & ')}</b><br>Team B (3, best+worst count): <b>${existing.teamOf3.map(i => state.players[i]).join(', ')}</b>`;
  } else {
    display.textContent = 'Click "Randomize Teams" to assign teams for this hole.';
  }

  const grid = document.getElementById('vegasScores');
  grid.innerHTML = state.players.map((p, i) => `
    <div>
      <label for="vegasScore${i}">${p}</label>
      <input type="number" id="vegasScore${i}" min="1" value="${existing && existing.scores[i] !== undefined ? existing.scores[i] : ''}">
    </div>
  `).join('');
}
document.getElementById('vegasHole').addEventListener('input', renderVegasInputs);

document.getElementById('vegasRandomize').addEventListener('click', () => {
  const hole = Number(document.getElementById('vegasHole').value) || 1;
  const idxs = state.players.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  const teamOf2 = idxs.slice(0, 2);
  const teamOf3 = idxs.slice(2, 5);
  const existingScores = (state.vegasHoles[hole] && state.vegasHoles[hole].scores) || {};
  state.vegasHoles[hole] = { teamOf2, teamOf3, scores: existingScores };
  saveState();
  renderVegasInputs();
});

document.getElementById('vegasSubmit').addEventListener('click', () => {
  const hole = Number(document.getElementById('vegasHole').value) || 1;
  const existing = state.vegasHoles[hole];
  if (!existing || !existing.teamOf2) { alert('Randomize teams for this hole first.'); return; }
  const scores = {};
  let missing = false;
  state.players.forEach((_, i) => {
    const v = document.getElementById(`vegasScore${i}`).value;
    if (v === '') missing = true;
    scores[i] = v;
  });
  if (missing) { alert('Enter gross scores for all 5 players.'); return; }
  existing.scores = scores;
  saveState();
  renderVegas();
});

function computeVegasHole(hole, data) {
  const nets = state.players.map((_, i) => netScore(i, hole, data.scores[i]));
  const par = state.course[hole - 1].par;
  const isBirdie = i => Number(data.scores[i]) <= par - 1;

  const [a1, a2] = data.teamOf2;
  const teamAnets = [nets[a1], nets[a2]].sort((x, y) => x - y);
  let numA = teamAnets[0] * 10 + teamAnets[1];

  const bNets = data.teamOf3.map(i => nets[i]);
  const best = Math.min(...bNets);
  const worst = Math.max(...bNets);
  const teamBnets = [best, worst].sort((x, y) => x - y);
  let numB = teamBnets[0] * 10 + teamBnets[1];

  // Gross birdie by a team flips the OPPOSING team's number (worse arrangement for them)
  const teamABirdied = data.teamOf2.some(isBirdie);
  const teamBBirdied = data.teamOf3.some(isBirdie);
  let flippedA = false, flippedB = false;
  if (teamBBirdied) { numA = teamAnets[1] * 10 + teamAnets[0]; flippedA = true; }
  if (teamABirdied) { numB = teamBnets[1] * 10 + teamBnets[0]; flippedB = true; }

  const diff = Math.abs(numA - numB);
  const money = diff * state.bets.vegasUnit;

  const payouts = state.players.map(() => 0);
  if (numA < numB) {
    data.teamOf2.forEach(i => payouts[i] += money / data.teamOf2.length);
    data.teamOf3.forEach(i => payouts[i] -= money / data.teamOf3.length);
  } else if (numB < numA) {
    data.teamOf3.forEach(i => payouts[i] += money / data.teamOf3.length);
    data.teamOf2.forEach(i => payouts[i] -= money / data.teamOf2.length);
  }

  return { nets, numA, numB, diff, money, payouts, teamABirdied, teamBBirdied, flippedA, flippedB };
}

function renderVegas() {
  renderVegasInputs();
  const results = document.getElementById('vegasResults');
  const holes = Object.keys(state.vegasHoles).map(Number).filter(h => state.vegasHoles[h].scores && Object.keys(state.vegasHoles[h].scores).length).sort((a, b) => a - b);
  if (holes.length === 0) { results.innerHTML = '<p class="hint">No holes recorded yet.</p>'; }
  else {
    results.innerHTML = holes.map(h => {
      const data = state.vegasHoles[h];
      const r = computeVegasHole(h, data);
      const teamAName = data.teamOf2.map(i => state.players[i]).join(' & ');
      const teamBName = data.teamOf3.map(i => state.players[i]).join(', ');
      let outcome;
      if (r.numA === r.numB) outcome = `Push — both ${r.numA}.`;
      else if (r.numA < r.numB) outcome = `<span class="win-text">${teamAName} win $${r.money.toFixed(2)}</span> (${r.numA} vs ${r.numB})`;
      else outcome = `<span class="win-text">${teamBName} win $${r.money.toFixed(2)}</span> (${r.numB} vs ${r.numA})`;
      const flipNote = [
        r.flippedA ? `${teamBName} birdied — ${teamAName}'s number flipped` : '',
        r.flippedB ? `${teamAName} birdied — ${teamBName}'s number flipped` : ''
      ].filter(Boolean).join('; ');
      return `<div class="result-row"><b>Hole ${h}</b>: ${teamAName} (2) vs ${teamBName} (3)<br>${outcome}${flipNote ? `<br><span class="hint">${flipNote}</span>` : ''}</div>`;
    }).join('');
  }

  const totals = document.getElementById('vegasTotals');
  const sums = state.players.map(() => 0);
  holes.forEach(h => {
    const r = computeVegasHole(h, state.vegasHoles[h]);
    r.payouts.forEach((p, i) => sums[i] += p);
  });
  totals.innerHTML = `<table class="totals-table">${state.players.map((p, i) => `<tr><td>${p}</td><td class="${sums[i] >= 0 ? 'money-pos' : 'money-neg'}">${sums[i] >= 0 ? '+' : ''}$${sums[i].toFixed(2)}</td></tr>`).join('')}</table>`;
}

/* ---------- MATCH PLAY ---------- */
function renderMpInputs() {
  const hole = Number(document.getElementById('mpHole').value) || 1;
  const existing = state.mpHoles[hole];
  const grid = document.getElementById('mpScores');
  grid.innerHTML = state.players.map((p, i) => `
    <div>
      <label for="mpScore${i}">${p}</label>
      <input type="number" id="mpScore${i}" min="1" value="${existing && existing.scores[i] !== undefined ? existing.scores[i] : ''}">
    </div>
  `).join('');
}
document.getElementById('mpHole').addEventListener('input', renderMpInputs);

document.getElementById('mpSubmit').addEventListener('click', () => {
  const hole = Number(document.getElementById('mpHole').value) || 1;
  const scores = {};
  let missing = false;
  state.players.forEach((_, i) => {
    const v = document.getElementById(`mpScore${i}`).value;
    if (v === '') missing = true;
    scores[i] = v;
  });
  if (missing) { alert('Enter gross scores for all 5 players.'); return; }
  state.mpHoles[hole] = { scores };
  saveState();
  renderMatchplay();
});

function allPairs() {
  const pairs = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    for (let j = i + 1; j < NUM_PLAYERS; j++) pairs.push([i, j]);
  }
  return pairs;
}

function computeMatchStatuses() {
  const pairs = allPairs();
  const holes = Object.keys(state.mpHoles).map(Number).sort((a, b) => a - b);
  const status = {}; // key "i-j" -> { diff, holesPlayed }
  pairs.forEach(([i, j]) => { status[`${i}-${j}`] = { diff: 0, holesPlayed: 0 }; });

  holes.forEach(h => {
    const data = state.mpHoles[h];
    const nets = state.players.map((_, idx) => netScore(idx, h, data.scores[idx]));
    pairs.forEach(([i, j]) => {
      const key = `${i}-${j}`;
      if (nets[i] === null || nets[j] === null) return;
      status[key].holesPlayed++;
      if (nets[i] < nets[j]) status[key].diff++;
      else if (nets[j] < nets[i]) status[key].diff--;
    });
  });
  return status;
}

function renderMatchplay() {
  renderMpInputs();
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
  Object.keys(state.wolfHoles).forEach(h => {
    const r = computeWolfHole(Number(h), state.wolfHoles[h]);
    r.payouts.forEach((p, i) => wolfSums[i] += p);
  });

  const vegasSums = state.players.map(() => 0);
  Object.keys(state.vegasHoles).forEach(h => {
    const data = state.vegasHoles[h];
    if (!data.scores || !Object.keys(data.scores).length) return;
    const r = computeVegasHole(Number(h), data);
    r.payouts.forEach((p, i) => vegasSums[i] += p);
  });

  const mpSums = matchplayPayouts();

  const totalSums = state.players.map((_, i) => wolfSums[i] + vegasSums[i] + mpSums[i]);

  const rows = state.players.map((p, i) => `
    <tr>
      <td>${p}</td>
      <td class="${wolfSums[i] >= 0 ? 'money-pos' : 'money-neg'}">${wolfSums[i] >= 0 ? '+' : ''}$${wolfSums[i].toFixed(2)}</td>
      <td class="${vegasSums[i] >= 0 ? 'money-pos' : 'money-neg'}">${vegasSums[i] >= 0 ? '+' : ''}$${vegasSums[i].toFixed(2)}</td>
      <td class="${mpSums[i] >= 0 ? 'money-pos' : 'money-neg'}">${mpSums[i] >= 0 ? '+' : ''}$${mpSums[i].toFixed(2)}</td>
      <td class="${totalSums[i] >= 0 ? 'money-pos' : 'money-neg'}"><b>${totalSums[i] >= 0 ? '+' : ''}$${totalSums[i].toFixed(2)}</b></td>
    </tr>
  `).join('');

  document.getElementById('summaryTable').innerHTML = `
    <table class="totals-table">
      <thead><tr><th>Player</th><th>Wolf</th><th>Vegas</th><th>Match Play</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ---------- Render All ---------- */
function renderAll() {
  renderSetup();
  renderWolf();
  renderVegas();
  renderMatchplay();
  renderSummary();
}

renderAll();
