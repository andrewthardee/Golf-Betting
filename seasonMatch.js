/* ---------- Season Match Play: Hardee vs Steve (continuous, all year) ---------- */
const SM_STORAGE_KEY = 'fairwayStakesSeasonMatch';
const SM_MY_NAME = 'Hardee';
const SM_OPP_NAME = 'Steve';

const SM_TEMPLATES = {
  lakeside_green: {
    pars: [4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 4, 3, 5, 4],
    sis:  [11, 7, 3, 17, 1, 13, 5, 15, 9, 4, 16, 8, 2, 14, 6, 18, 12, 10]
  },
  lakeside_championship: {
    pars: [4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 4, 3, 5, 4],
    sis:  [11, 7, 3, 17, 1, 13, 5, 15, 9, 4, 16, 8, 2, 14, 6, 18, 12, 10]
  },
  custom: {
    pars: Array(18).fill(4),
    sis: Array.from({length: 18}, (_, i) => i + 1)
  }
};

let smEditingId = null;

function smLoadState() {
  try {
    const raw = localStorage.getItem(SM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function smSaveState() {
  localStorage.setItem(SM_STORAGE_KEY, JSON.stringify(smState));
}

let smState = smLoadState() || { rounds: [] };
if (!smState.rounds) smState.rounds = [];

/* Seed today's Lakeside round the first time this loads, if nothing saved yet. */
if (smState.rounds.length === 0 && !smState.seeded) {
  const t = SM_TEMPLATES.lakeside_green;
  smState.rounds.push({
    id: 'seed_1',
    date: '2026-08-29',
    course: 'Lakeside Golf Club',
    tees: 'Green',
    strokes: 2, // positive = I (Hardee) receive strokes from Steve
    holes: t.pars.map((par, i) => ({ par, si: t.sis[i] })),
    my: [5, 6, 9, 6, 5, 3, 5, 5, 5, 5, 6, 6, 5, 4, 5, 4, 5, 6],
    their: [5, 4, 7, 7, 6, 6, 6, 5, 6, 6, 4, 4, 5, 4, 4, 2, 7, 7]
  });
  smState.seeded = true;
  smSaveState();
}

/* ---------- Stroke allocation ---------- */
// strokes > 0 means I receive strokes; strokes < 0 means I give strokes to opponent.
function smStrokeHoles(round) {
  const n = Math.abs(round.strokes || 0);
  return round.holes
    .map((h, i) => ({ idx: i, si: Number(h.si) || (i + 1) }))
    .sort((a, b) => a.si - b.si)
    .slice(0, n)
    .map(h => h.idx);
}

function smNetScores(round) {
  const strokeHoles = smStrokeHoles(round);
  const iReceive = (round.strokes || 0) > 0;
  const iGive = (round.strokes || 0) < 0;
  return round.holes.map((h, i) => {
    let myNet = round.my[i];
    let theirNet = round.their[i];
    if (strokeHoles.includes(i)) {
      if (iReceive) myNet -= 1;
      if (iGive) theirNet -= 1;
    }
    return { myNet, theirNet };
  });
}

function smHoleResult(myNet, theirNet) {
  if (myNet === null || myNet === undefined || theirNet === null || theirNet === undefined) return null;
  if (myNet < theirNet) return 'me';
  if (theirNet < myNet) return 'them';
  return 'half';
}

/* ---------- Rendering ---------- */
function smRenderTemplateTable(templateKey) {
  const t = SM_TEMPLATES[templateKey] || SM_TEMPLATES.custom;
  const tbody = document.querySelector('#smHoleTable tbody');
  tbody.innerHTML = t.pars.map((par, i) => `
    <tr data-hole="${i}">
      <td>${i + 1}</td>
      <td><input type="number" class="sm-par" min="3" max="6" value="${par}"></td>
      <td><input type="number" class="sm-si" min="1" max="18" value="${t.sis[i]}"></td>
      <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="sm-my" placeholder="-"></td>
      <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="sm-their" placeholder="-"></td>
    </tr>
  `).join('');
}

function smUpdateStrokesCountVisibility() {
  const dir = document.getElementById('smStrokesDir').value;
  document.getElementById('smStrokesCountWrap').style.display = dir === 'none' ? 'none' : '';
}

function smReadFormRound() {
  const date = document.getElementById('smDate').value;
  const course = document.getElementById('smCourse').value.trim();
  const tees = document.getElementById('smTees').value.trim();
  const dir = document.getElementById('smStrokesDir').value;
  const count = Number(document.getElementById('smStrokesCount').value) || 0;
  const strokes = dir === 'give' ? -count : dir === 'receive' ? count : 0;

  const rows = document.querySelectorAll('#smHoleTable tbody tr');
  const holes = [];
  const my = [];
  const their = [];
  rows.forEach(row => {
    holes.push({
      par: Number(row.querySelector('.sm-par').value) || 4,
      si: Number(row.querySelector('.sm-si').value) || 1
    });
    const myVal = row.querySelector('.sm-my').value;
    const theirVal = row.querySelector('.sm-their').value;
    my.push(myVal === '' ? null : Number(myVal));
    their.push(theirVal === '' ? null : Number(theirVal));
  });

  return { date, course, tees, strokes, holes, my, their };
}

function smStrokeLabel(round) {
  if (!round.strokes) return 'Even';
  return round.strokes > 0
    ? `Received ${round.strokes} from Steve`
    : `Gave Steve ${Math.abs(round.strokes)}`;
}

function smRenderHoleByHole() {
  const el = document.getElementById('smHoleByHole');
  const rounds = smState.rounds.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (rounds.length === 0) {
    el.innerHTML = '<p class="hint">No rounds logged yet.</p>';
    return;
  }

  let running = 0; // positive = Hardee up, negative = Steve up
  let globalHoleNum = 0;
  const rowsHtml = [];

  rounds.forEach(round => {
    const nets = smNetScores(round);
    nets.forEach((n, i) => {
      globalHoleNum++;
      const result = smHoleResult(n.myNet, n.theirNet);
      if (result === 'me') running += 1;
      else if (result === 'them') running -= 1;
      const statusText = running === 0 ? 'AS' : running > 0 ? `Hardee ${running} UP` : `Steve ${Math.abs(running)} UP`;
      const played = round.my[i] !== null && round.my[i] !== undefined;
      rowsHtml.push(`
        <tr>
          <td>${globalHoleNum}</td>
          <td>${round.date || ''}</td>
          <td>${i + 1}</td>
          <td>${played ? round.my[i] : '-'}</td>
          <td>${played ? round.their[i] : '-'}</td>
          <td>${played ? (result === 'half' ? 'Half' : result === 'me' ? 'Hardee' : 'Steve') : '-'}</td>
          <td>${played ? statusText : '-'}</td>
        </tr>
      `);
    });
  });

  el.innerHTML = `
    <table class="totals-table sc-grid">
      <thead><tr><th>#</th><th>Date</th><th>Hole</th><th>Hardee</th><th>Steve</th><th>Won By</th><th>Running</th></tr></thead>
      <tbody>${rowsHtml.join('')}</tbody>
    </table>
  `;
}

function smRenderByRound() {
  const el = document.getElementById('smByRound');
  const rounds = smState.rounds.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (rounds.length === 0) {
    el.innerHTML = '<p class="hint">No rounds logged yet.</p>';
    return;
  }

  let cumulative = 0;
  const rowsHtml = rounds.map(round => {
    const nets = smNetScores(round);
    let meWon = 0, themWon = 0, halved = 0;
    nets.forEach(n => {
      const r = smHoleResult(n.myNet, n.theirNet);
      if (r === 'me') meWon++;
      else if (r === 'them') themWon++;
      else if (r === 'half') halved++;
    });
    cumulative += (meWon - themWon);
    const swing = meWon - themWon;
    const swingText = swing === 0 ? 'Halved' : swing > 0 ? `Hardee +${swing}` : `Steve +${Math.abs(swing)}`;
    const cumText = cumulative === 0 ? 'AS' : cumulative > 0 ? `Hardee ${cumulative} UP` : `Steve ${Math.abs(cumulative)} UP`;
    const rowHeader = `${round.date || '?'} — ${round.course || 'Unknown course'}${round.tees ? ' (' + round.tees + ' tees)' : ''} — ${smStrokeLabel(round)}`;
    return `
      <tr data-id="${round.id}">
        <th style="text-align:left; white-space:normal;">${rowHeader}</th>
        <td>${meWon}-${themWon}-${halved}</td>
        <td>${swingText}</td>
        <td>${cumText}</td>
        <td><button type="button" class="sm-edit-btn secondary-btn" data-id="${round.id}" style="margin:0; padding:0.4rem 0.6rem; width:auto;">Edit</button></td>
      </tr>
    `;
  });

  el.innerHTML = `
    <table class="totals-table sc-grid">
      <thead><tr><th>Round</th><th>Holes (Hardee-Steve-Half)</th><th>Round Swing</th><th>Cumulative</th><th></th></tr></thead>
      <tbody>${rowsHtml.join('')}</tbody>
    </table>
  `;

  document.querySelectorAll('.sm-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => smStartEdit(btn.dataset.id));
  });
}

function smRenderOverallStatus() {
  const el = document.getElementById('smOverallStatus');
  const rounds = smState.rounds;
  if (rounds.length === 0) {
    el.innerHTML = '<p class="hint">No rounds logged yet.</p>';
    return;
  }
  let running = 0;
  let played = 0;
  rounds.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(round => {
    smNetScores(round).forEach((n, i) => {
      if (round.my[i] === null || round.my[i] === undefined) return;
      played++;
      const r = smHoleResult(n.myNet, n.theirNet);
      if (r === 'me') running += 1;
      else if (r === 'them') running -= 1;
    });
  });
  const statusText = running === 0 ? 'All Square' : running > 0 ? `Hardee ${running} UP` : `Steve ${Math.abs(running)} UP`;
  el.innerHTML = `<p><b>${statusText}</b> through ${played} holes across ${rounds.length} round${rounds.length === 1 ? '' : 's'}.</p>`;
}

function smRenderAll() {
  smRenderOverallStatus();
  smRenderHoleByHole();
  smRenderByRound();
}

function smResetForm() {
  smEditingId = null;
  document.getElementById('smDate').value = '';
  document.getElementById('smCourse').value = '';
  document.getElementById('smTees').value = '';
  document.getElementById('smStrokesDir').value = 'none';
  document.getElementById('smStrokesCount').value = 0;
  document.getElementById('smTemplate').value = 'lakeside_green';
  smRenderTemplateTable('lakeside_green');
  smUpdateStrokesCountVisibility();
  document.getElementById('smCancelEditBtn').style.display = 'none';
  document.getElementById('smSaveRoundBtn').textContent = 'Save Round';
}

function smStartEdit(id) {
  const round = smState.rounds.find(r => r.id === id);
  if (!round) return;
  smEditingId = id;
  document.getElementById('smDate').value = round.date || '';
  document.getElementById('smCourse').value = round.course || '';
  document.getElementById('smTees').value = round.tees || '';
  document.getElementById('smStrokesDir').value = round.strokes > 0 ? 'receive' : round.strokes < 0 ? 'give' : 'none';
  document.getElementById('smStrokesCount').value = Math.abs(round.strokes || 0);
  document.getElementById('smTemplate').value = 'custom';
  smUpdateStrokesCountVisibility();

  const tbody = document.querySelector('#smHoleTable tbody');
  tbody.innerHTML = round.holes.map((h, i) => `
    <tr data-hole="${i}">
      <td>${i + 1}</td>
      <td><input type="number" class="sm-par" min="3" max="6" value="${h.par}"></td>
      <td><input type="number" class="sm-si" min="1" max="18" value="${h.si}"></td>
      <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="sm-my" value="${round.my[i] ?? ''}"></td>
      <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="sm-their" value="${round.their[i] ?? ''}"></td>
    </tr>
  `).join('');

  document.getElementById('smCancelEditBtn').style.display = '';
  document.getElementById('smSaveRoundBtn').textContent = 'Update Round';
  document.getElementById('seasonMatch').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- Wiring ---------- */
document.getElementById('seasonMatchLink').addEventListener('click', () => {
  smResetForm();
  smRenderAll();
  showScreen('seasonMatch');
});
document.getElementById('smCloseBtn').addEventListener('click', () => {
  showScreen(state.roundStarted ? 'scrStandings' : 'home');
});
document.getElementById('smTemplate').addEventListener('change', (e) => {
  smRenderTemplateTable(e.target.value);
});
document.getElementById('smStrokesDir').addEventListener('change', smUpdateStrokesCountVisibility);
document.getElementById('smCancelEditBtn').addEventListener('click', smResetForm);

document.getElementById('smSaveRoundBtn').addEventListener('click', () => {
  const data = smReadFormRound();
  if (!data.date) { alert('Please set a date for the round.'); return; }
  if (smEditingId) {
    const round = smState.rounds.find(r => r.id === smEditingId);
    Object.assign(round, data);
  } else {
    smState.rounds.push(Object.assign({ id: 'r_' + Date.now() }, data));
  }
  smSaveState();
  smResetForm();
  smRenderAll();
});

smRenderTemplateTable('lakeside_green');
smUpdateStrokesCountVisibility();
